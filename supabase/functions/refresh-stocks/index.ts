import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 8000;
// Stop picking up new tickers after this; Edge Function wall clock is 150s on Free.
const RUN_BUDGET_MS = 90_000;
const MIN_MOMENTUM_CLOSES = 20;
const MIN_VOLATILITY_CLOSES = 10;

const LEGACY_COLUMNS = [
  "current_price",
  "market_cap",
  "beta",
  "debt_to_equity",
  "revenue_growth_yoy",
  "earnings_growth_yoy",
  "momentum_score",
  "volatility",
  "updated_at",
] as const;

type Row = Record<string, number | string>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, ...(init.headers || {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// deno-lint-ignore no-explicit-any
function num(obj: any, key: string): number | undefined {
  const v = obj?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v.raw === "number" && Number.isFinite(v.raw)) return v.raw;
  return undefined;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Yahoo crumb (cached per invocation) ----------
interface Crumb { crumb: string; cookie: string }
let crumbPromise: Promise<Crumb | null> | null = null;

function getCrumb(): Promise<Crumb | null> {
  if (!crumbPromise) {
    crumbPromise = (async () => {
      try {
        const r1 = await fetchWithTimeout("https://fc.yahoo.com", { redirect: "manual" });
        const setCookie = r1.headers.get("set-cookie") || "";
        await r1.body?.cancel();
        const cookie = setCookie
          .split(/,(?=\s*[A-Za-z0-9_-]+=)/)
          .map((c) => c.split(";")[0].trim())
          .filter(Boolean)
          .join("; ");
        if (!cookie) return null;
        const r2 = await fetchWithTimeout("https://query2.finance.yahoo.com/v1/test/getcrumb", {
          headers: { Cookie: cookie },
        });
        if (!r2.ok) {
          await r2.body?.cancel();
          return null;
        }
        const crumb = (await r2.text()).trim();
        if (!crumb || crumb.includes("<") || crumb.length > 64) return null;
        return { crumb, cookie };
      } catch {
        return null;
      }
    })();
  }
  return crumbPromise;
}

// ---------- Chart (momentum / volatility / price) ----------
// Return undefined below threshold so we never write a fabricated placeholder.
function calcMomentum(closes: number[]): number | undefined {
  if (closes.length < MIN_MOMENTUM_CLOSES) return undefined;
  const recent = closes.slice(-20);
  const ma5 = recent.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma20 = recent.reduce((a, b) => a + b, 0) / recent.length;
  let score = 50 + (ma5 / ma20 - 1) * 500;
  const base = closes[Math.max(0, closes.length - 20)];
  score += ((closes[closes.length - 1] - base) / base) * 100;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function calcVolatility(closes: number[]): number | undefined {
  if (closes.length < MIN_VOLATILITY_CLOSES) return undefined;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  if (returns.length === 0) return undefined;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.round(Math.sqrt(variance) * Math.sqrt(252) * 100);
}

async function fetchChart(ticker: string): Promise<{ closes: number[]; price?: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=3mo&interval=1d`;
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) {
      await resp.body?.cancel();
      return null;
    }
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const raw: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const closes = raw.filter((c): c is number => typeof c === "number" && c > 0);
    const price = num(result.meta, "regularMarketPrice") ?? closes[closes.length - 1];
    return { closes, price };
  } catch {
    return null;
  }
}

// ---------- quoteSummary v10 ----------
// deno-lint-ignore no-explicit-any
async function fetchQuoteSummary(ticker: string): Promise<any | null> {
  const modules = "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile";
  const attempt = async (c: Crumb | null) => {
    const crumbParam = c ? `&crumb=${encodeURIComponent(c.crumb)}` : "";
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}${crumbParam}`;
    const resp = await fetchWithTimeout(url, c ? { headers: { Cookie: c.cookie } } : {});
    if (!resp.ok) {
      await resp.body?.cancel();
      return { status: resp.status, result: null };
    }
    const data = await resp.json();
    return { status: resp.status, result: data?.quoteSummary?.result?.[0] ?? null };
  };
  try {
    const crumb = await getCrumb();
    const r = await attempt(crumb);
    // 401/403 or empty result -> caller falls back to v7 quote
    return r.result;
  } catch {
    return null;
  }
}

// ---------- v7 quote fallback ----------
// deno-lint-ignore no-explicit-any
async function fetchQuoteV7(ticker: string): Promise<any | null> {
  try {
    const crumb = await getCrumb();
    const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb.crumb)}` : "";
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}${crumbParam}`;
    const resp = await fetchWithTimeout(url, crumb ? { headers: { Cookie: crumb.cookie } } : {});
    if (!resp.ok) {
      await resp.body?.cancel();
      return null;
    }
    const data = await resp.json();
    return data?.quoteResponse?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

// ---------- Build update row (only fields Yahoo actually returned) ----------
async function buildUpdate(ticker: string): Promise<Row | null> {
  const [chart, summary] = await Promise.all([fetchChart(ticker), fetchQuoteSummary(ticker)]);
  const row: Row = {};

  if (chart) {
    const momentum = calcMomentum(chart.closes);
    if (momentum !== undefined) row.momentum_score = momentum;
    const volatility = calcVolatility(chart.closes);
    if (volatility !== undefined) row.volatility = volatility;
  }
  if (chart?.price && chart.price > 0) row.current_price = chart.price;

  if (summary) {
    const price = summary.price || {};
    const sd = summary.summaryDetail || {};
    const ks = summary.defaultKeyStatistics || {};
    const fd = summary.financialData || {};
    const ap = summary.assetProfile || {};

    const rmp = num(price, "regularMarketPrice");
    if (rmp !== undefined && rmp > 0 && row.current_price === undefined) row.current_price = rmp;
    const mcap = num(price, "marketCap") ?? num(sd, "marketCap");
    if (mcap !== undefined && mcap > 0) row.market_cap = Math.round(mcap);
    const beta = num(sd, "beta") ?? num(ks, "beta");
    if (beta !== undefined) row.beta = round2(beta);
    const de = num(fd, "debtToEquity");
    if (de !== undefined) row.debt_to_equity = round2(de / 100);
    // revenue growth comes ONLY from financialData.revenueGrowth (no earnings fallback)
    const revG = num(fd, "revenueGrowth");
    if (revG !== undefined) row.revenue_growth_yoy = round2(revG * 100);
    const earnG = num(fd, "earningsGrowth");
    if (earnG !== undefined) row.earnings_growth_yoy = round2(earnG * 100);

    const fpe = num(sd, "forwardPE") ?? num(ks, "forwardPE");
    if (fpe !== undefined) row.forward_pe = round2(fpe);
    const ps = num(sd, "priceToSalesTrailing12Months");
    if (ps !== undefined) row.price_to_sales = round2(ps);
    const peg = num(ks, "pegRatio");
    if (peg !== undefined) row.peg_ratio = round2(peg);
    const tgt = num(fd, "targetMeanPrice");
    if (tgt !== undefined) row.target_mean_price = round2(tgt);
    const gm = num(fd, "grossMargins");
    if (gm !== undefined) row.gross_margin = round2(gm * 100);
    const om = num(fd, "operatingMargins");
    if (om !== undefined) row.operating_margin = round2(om * 100);
    const pm = num(fd, "profitMargins");
    if (pm !== undefined) row.profit_margin = round2(pm * 100);
    const hi = num(sd, "fiftyTwoWeekHigh");
    if (hi !== undefined) row.fifty_two_week_high = round2(hi);
    const lo = num(sd, "fiftyTwoWeekLow");
    if (lo !== undefined) row.fifty_two_week_low = round2(lo);
    const vol = num(sd, "averageVolume");
    if (vol !== undefined) row.avg_volume = Math.round(vol);
    if (typeof ap.industry === "string" && ap.industry) row.industry = ap.industry;
  } else {
    const q = await fetchQuoteV7(ticker);
    if (q) {
      const p = num(q, "regularMarketPrice");
      if (p !== undefined && p > 0 && row.current_price === undefined) row.current_price = p;
      const mcap = num(q, "marketCap");
      if (mcap !== undefined && mcap > 0) row.market_cap = Math.round(mcap);
      const fpe = num(q, "forwardPE");
      if (fpe !== undefined) row.forward_pe = round2(fpe);
      const hi = num(q, "fiftyTwoWeekHigh");
      if (hi !== undefined) row.fifty_two_week_high = round2(hi);
      const lo = num(q, "fiftyTwoWeekLow");
      if (lo !== undefined) row.fifty_two_week_low = round2(lo);
      const vol = num(q, "averageDailyVolume3Month");
      if (vol !== undefined) row.avg_volume = Math.round(vol);
    }
  }

  if (Object.keys(row).length === 0) return null;
  const now = new Date().toISOString();
  row.data_source = "yahoo";
  row.last_refreshed_at = now;
  row.updated_at = now;
  return row;
}

function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST204" || err.code === "42703") return true;
  return /column .* (does not exist|could not find)|Could not find the .* column/i.test(err.message || "");
}

// Runs worker over items with bounded concurrency. Once deadline passes, no new
// items are started; returns the items that were never picked up.
async function runPool<T>(
  items: T[],
  limit: number,
  deadline: number,
  worker: (item: T) => Promise<void>,
): Promise<T[]> {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      if (Date.now() >= deadline) return;
      const item = items[idx++];
      try {
        await worker(item);
      } catch {
        // worker handles its own failures; never fail the batch
      }
    }
  });
  await Promise.all(runners);
  return items.slice(idx);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const deadline = Date.now() + RUN_BUDGET_MS;
    crumbPromise = null; // fresh crumb per invocation
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let { data: stocks, error: dbError } = await supabase
      .from("stocks")
      .select("id, ticker")
      .eq("is_active", true);

    if (dbError) {
      // is_active column may not exist yet; retry without the filter
      const retry = await supabase.from("stocks").select("id, ticker");
      stocks = retry.data;
      dbError = retry.error;
    }
    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    const list = (stocks || []) as { id: string; ticker: string }[];
    if (list.length === 0) {
      return json({ updated: 0, total: 0, failed: [], degraded: false });
    }

    let degraded = false;
    let updated = 0;
    const failed: string[] = [];

    const legacyOnly = (row: Row): Row => {
      const out: Row = {};
      for (const k of LEGACY_COLUMNS) if (row[k] !== undefined) out[k] = row[k];
      return out;
    };

    const skipped = await runPool(list, CONCURRENCY, deadline, async (stock) => {
      try {
        const full = await buildUpdate(stock.ticker);
        if (!full) {
          failed.push(stock.ticker);
          return;
        }
        let payload = degraded ? legacyOnly(full) : full;
        // Decide on what was actually sent, not the shared flag: concurrent workers may
        // have sent the full payload before another worker flipped `degraded`.
        const sentFull = payload === full;
        let { error } = await supabase.from("stocks").update(payload).eq("id", stock.id);
        if (error && sentFull && isMissingColumnError(error)) {
          degraded = true;
          payload = legacyOnly(full);
          ({ error } = await supabase.from("stocks").update(payload).eq("id", stock.id));
        }
        if (error) failed.push(stock.ticker);
        else updated++;
      } catch {
        failed.push(stock.ticker);
      }
    });
    for (const s of skipped) failed.push(s.ticker);

    return json({ updated, total: list.length, failed, degraded });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message, updated: 0, total: 0, failed: [], degraded: false }, 500);
  }
});
