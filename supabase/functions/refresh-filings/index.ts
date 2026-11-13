import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

// refresh-filings: SEC EDGAR filing index + Form 4 insider transactions.
// Free SEC APIs only. Every SEC request goes through secFetch(), which always
// sends the User-Agent header and a global rate limit.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Refresh-Secret",
};

const JOB = "edge:refresh-filings";
const FALLBACK_UA = "3xHunter research app (contact: site owner)";
const UA_SECRET = (Deno.env.get("SEC_USER_AGENT") ?? "").trim();
const USER_AGENT = UA_SECRET || FALLBACK_UA;

const RATE_PER_SEC = 8; // SEC fair-access limit is 10/s; stay under 8
const REQUEST_TIMEOUT_MS = 8000;
// Free-tier Edge workers are killed at ~2s of CPU time (HTTP 546 "CPU Time
// exceeded"), long before the 150s wall clock. Each run therefore does a small,
// bounded batch (stalest tickers first) and pg_cron calls it every 10 minutes.
const RUN_BUDGET_MS = 40_000; // stop picking up tickers past this
const HARD_STOP_MS = 50_000; // stop Form 4 fetches mid-ticker past this
const SKIP_WINDOW_MS = 8 * 60_000; // under the 10-minute pg_cron interval
const WORKERS = 2;
const DEFAULT_BATCH = 15; // 25 measured OK; 15 leaves CPU headroom
const MAX_BATCH = 25;
const FORM4_CAP = 4; // Form 4 XMLs parsed per ticker per run
const FORM4_RUN_CAP = 25; // and per run overall
// Banks file thousands of 424B2 notes a year (BAC: ~11,000). Upserting them all
// in one request was the CPU sink, so keep only the newest N per form type.
const PER_FORM_CAP = 40;
const FILINGS_CAP = 300; // per ticker per run
const STALE_RUN_MS = 15 * 60_000; // a 'running' row older than this was killed
const LOOKUP_CHUNK = 100; // accessions per PostgREST .in() query (URL length)
// A Form 4 that yields no non-derivative lines (derivative-only grant, no
// owner, 404, unparseable) is recorded in sec_form4_processed so it is not
// refetched every run. insider_transactions holds real lines only.
const DAY_MS = 86_400_000;
const FILING_LOOKBACK_DAYS = 365;
const FORM4_LOOKBACK_DAYS = 180;

const BASE_FORMS = [
  "10-K", "10-Q", "8-K", "S-1", "S-3",
  "424B1", "424B2", "424B3", "424B4", "424B5",
  "DEF 14A", "SC 13D", "SC 13G", "SCHEDULE 13D", "SCHEDULE 13G", "4",
];
const FORMS = new Set(BASE_FORMS.flatMap((f) => [f, `${f}/A`]));

// ?force=1 bypasses the skip-window guard. verify_jwt is off, so force is honored
// only with the REFRESH_FILINGS_SECRET in x-refresh-secret, or the service role
// key as the bearer token. Otherwise it is ignored (response force_ignored:true)
// and the guard applies. Cron/manual callers that need force must send one.
const FORCE_SECRET = (Deno.env.get("REFRESH_FILINGS_SECRET") ?? "").trim();
function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function forceAllowed(req: Request): boolean {
  const header = (req.headers.get("x-refresh-secret") ?? "").trim();
  if (FORCE_SECRET && safeEqual(header, FORCE_SECRET)) return true;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return safeEqual(bearer, serviceKey);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ---------- SEC HTTP layer ----------

class HaltError extends Error {}

// Simple token bucket shared by every SEC request in this isolate.
const bucket = { tokens: RATE_PER_SEC, last: Date.now() };
async function takeToken(): Promise<void> {
  for (;;) {
    const now = Date.now();
    bucket.tokens = Math.min(RATE_PER_SEC, bucket.tokens + ((now - bucket.last) / 1000) * RATE_PER_SEC);
    bucket.last = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    await sleep(Math.ceil(((1 - bucket.tokens) / RATE_PER_SEC) * 1000));
  }
}

let halted: string | null = null;
let T0 = Date.now();
const trace = (m: string) => console.log(`t+${Date.now() - T0}ms ${m}`);

async function decodeBody(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  const enc = (res.headers.get("content-encoding") ?? "").toLowerCase();
  let format: "gzip" | "deflate" | null = null;
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) format = "gzip";
  else if (enc.includes("deflate") && buf.length > 0 && buf[0] !== 0x7b && buf[0] !== 0x3c) format = "deflate";
  if (!format) return new TextDecoder().decode(buf);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream(format));
  return await new Response(stream).text();
}

/** Returns body text, null on 404, throws HaltError on 429/403, Error otherwise. */
async function secFetch(url: string): Promise<string | null> {
  if (halted) throw new HaltError(halted);
  await takeToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        // No manual Accept-Encoding: the runtime then negotiates gzip itself and
        // decompresses natively. Setting it by hand returns the raw gzip bytes.
        "User-Agent": USER_AGENT,
        "Accept": "application/json, application/xml, text/xml, */*",
      },
      signal: ctrl.signal,
    });
    if (res.status === 429 || res.status === 403) {
      await res.body?.cancel();
      halted = `sec_http_${res.status}`;
      throw new HaltError(halted);
    }
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`http_${res.status}`);
    }
    return await decodeBody(res);
  } catch (e) {
    if (e instanceof HaltError) throw e;
    if ((e as Error).name === "AbortError") throw new Error("timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- CIK map ----------

const normTicker = (t: string) => t.trim().toUpperCase().replace(/\./g, "-");
const padCik = (n: number | string) => String(n).replace(/\D/g, "").padStart(10, "0");

// CIKs come from sec_sync_state (cached from an earlier run) or the app's own
// public.securities master, queried only for this batch. Never download SEC's
// full company_tickers.json: parsing it alone burned most of the CPU budget.
async function loadBatchCiks(sb: SupabaseClient, tickers: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!tickers.length) return map;
  const variants = [...new Set(tickers.flatMap((t) => [t, t.replace(/-/g, "."), t.replace(/\./g, "-")]))];
  const { data, error } = await sb.from("securities").select("ticker,cik").in("ticker", variants).not("cik", "is", null);
  if (error) throw new Error(`securities lookup: ${error.message}`);
  for (const row of (data ?? []) as { ticker: string; cik: number | string }[]) {
    const k = normTicker(row.ticker);
    if (!map.has(k)) map.set(k, padCik(row.cik));
  }
  return map;
}

// ---------- Form 4 XML extraction (indexOf scan, tolerant of missing nodes) ----------

function codePoint(n: number, fallback: string): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : fallback;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => codePoint(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => codePoint(Number(d), m))
    .replace(/&amp;/g, "&")
    .trim();
}

// indexOf scanning (no regex backtracking over the whole document). Matches
// <name> or <name attr...>, not <nameSuffix>. limit stops after the first hit.
function tagAll(xml: string, name: string, limit = Infinity): string[] {
  const out: string[] = [];
  const open = `<${name}`;
  const close = `</${name}>`;
  let pos = 0;
  while (out.length < limit) {
    const i = xml.indexOf(open, pos);
    if (i < 0) break;
    const after = xml.charCodeAt(i + open.length);
    // '>' or whitespace ends the tag name; anything else is a longer tag name.
    if (after !== 62 && after !== 32 && after !== 9 && after !== 10 && after !== 13) {
      pos = i + open.length;
      continue;
    }
    const gt = xml.indexOf(">", i + open.length);
    if (gt < 0) break;
    if (xml.charCodeAt(gt - 1) === 47) { // self-closing <name/>
      out.push("");
      pos = gt + 1;
      continue;
    }
    const j = xml.indexOf(close, gt + 1);
    if (j < 0) break;
    out.push(xml.slice(gt + 1, j));
    pos = j + close.length;
  }
  return out;
}
const tag = (xml: string | null | undefined, name: string): string | null =>
  xml ? (tagAll(xml, name, 1)[0] ?? null) : null;
function text(xml: string | null | undefined, name: string): string | null {
  const inner = tag(xml, name);
  if (inner == null) return null;
  const v = tag(inner, "value") ?? (inner.includes("<") ? null : inner);
  if (v == null) return null;
  const s = decodeEntities(v);
  return s === "" ? null : s;
}
function num(xml: string | null | undefined, name: string): number | null {
  const s = text(xml, name);
  if (s == null) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
const isTrue = (s: string | null) => s != null && (s === "1" || s.toLowerCase() === "true");

interface InsiderRow {
  ticker: string;
  accession_no: string;
  line_no: number;
  owner_name: string;
  owner_relationship: string | null;
  transaction_date: string | null;
  transaction_code: string | null;
  acquired_disposed: "A" | "D" | null;
  shares: number | null;
  price: number | null;
  value: number | null;
  shares_owned_after: number | null;
  filing_url: string | null;
}

function parseForm4(
  xml: string,
  ticker: string,
  accession: string,
  filingUrl: string,
): { ownerName: string; rows: InsiderRow[] } {
  const owners = tagAll(xml, "reportingOwner");
  const names: string[] = [];
  const rels = new Set<string>();
  for (const o of owners) {
    const name = text(o, "rptOwnerName");
    if (name) names.push(name);
    const rel = tag(o, "reportingOwnerRelationship");
    if (isTrue(text(rel, "isDirector"))) rels.add("Director");
    if (isTrue(text(rel, "isOfficer"))) rels.add(text(rel, "officerTitle") ?? "Officer");
    if (isTrue(text(rel, "isTenPercentOwner"))) rels.add("10% owner");
    if (isTrue(text(rel, "isOther"))) rels.add(text(rel, "otherText") ?? "Other");
  }
  const ownerName = names.join("; ").slice(0, 300);
  if (!ownerName) return { ownerName, rows: [] };
  const relationship = rels.size ? [...rels].join(", ").slice(0, 200) : null;

  const table = tag(xml, "nonDerivativeTable");
  if (!table) return { ownerName, rows: [] };
  const rows = tagAll(table, "nonDerivativeTransaction").map((t, i): InsiderRow => {
    const shares = num(t, "transactionShares");
    const price = num(t, "transactionPricePerShare");
    const ad = text(t, "transactionAcquiredDisposedCode")?.toUpperCase() ?? null;
    const date = text(t, "transactionDate");
    return {
      ticker,
      accession_no: accession,
      line_no: i,
      owner_name: ownerName,
      owner_relationship: relationship,
      transaction_date: date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null,
      transaction_code: text(tag(t, "transactionCoding"), "transactionCode"),
      acquired_disposed: ad === "A" || ad === "D" ? ad : null,
      shares,
      price,
      value: shares != null && price != null ? Math.round(shares * price * 100) / 100 : null,
      shares_owned_after: num(t, "sharesOwnedFollowingTransaction"),
      filing_url: filingUrl,
    };
  });
  return { ownerName, rows };
}

// ---------- Per-ticker work ----------

interface Stats {
  tickers_processed: number;
  filings_upserted: number;
  insider_rows_upserted: number;
  form4_fetched: number;
  form4_no_lines: number;
  errors: number;
}

interface Recent {
  accessionNumber: string[];
  filingDate: string[];
  reportDate?: string[];
  form: string[];
  primaryDocument: string[];
  primaryDocDescription?: string[];
}

async function processTicker(
  sb: SupabaseClient,
  ticker: string,
  knownCik: string | null,
  runStart: number,
  stats: Stats,
  budget: { form4Left: number },
): Promise<void> {
  const now = new Date().toISOString();
  const setState = async (cik: string | null, err: string | null) => {
    const { error } = await sb.from("sec_sync_state").upsert(
      { ticker, cik, last_synced_at: now, last_error: err, updated_at: now },
      { onConflict: "ticker" },
    );
    if (error) console.error(`sec_sync_state ${ticker}: ${error.message}`);
  };

  let cik = knownCik;
  try {
    if (!cik) {
      await setState(null, "no_cik");
      stats.tickers_processed++;
      return;
    }

    const body = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
    if (!body) {
      await setState(cik, "submissions_404");
      stats.tickers_processed++;
      stats.errors++;
      return;
    }
    const recent = (JSON.parse(body)?.filings?.recent ?? null) as Recent | null; // body dropped after parse
    if (!recent || !Array.isArray(recent.accessionNumber)) throw new Error("no_recent_filings");

    const cikNum = String(Number(cik));
    const filingCutoff = isoDay(Date.now() - FILING_LOOKBACK_DAYS * DAY_MS);
    const form4Cutoff = isoDay(Date.now() - FORM4_LOOKBACK_DAYS * DAY_MS);
    const filings: Record<string, unknown>[] = [];
    const form4s: { accession: string; doc: string; url: string; filed: string }[] = [];
    const seen = new Set<string>();
    const perForm = new Map<string, number>();

    for (let i = 0; i < recent.accessionNumber.length; i++) {
      const accession = recent.accessionNumber[i];
      const form = (recent.form[i] ?? "").trim();
      const filed = recent.filingDate[i];
      if (!accession || !filed || filed < filingCutoff || !FORMS.has(form) || seen.has(accession)) continue;
      // recent[] is newest first, so the caps keep the latest filings.
      const n = perForm.get(form) ?? 0;
      if (n >= PER_FORM_CAP) continue;
      if (filings.length >= FILINGS_CAP) break;
      perForm.set(form, n + 1);
      seen.add(accession);
      const doc = recent.primaryDocument?.[i] ?? "";
      const url = doc
        ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accession.replace(/-/g, "")}/${doc}`
        : null;
      filings.push({
        ticker,
        cik,
        accession_no: accession,
        form,
        filed_at: filed,
        report_date: recent.reportDate?.[i] || null,
        primary_doc_url: url,
        description: recent.primaryDocDescription?.[i] || null,
      });
      if ((form === "4" || form === "4/A") && filed >= form4Cutoff && doc && url) {
        form4s.push({ accession, doc, url, filed });
      }
    }

    trace(`parsed ${ticker} filings=${filings.length} form4=${form4s.length}`);
    if (filings.length) {
      const { error } = await sb.from("sec_filings").upsert(filings, { onConflict: "ticker,accession_no" });
      if (error) throw new Error(`sec_filings upsert: ${error.message}`);
      stats.filings_upserted += filings.length;
    }

    // Form 4s not yet processed, newest first, capped per run. A real line in
    // insider_transactions, a marker in sec_form4_processed, or a legacy
    // sentinel (line_no -1, pre-marker table) means processed. No ticker filter: the
    // UNIQUE key is (accession_no, line_no), and share classes sharing a CIK
    // (GOOG/GOOGL) list the same accessions; the first ticker to process owns them.
    let pending = form4s;
    if (pending.length) {
      const have = new Set<string>();
      const accs = pending.map((f) => f.accession);
      for (const table of ["insider_transactions", "sec_form4_processed"]) {
        for (let i = 0; i < accs.length; i += LOOKUP_CHUNK) {
          const { data, error } = await sb
            .from(table)
            .select("accession_no")
            .in("accession_no", accs.slice(i, i + LOOKUP_CHUNK));
          if (error) throw new Error(`${table} lookup: ${error.message}`);
          for (const r of data ?? []) have.add((r as { accession_no: string }).accession_no);
        }
      }
      pending = pending
        .filter((f) => !have.has(f.accession))
        .sort((a, b) => b.filed.localeCompare(a.filed))
        .slice(0, Math.min(FORM4_CAP, Math.max(0, budget.form4Left)));
      budget.form4Left -= pending.length;
    }

    let form4Errors = 0;
    for (const f of pending) {
      if (Date.now() - runStart > HARD_STOP_MS) break;
      stats.form4_fetched++;
      const rawDoc = f.doc.replace(/^xsl[^/]*\//i, "");
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${f.accession.replace(/-/g, "")}/${rawDoc}`;
      try {
        // Deterministic outcomes (404, unparseable, zero non-derivative lines)
        // write a sec_form4_processed marker so the accession is not refetched. Transient errors
        // (timeout, 5xx, DB write failure) throw and are retried next run.
        const xml = await secFetch(xmlUrl);
        let rows: InsiderRow[] = [];
        let ownerName = "";
        let reason = xml ? "no_lines" : "not_found";
        if (xml) {
          try {
            ({ ownerName, rows } = parseForm4(xml, ticker, f.accession, f.url));
            if (!ownerName) reason = "no_owner";
          } catch (pe) {
            reason = "parse_error";
            console.error(`form4 parse ${ticker} ${f.accession}: ${(pe as Error).message}`);
          }
        }
        const { error } = rows.length
          ? await sb.from("insider_transactions").upsert(rows, { onConflict: "accession_no,line_no" })
          : await sb.from("sec_form4_processed").upsert(
            { accession_no: f.accession, ticker, reason, owner_name: ownerName || null, filing_url: f.url },
            { onConflict: "accession_no" },
          );
        if (error) throw new Error(error.message);
        if (rows.length) stats.insider_rows_upserted += rows.length;
        else stats.form4_no_lines++;
      } catch (e) {
        if (e instanceof HaltError) throw e;
        form4Errors++;
        console.error(`form4 ${ticker} ${f.accession}: ${(e as Error).message}`);
      }
    }

    await setState(cik, form4Errors ? `form4_errors:${form4Errors}` : null);
    trace(`done ${ticker}`);
    if (form4Errors) stats.errors++;
    stats.tickers_processed++;
  } catch (e) {
    if (e instanceof HaltError) {
      // Leave last_synced_at untouched so this ticker is retried first next run.
      stats.errors++;
      return;
    }
    const msg = (e as Error).message?.slice(0, 200) || "unknown_error";
    console.error(`ticker ${ticker}: ${msg}`);
    await setState(cik, msg);
    stats.tickers_processed++;
    stats.errors++;
  }
}

// ---------- Handler ----------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const runStart = Date.now();
  T0 = runStart;
  const startedAt = new Date(runStart).toISOString();
  halted = null;
  let sb: SupabaseClient | null = null;
  let runId: string | null = null;

  try {
    sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const forceRequested = new URL(req.url).searchParams.get("force") === "1";
    const force = forceRequested && forceAllowed(req);

    if (!force) {
      const since = new Date(runStart - SKIP_WINDOW_MS).toISOString();
      const { data: recentRuns, error } = await sb
        .from("refresh_runs")
        .select("started_at")
        .eq("job", JOB)
        .gte("started_at", since)
        .limit(1);
      if (error) throw new Error(`refresh_runs lookup: ${error.message}`);
      if (recentRuns && recentRuns.length) {
        return json({
          skipped: true,
          reason: "ran_within_skip_window",
          last_started_at: recentRuns[0].started_at,
          force_ignored: forceRequested,
        });
      }
    }

    // Record the run at start (status CHECK allows only ok/partial/failed, so it
    // starts as 'partial' with running:true) so a second invocation inside the
    // window sees it and skips instead of doubling the SEC request rate.
    const { data: runRow, error: startErr } = await sb
      .from("refresh_runs")
      .insert({ job: JOB, started_at: startedAt, status: "partial", stats: { running: true } })
      .select("id")
      .single();
    if (startErr) console.error(`refresh_runs start insert: ${startErr.message}`);
    runId = (runRow as { id: string } | null)?.id ?? null;

    // Rows left 'running' by a worker that was killed (546) never finish;
    // close them out so they do not look like a run still in progress.
    await sb.from("refresh_runs")
      .update({ status: "failed", finished_at: startedAt, stats: { error: "worker_killed_before_finish" } })
      .eq("job", JOB)
      .eq("stats->>running", "true")
      .lt("started_at", new Date(runStart - STALE_RUN_MS).toISOString());

    const batchParam = Number(new URL(req.url).searchParams.get("batch"));
    const batchSize = Number.isInteger(batchParam) && batchParam > 0 ? Math.min(batchParam, MAX_BATCH) : DEFAULT_BATCH;

    const { data: stocks, error: stocksErr } = await sb.from("stocks").select("ticker").eq("is_active", true);
    if (stocksErr) throw new Error(`stocks: ${stocksErr.message}`);
    const { data: states, error: stateErr } = await sb.from("sec_sync_state").select("ticker,cik,last_synced_at");
    if (stateErr) throw new Error(`sec_sync_state: ${stateErr.message}`);

    const stateBy = new Map<string, { cik: string | null; last_synced_at: string | null }>();
    for (const s of states ?? []) stateBy.set(s.ticker, s);
    const active = [...new Set((stocks ?? []).map((s: { ticker: string }) => s.ticker).filter(Boolean))];

    // Every active stock gets a sec_sync_state row (never-synced sorts first).
    const missing = active.filter((t) => !stateBy.has(t));
    if (missing.length) {
      const { error } = await sb.from("sec_sync_state").upsert(
        missing.map((ticker) => ({ ticker, cik: null, last_synced_at: null, last_error: null })),
        { onConflict: "ticker", ignoreDuplicates: true },
      );
      if (error) console.error(`sec_sync_state seed: ${error.message}`);
    }

    const queue = active
      .map((t) => ({ ticker: t, cik: stateBy.get(t)?.cik ?? null, last: stateBy.get(t)?.last_synced_at ?? null }))
      .sort((a, b) => {
        if (a.last === b.last) return a.ticker.localeCompare(b.ticker);
        if (a.last === null) return -1; // nulls first
        if (b.last === null) return 1;
        return a.last.localeCompare(b.last);
      })
      .slice(0, batchSize);

    trace(`queue ready ${queue.map((q) => q.ticker).join(",")}`);
    const needCik = queue.filter((q) => !q.cik).map((q) => q.ticker);
    if (needCik.length) {
      const ciks = await loadBatchCiks(sb, needCik);
      for (const q of queue) if (!q.cik) q.cik = ciks.get(normTicker(q.ticker)) ?? null;
    }

    const stats: Stats = {
      tickers_processed: 0,
      filings_upserted: 0,
      insider_rows_upserted: 0,
      form4_fetched: 0,
      form4_no_lines: 0,
      errors: 0,
    };
    const budget = { form4Left: FORM4_RUN_CAP };
    let idx = 0;
    const worker = async () => {
      while (idx < queue.length && !halted && Date.now() - runStart < RUN_BUDGET_MS) {
        const item = queue[idx++];
        await processTicker(sb!, item.ticker, item.cik, runStart, stats, budget);
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));

    const status = halted || stats.errors > 0 ? (stats.tickers_processed > 0 ? "partial" : "failed") : "ok";
    const final = {
      job: JOB,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status,
      stats: { ...stats, halted, batch: batchSize, remaining: Math.max(0, queue.length - idx), seeded: missing.length, forced: force },
    };
    const { error: runErr } = runId
      ? await sb.from("refresh_runs").update(final).eq("id", runId)
      : await sb.from("refresh_runs").insert(final);
    if (runErr) console.error(`refresh_runs finish: ${runErr.message}`);

    return json({
      ok: true,
      ...stats,
      halted,
      remaining: Math.max(0, queue.length - idx),
      forced: force,
      force_ignored: forceRequested && !force,
      user_agent_source: UA_SECRET ? "secret" : "fallback",
      duration_ms: Date.now() - runStart,
    });
  } catch (e) {
    console.error(`refresh-filings failed: ${(e as Error).message}`);
    if (sb && runId) {
      const { error: failErr } = await sb.from("refresh_runs").update({
        finished_at: new Date().toISOString(),
        status: "failed",
        stats: { error: (e as Error).message?.slice(0, 200) ?? "unknown_error" },
      }).eq("id", runId);
      if (failErr) console.error(`refresh_runs fail update: ${failErr.message}`);
    }
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
