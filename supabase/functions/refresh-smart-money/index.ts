import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

// refresh-smart-money: specialist healthcare fund ownership from SEC 13F-HR info tables, plus
// C-suite open-market buys from insider_transactions (written by refresh-filings).
// 1. New 13F-HR filings of each manager in smart_money_managers -> smart_money_holdings.
// 2. Unknown CUSIPs -> cusip_tickers via OpenFIGI (small budget per run; seeded from the backtest).
// 3. Per-ticker summary -> smart_money_signals.
// 13F reports are due 45 days after quarter end, so the data is 45 to 135 days old by design.
// Same SEC etiquette as refresh-filings: User-Agent, gzip, under 8 requests/s, halt on 429/403.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Refresh-Secret",
};

const JOB = "edge:refresh-smart-money";
const FALLBACK_UA = "3xHunter research app (contact: site owner)";
const UA_SECRET = (Deno.env.get("SEC_USER_AGENT") ?? "").trim();
const USER_AGENT = UA_SECRET || FALLBACK_UA;

const RATE_PER_SEC = 7;
const REQUEST_TIMEOUT_MS = 10_000;
const RUN_BUDGET_MS = 90_000; // stop picking up filings (Edge wall clock 150s)
const SKIP_WINDOW_MS = 6 * 60 * 60_000; // 13F data changes quarterly
const DAY_MS = 86_400_000;
const FILING_LOOKBACK_DAYS = 400; // latest two quarters plus slack
const SIGNAL_LOOKBACK_DAYS = 300;
const STALE_PERIOD_DAYS = 100; // a manager whose latest report is a quarter behind the rest is dropped
const CHANGE_THRESHOLD = 0.1; // +-10% shares counts as added / trimmed
const INSIDER_WINDOW_DAYS = 90;
const OPENFIGI_MAX_REQUESTS = 12; // 10 CUSIPs each; the keyless limit is 25 requests/min
const PAGE = 1000;
const WRITE_CHUNK = 500;

// C-suite: chief officers (CEO, CFO, COO, CMO, CSO...), president, executive chair.
// Keep both in sync with src/lib/smart-money.ts.
const CSUITE = /\bchief\b|\bc[a-z]o\b|president|exec(utive)? chair/i;
const MIN_INSIDER_BUY_USD = 25_000; // smaller lots are mostly routine plan buys

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
  return safeEqual(bearer, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY_MS;

// ---------- SEC HTTP layer ----------

class HaltError extends Error {}
let halted: string | null = null;
let lastRequest = 0;

async function secFetch(url: string): Promise<string | null> {
  if (halted) throw new HaltError(halted);
  const wait = lastRequest + 1000 / RATE_PER_SEC - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate" },
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
    return await res.text();
  } catch (e) {
    if (e instanceof HaltError) throw e;
    if ((e as Error).name === "AbortError") throw new Error("timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 13F info table ----------

/** Share positions by CUSIP. Options (putCall) and principal amounts (bonds) are not ownership. */
function parseInfoTable(xml: string): { holdings: Map<string, number>; names: Map<string, string> } {
  const holdings = new Map<string, number>();
  const names = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const t = m[1];
    const get = (name: string) => t.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</`))?.[1]?.trim() ?? null;
    if (get("putCall")) continue;
    const type = get("sshPrnamtType");
    if (type && type.toUpperCase() !== "SH") continue;
    // Some filers write CUSIPs as numbers and drop leading zeros (031162100 -> 31162100).
    const cusip = get("cusip")?.toUpperCase().padStart(9, "0");
    const shares = Number(get("sshPrnamt")?.replace(/,/g, ""));
    if (!cusip || !Number.isFinite(shares) || shares <= 0) continue;
    holdings.set(cusip, (holdings.get(cusip) ?? 0) + shares);
    if (!names.has(cusip)) names.set(cusip, (get("nameOfIssuer") ?? "").slice(0, 200));
  }
  return { holdings, names };
}

interface Manager { id: string; name: string; ciks: string[] }
interface Pending { manager: Manager; cik: string; accession: string; filed: string; period: string }

interface Stats {
  managers: number;
  filings_new: number;
  filings_processed: number;
  holdings_upserted: number;
  cusips_mapped: number;
  cusips_unmapped: number;
  signals_upserted: number;
  errors: number;
}

/** 13F-HR originals from the last FILING_LOOKBACK_DAYS not yet processed. One per (cik, period). */
async function newFilings(sb: SupabaseClient, managers: Manager[], stats: Stats): Promise<Pending[]> {
  const cutoff = isoDay(Date.now() - FILING_LOOKBACK_DAYS * DAY_MS);
  const { data: done, error } = await sb
    .from("smart_money_filings")
    .select("accession_no, cik, period")
    .gte("period", cutoff);
  if (error) throw new Error(`smart_money_filings: ${error.message}`);
  const have = new Set((done ?? []).map((r) => r.accession_no as string));
  const havePeriod = new Set((done ?? []).map((r) => `${r.cik}|${r.period}`));

  const out: Pending[] = [];
  for (const manager of managers) {
    for (const cik of manager.ciks) {
      try {
        const body = await secFetch(`https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`);
        const recent = body ? JSON.parse(body)?.filings?.recent : null;
        if (!recent?.accessionNumber) continue;
        const rows: Pending[] = [];
        for (let i = 0; i < recent.accessionNumber.length; i++) {
          if (recent.form[i] !== "13F-HR") continue;
          const period = recent.reportDate[i];
          if (!period || period < cutoff) continue;
          rows.push({ manager, cik, accession: recent.accessionNumber[i], filed: recent.filingDate[i], period });
        }
        // Earliest original per period: later duplicates would double count.
        rows.sort((a, b) => a.filed.localeCompare(b.filed));
        for (const r of rows) {
          const key = `${r.cik}|${r.period}`;
          if (have.has(r.accession) || havePeriod.has(key)) continue;
          havePeriod.add(key);
          out.push(r);
        }
      } catch (e) {
        if (e instanceof HaltError) throw e;
        stats.errors++;
        console.error(`submissions ${manager.id} ${cik}: ${(e as Error).message}`);
      }
    }
  }
  return out;
}

async function processFiling(sb: SupabaseClient, f: Pending, names: Map<string, string>, stats: Stats): Promise<void> {
  const base = `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.accession.replace(/-/g, "")}`;
  const idxText = await secFetch(`${base}/index.json`);
  const items = ((idxText ? JSON.parse(idxText) : null)?.directory?.item ?? []) as { name: string; size?: string }[];
  const xmls = items
    .filter((it) => /\.xml$/i.test(it.name) && !/primary_doc/i.test(it.name))
    .sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
  let parsed: ReturnType<typeof parseInfoTable> | null = null;
  for (const x of xmls) {
    const text = await secFetch(`${base}/${x.name}`);
    if (text && /infoTable/i.test(text)) {
      parsed = parseInfoTable(text);
      break;
    }
  }
  const holdings = parsed?.holdings ?? new Map<string, number>();
  for (const [c, n] of parsed?.names ?? []) if (!names.has(c)) names.set(c, n);

  const rows = [...holdings].map(([cusip, shares]) => ({
    manager_id: f.manager.id,
    cik: f.cik,
    period: f.period,
    cusip,
    shares,
    filed_at: f.filed,
  }));
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const { error } = await sb
      .from("smart_money_holdings")
      .upsert(rows.slice(i, i + WRITE_CHUNK), { onConflict: "manager_id,cik,period,cusip" });
    if (error) throw new Error(`holdings upsert: ${error.message}`);
  }
  stats.holdings_upserted += rows.length;
  const { error } = await sb.from("smart_money_filings").upsert({
    accession_no: f.accession,
    manager_id: f.manager.id,
    cik: f.cik,
    period: f.period,
    filed_at: f.filed,
    positions: rows.length,
  }, { onConflict: "accession_no" });
  if (error) throw new Error(`filings upsert: ${error.message}`);
  stats.filings_processed++;
}

// ---------- CUSIP -> ticker ----------

async function mapCusips(sb: SupabaseClient, names: Map<string, string>, stats: Stats): Promise<void> {
  const all = [...names.keys()];
  const known = new Set<string>();
  for (let i = 0; i < all.length; i += 200) {
    const { data, error } = await sb.from("cusip_tickers").select("cusip").in("cusip", all.slice(i, i + 200));
    if (error) throw new Error(`cusip_tickers lookup: ${error.message}`);
    for (const r of data ?? []) known.add(r.cusip as string);
  }
  const todo = all.filter((c) => !known.has(c));
  for (let r = 0; r < OPENFIGI_MAX_REQUESTS && r * 10 < todo.length; r++) {
    const batch = todo.slice(r * 10, r * 10 + 10);
    const res = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch.map((c) => ({ idType: "ID_CUSIP", idValue: c, exchCode: "US" }))),
    });
    if (!res.ok) {
      await res.body?.cancel();
      break; // rate limited: the rest is mapped next run
    }
    const data = await res.json() as { data?: { ticker?: string }[] }[];
    const rows = batch.map((cusip, k) => {
      const t = data[k]?.data?.[0]?.ticker;
      return { cusip, ticker: t ? t.replace("/", ".").toUpperCase() : null, issuer_name: names.get(cusip) || null };
    });
    const { error } = await sb.from("cusip_tickers").upsert(rows, { onConflict: "cusip" });
    if (error) throw new Error(`cusip_tickers upsert: ${error.message}`);
    stats.cusips_mapped += rows.length;
    await sleep(2500);
  }
  stats.cusips_unmapped = Math.max(0, todo.length - stats.cusips_mapped);
}

// ---------- signals ----------

async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

type HolderChange = "new" | "added" | "trimmed" | "held" | "exited";

async function writeSignals(sb: SupabaseClient, managers: Manager[], stats: Stats): Promise<void> {
  const since = isoDay(Date.now() - SIGNAL_LOOKBACK_DAYS * DAY_MS);
  const holdings = await readAll<{ manager_id: string; period: string; cusip: string; shares: number | string }>((a, b) =>
    sb.from("smart_money_holdings").select("manager_id, period, cusip, shares").gte("period", since)
      .order("manager_id").order("period").order("cik").order("cusip").range(a, b)
  );
  const cusips = await readAll<{ cusip: string; ticker: string | null }>((a, b) =>
    sb.from("cusip_tickers").select("cusip, ticker").not("ticker", "is", null).order("cusip").range(a, b)
  );
  const stocks = await readAll<{ ticker: string }>((a, b) =>
    sb.from("stocks").select("ticker").order("ticker").range(a, b)
  );
  const tickerOf = new Map(cusips.map((c) => [c.cusip, c.ticker as string]));
  const universe = new Set(stocks.map((s) => s.ticker));

  // manager -> period -> ticker -> shares (summed across filer CIKs and share-class CUSIPs)
  const book = new Map<string, Map<string, Map<string, number>>>();
  for (const h of holdings) {
    const t = tickerOf.get(h.cusip);
    if (!t || !universe.has(t)) continue;
    const byPeriod = book.get(h.manager_id) ?? new Map<string, Map<string, number>>();
    const pos = byPeriod.get(h.period) ?? new Map<string, number>();
    pos.set(t, (pos.get(t) ?? 0) + Number(h.shares));
    byPeriod.set(h.period, pos);
    book.set(h.manager_id, byPeriod);
  }
  // Every period a manager filed, even with no universe positions (an exit must still count).
  const filed = await readAll<{ manager_id: string; period: string }>((a, b) =>
    sb.from("smart_money_filings").select("manager_id, period").gte("period", since).order("accession_no").range(a, b)
  );
  const periodsOf = new Map<string, string[]>();
  for (const f of filed) {
    const list = periodsOf.get(f.manager_id) ?? [];
    if (!list.includes(f.period)) list.push(f.period);
    periodsOf.set(f.manager_id, list);
  }
  const latestAll = [...periodsOf.values()].flat().sort().pop() ?? null;

  type Detail = { id: string; name: string; shares: number; prev_shares: number | null; change: HolderChange };
  const detail = new Map<string, Detail[]>();
  for (const m of managers) {
    const periods = (periodsOf.get(m.id) ?? []).sort();
    const p1 = periods[periods.length - 1];
    if (!p1 || !latestAll || dayDiff(latestAll, p1) > STALE_PERIOD_DAYS) continue;
    const p0 = periods[periods.length - 2] ?? null;
    const now = book.get(m.id)?.get(p1) ?? new Map<string, number>();
    const prev = p0 && dayDiff(p1, p0) <= STALE_PERIOD_DAYS ? book.get(m.id)?.get(p0) ?? new Map<string, number>() : null;
    for (const t of new Set([...now.keys(), ...(prev?.keys() ?? [])])) {
      const s1 = now.get(t) ?? 0;
      const s0 = prev ? prev.get(t) ?? 0 : null;
      let change: HolderChange = "held";
      if (s1 === 0) change = "exited";
      else if (s0 === 0) change = "new";
      else if (s0 !== null && s1 > s0 * (1 + CHANGE_THRESHOLD)) change = "added";
      else if (s0 !== null && s1 < s0 * (1 - CHANGE_THRESHOLD)) change = "trimmed";
      const list = detail.get(t) ?? [];
      list.push({ id: m.id, name: m.name, shares: s1, prev_shares: s0, change });
      detail.set(t, list);
    }
  }

  // C-suite open-market buys (Form 4 code P) in the last 90 days.
  const insiderSince = isoDay(Date.now() - INSIDER_WINDOW_DAYS * DAY_MS);
  const buys = await readAll<{ ticker: string; owner_name: string; owner_relationship: string | null; value: number | string | null }>((a, b) =>
    sb.from("insider_transactions").select("ticker, owner_name, owner_relationship, value")
      .eq("transaction_code", "P").eq("acquired_disposed", "A").gte("transaction_date", insiderSince)
      .order("id").range(a, b)
  );
  const insider = new Map<string, { n: number; value: number; who: Set<string> }>();
  for (const b of buys) {
    if (!CSUITE.test(b.owner_relationship ?? "") || (Number(b.value) || 0) < MIN_INSIDER_BUY_USD) continue;
    const cur = insider.get(b.ticker) ?? { n: 0, value: 0, who: new Set<string>() };
    cur.n++;
    cur.value += Number(b.value) || 0;
    cur.who.add(b.owner_name);
    insider.set(b.ticker, cur);
  }

  const now = new Date().toISOString();
  const rows = [...universe].map((ticker) => {
    const d = (detail.get(ticker) ?? []).sort((a, b) => b.shares - a.shares);
    const ins = insider.get(ticker);
    return {
      ticker,
      period: latestAll,
      holders: d.filter((x) => x.shares > 0).length,
      holders_prev: d.filter((x) => (x.prev_shares ?? 0) > 0).length,
      new_holders: d.filter((x) => x.change === "new").length,
      exited_holders: d.filter((x) => x.change === "exited").length,
      added: d.filter((x) => x.change === "added").length,
      trimmed: d.filter((x) => x.change === "trimmed").length,
      holder_detail: d,
      csuite_buys_90d: ins?.n ?? 0,
      csuite_buy_value_90d: Math.round(ins?.value ?? 0),
      csuite_buyers: ins ? [...ins.who].slice(0, 10) : [],
      updated_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const { error } = await sb.from("smart_money_signals").upsert(rows.slice(i, i + WRITE_CHUNK), { onConflict: "ticker" });
    if (error) throw new Error(`signals upsert: ${error.message}`);
  }
  stats.signals_upserted = rows.length;
}

// ---------- Handler ----------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const runStart = Date.now();
  const startedAt = new Date(runStart).toISOString();
  halted = null;
  let sb: SupabaseClient | null = null;
  let runId: string | null = null;

  try {
    sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const forceRequested = new URL(req.url).searchParams.get("force") === "1";
    const force = forceRequested && forceAllowed(req);

    if (!force) {
      const { data: recentRuns, error } = await sb
        .from("refresh_runs")
        .select("started_at")
        .eq("job", JOB)
        .gte("started_at", new Date(runStart - SKIP_WINDOW_MS).toISOString())
        .limit(1);
      if (error) throw new Error(`refresh_runs lookup: ${error.message}`);
      if (recentRuns && recentRuns.length) {
        return json({ skipped: true, reason: "ran_within_6_hours", last_started_at: recentRuns[0].started_at, force_ignored: forceRequested });
      }
    }

    const { data: runRow, error: startErr } = await sb
      .from("refresh_runs")
      .insert({ job: JOB, started_at: startedAt, status: "partial", stats: { running: true } })
      .select("id")
      .single();
    if (startErr) console.error(`refresh_runs start insert: ${startErr.message}`);
    runId = (runRow as { id: string } | null)?.id ?? null;

    const { data: mgrRows, error: mgrErr } = await sb.from("smart_money_managers").select("id, name, ciks").eq("is_active", true);
    if (mgrErr) throw new Error(`smart_money_managers: ${mgrErr.message}`);
    const managers = (mgrRows ?? []) as Manager[];

    const stats: Stats = {
      managers: managers.length,
      filings_new: 0,
      filings_processed: 0,
      holdings_upserted: 0,
      cusips_mapped: 0,
      cusips_unmapped: 0,
      signals_upserted: 0,
      errors: 0,
    };

    const names = new Map<string, string>();
    let remaining = 0;
    try {
      const pending = (await newFilings(sb, managers, stats)).sort((a, b) => b.period.localeCompare(a.period));
      stats.filings_new = pending.length;
      for (const f of pending) {
        if (Date.now() - runStart > RUN_BUDGET_MS) break;
        try {
          await processFiling(sb, f, names, stats);
        } catch (e) {
          if (e instanceof HaltError) throw e;
          stats.errors++;
          console.error(`13F ${f.manager.id} ${f.accession}: ${(e as Error).message}`);
        }
      }
      remaining = pending.length - stats.filings_processed;
    } catch (e) {
      if (!(e instanceof HaltError)) throw e;
    }

    // Holdings written in earlier runs may still have unmapped CUSIPs.
    if (names.size === 0) {
      const { data } = await sb.from("smart_money_holdings").select("cusip").gte("filed_at", isoDay(Date.now() - 120 * DAY_MS)).limit(PAGE);
      for (const r of data ?? []) names.set(r.cusip as string, "");
    }
    await mapCusips(sb, names, stats);
    await writeSignals(sb, managers, stats);

    const status = halted || stats.errors > 0 || remaining > 0 ? "partial" : "ok";
    const final = {
      job: JOB,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status,
      stats: { ...stats, halted, remaining, forced: force },
    };
    const { error: runErr } = runId
      ? await sb.from("refresh_runs").update(final).eq("id", runId)
      : await sb.from("refresh_runs").insert(final);
    if (runErr) console.error(`refresh_runs finish: ${runErr.message}`);

    return json({
      ok: true,
      ...stats,
      halted,
      remaining,
      forced: force,
      force_ignored: forceRequested && !force,
      user_agent_source: UA_SECRET ? "secret" : "fallback",
      duration_ms: Date.now() - runStart,
    });
  } catch (e) {
    console.error(`refresh-smart-money failed: ${(e as Error).message}`);
    if (sb && runId) {
      await sb.from("refresh_runs").update({
        finished_at: new Date().toISOString(),
        status: "failed",
        stats: { error: (e as Error).message?.slice(0, 200) ?? "unknown_error" },
      }).eq("id", runId);
    }
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
