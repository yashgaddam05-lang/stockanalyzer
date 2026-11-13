import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

// backfill-prices: one-time 5-year daily history per symbol into price_daily.
// pg_cron calls it every 2 minutes. Each run takes a few symbols that have no
// price_backfill_state row yet (active stocks plus every symbol already in
// price_daily, e.g. SPY/^VIX), pulls range=5y from Yahoo's chart endpoint and
// upserts in chunks. Once everything is done a run is two small queries, and
// stocks added later are backfilled automatically.
//
// Sized for the free-tier ~2s CPU cap: ~1,260 bars per symbol, BATCH symbols
// per run, BAR_CHUNK rows per upsert request.

const JOB = "edge:backfill-prices";
const RANGE = "5y";
const BATCH = 4;
const BAR_CHUNK = 500;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const UA = "Mozilla/5.0 (compatible; 3xHunter/1.0)";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface Bar {
  ticker: string;
  d: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adj_close: number | null;
  volume: number | null;
  source: string;
  updated_at: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Same conversion as refresh-stocks: skip null/non-positive closes; a repeated
// date (Yahoo sometimes repeats the live bar) keeps the last value.
// deno-lint-ignore no-explicit-any
function extractBars(ticker: string, result: any): Bar[] {
  const ts: unknown[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const q = result?.indicators?.quote?.[0] || {};
  const adj: unknown[] = result?.indicators?.adjclose?.[0]?.adjclose || [];
  const now = new Date().toISOString();
  const byDay = new Map<string, Bar>();
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const close = num(q.close?.[i]);
    if (typeof t !== "number" || !Number.isFinite(t) || close === null || close <= 0) continue;
    const vol = num(q.volume?.[i]);
    const d = new Date(t * 1000).toISOString().slice(0, 10);
    byDay.set(d, {
      ticker,
      d,
      open: num(q.open?.[i]),
      high: num(q.high?.[i]),
      low: num(q.low?.[i]),
      close,
      adj_close: num(adj[i]),
      volume: vol === null ? null : Math.round(vol),
      source: "yahoo",
      updated_at: now,
    });
  }
  return [...byDay.values()];
}

/** Bars, [] when Yahoo has no data for the symbol, throws on transient failures. */
async function fetchHistory(ticker: string): Promise<Bar[]> {
  let lastErr = "no_host";
  for (const host of HOSTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${RANGE}&interval=1d&events=div,splits`;
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
      if (res.status === 404) {
        await res.body?.cancel();
        return [];
      }
      if (!res.ok) {
        await res.body?.cancel();
        lastErr = `http_${res.status}`;
        continue;
      }
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) return [];
      return extractBars(ticker, result);
    } catch (e) {
      lastErr = (e as Error).name === "AbortError" ? "timeout" : (e as Error).message;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastErr);
}

async function upsertBars(sb: SupabaseClient, bars: Bar[]): Promise<void> {
  for (let i = 0; i < bars.length; i += BAR_CHUNK) {
    const { error } = await sb.from("price_daily").upsert(bars.slice(i, i + BAR_CHUNK), { onConflict: "ticker,d" });
    if (error) throw new Error(`price_daily upsert: ${error.message}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data: queue, error: qErr } = await sb.rpc("price_backfill_queue", { p_limit: BATCH, p_max_attempts: MAX_ATTEMPTS });
    if (qErr) throw new Error(`queue: ${qErr.message}`);
    const tickers = ((queue ?? []) as { ticker: string }[]).map((r) => r.ticker);
    if (!tickers.length) return json({ ok: true, idle: true });

    const results: Record<string, unknown>[] = [];
    let bars = 0;
    let errors = 0;
    for (const ticker of tickers) {
      try {
        const rows = await fetchHistory(ticker);
        await upsertBars(sb, rows);
        bars += rows.length;
        const first = rows.length ? rows.reduce((m, r) => (r.d < m ? r.d : m), rows[0].d) : null;
        await sb.from("price_backfill_state").upsert(
          { ticker, range: RANGE, done_at: new Date().toISOString(), bars: rows.length, first_d: first, last_error: rows.length ? null : "no_data" },
          { onConflict: "ticker" },
        );
        results.push({ ticker, bars: rows.length, first_d: first });
      } catch (e) {
        errors++;
        const msg = (e as Error).message?.slice(0, 200) || "unknown_error";
        console.error(`backfill ${ticker}: ${msg}`);
        await sb.rpc("price_backfill_fail", { p_ticker: ticker, p_error: msg });
        results.push({ ticker, error: msg });
      }
    }

    const { data: left } = await sb.rpc("price_backfill_remaining", { p_max_attempts: MAX_ATTEMPTS });
    await sb.from("refresh_runs").insert({
      job: JOB,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: errors === 0 ? "ok" : errors < tickers.length ? "partial" : "failed",
      stats: { tickers: tickers.length, bars, errors, remaining: left ?? null, results },
    });
    return json({ ok: true, tickers: tickers.length, bars, errors, remaining: left ?? null, duration_ms: Date.now() - t0 });
  } catch (e) {
    console.error(`backfill-prices failed: ${(e as Error).message}`);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
