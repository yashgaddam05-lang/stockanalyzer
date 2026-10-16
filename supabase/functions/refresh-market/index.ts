import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Fetches daily bars for the market-regime symbols into price_daily.
// Symbol list and order must match REGIME_SYMBOLS in src/lib/scoring/regime.ts.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYMBOLS: readonly string[] = [
  "^VIX", "^TNX", "SPY", "QQQ", "IWM",
  "XLK", "XLV", "XBI", "XLF", "XLE", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC",
  "SMH", "IGV", "ITA", "ICLN", "TAN", "ARKK",
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 8000;
const BAR_CHUNK = 1000;
const ALLOWED_RANGES = ["1y", "2y"] as const;
type Range = typeof ALLOWED_RANGES[number];
const JOB = "edge:refresh-market";

interface Bar {
  ticker: string;
  d: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adj_close: number | null;
  volume: number | null;
  source: "yahoo";
  updated_at: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const finiteOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBars(symbol: string, range: Range): Promise<Bar[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) {
      await resp.body?.cancel();
      return null;
    }
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const ts: unknown[] = Array.isArray(result.timestamp) ? result.timestamp : [];
    const q = result.indicators?.quote?.[0] || {};
    const adj: unknown[] = result.indicators?.adjclose?.[0]?.adjclose || [];
    const now = new Date().toISOString();
    const byDay = new Map<string, Bar>();
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const close = finiteOrNull(q.close?.[i]);
      if (typeof t !== "number" || !Number.isFinite(t) || close === null || close <= 0) continue;
      const vol = finiteOrNull(q.volume?.[i]);
      const d = isoDay(t * 1000);
      byDay.set(d, {
        ticker: symbol,
        d,
        open: finiteOrNull(q.open?.[i]),
        high: finiteOrNull(q.high?.[i]),
        low: finiteOrNull(q.low?.[i]),
        close,
        adj_close: finiteOrNull(adj[i]),
        volume: vol === null ? null : Math.round(vol),
        source: "yahoo",
        updated_at: now,
      });
    }
    const bars = [...byDay.values()];
    return bars.length ? bars : null;
  } catch {
    return null;
  }
}

async function readRange(req: Request): Promise<Range> {
  let raw: unknown = new URL(req.url).searchParams.get("range");
  if (!raw && req.method === "POST") {
    try {
      const body = await req.clone().json();
      raw = body?.range;
    } catch {
      // empty or non-JSON body -> default
    }
  }
  return (ALLOWED_RANGES as readonly string[]).includes(raw as string) ? (raw as Range) : "1y";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();
  try {
    const range = await readRange(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const failed: string[] = [];
    const all: Bar[] = [];
    let idx = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, SYMBOLS.length) }, async () => {
        while (idx < SYMBOLS.length) {
          const sym = SYMBOLS[idx++];
          const bars = await fetchBars(sym, range);
          if (bars) all.push(...bars);
          else failed.push(sym);
        }
      }),
    );

    let bars_upserted = 0;
    const failedUpsert = new Set<string>();
    for (let i = 0; i < all.length; i += BAR_CHUNK) {
      const chunk = all.slice(i, i + BAR_CHUNK);
      try {
        const { error } = await supabase.from("price_daily").upsert(chunk, { onConflict: "ticker,d" });
        if (error) {
          console.error(`price_daily upsert failed: ${error.code} ${error.message}`);
          for (const b of chunk) failedUpsert.add(b.ticker);
          continue;
        }
        bars_upserted += chunk.length;
      } catch (e) {
        console.error(`price_daily upsert threw: ${e instanceof Error ? e.message : String(e)}`);
        for (const b of chunk) failedUpsert.add(b.ticker);
      }
    }
    for (const t of failedUpsert) if (!failed.includes(t)) failed.push(t);
    failed.sort((a, b) => SYMBOLS.indexOf(a) - SYMBOLS.indexOf(b));

    const status = bars_upserted === 0 ? "failed" : failed.length ? "partial" : "ok";
    try {
      const { error } = await supabase.from("refresh_runs").insert({
        job: JOB,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status,
        stats: { symbols: SYMBOLS.length, bars_upserted, failed_count: failed.length, failed, range },
      });
      if (error) console.error(`refresh_runs insert failed: ${error.message}`);
    } catch (e) {
      console.error(`refresh_runs insert threw: ${e instanceof Error ? e.message : String(e)}`);
    }

    return json({ symbols: SYMBOLS.length, bars_upserted, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message, symbols: SYMBOLS.length, bars_upserted: 0, failed: [...SYMBOLS] }, 500);
  }
});
