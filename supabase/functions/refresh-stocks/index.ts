import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QuoteSummary {
  regularMarketPrice?: number;
  marketCap?: number;
  beta?: number;
  forwardPE?: number;
  debtToEquity?: number;
  totalCash?: number;
  totalDebt?: number;
  revenue?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  targetMeanPrice?: number;
}

interface ChartCandle {
  close: number[];
  timestamp: number[];
}

function calcMomentum(closes: number[]): number {
  if (closes.length < 20) return 50;
  const recent = closes.slice(-20);
  const ma5 = recent.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma20 = recent.reduce((a, b) => a + b, 0) / recent.length;
  const ratio = ma5 / ma20;
  let score = 50 + (ratio - 1) * 500;
  const recentReturn = (closes[closes.length - 1] - closes[Math.max(0, closes.length - 20)]) / closes[Math.max(0, closes.length - 20)];
  score += recentReturn * 100;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function calcVolatility(closes: number[]): number {
  if (closes.length < 10) return 50;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  if (returns.length === 0) return 50;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const dailyStd = Math.sqrt(variance);
  const annualized = dailyStd * Math.sqrt(252) * 100;
  return Math.round(annualized);
}

async function fetchChart(ticker: string): Promise<{ closes: number[]; currentPrice: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=3mo&interval=1d`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  if (!resp.ok) throw new Error(`Chart fetch failed for ${ticker}: ${resp.status}`);
  const json = await resp.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${ticker}`);
  const indicators = result.indicators?.quote?.[0];
  const rawCloses = indicators?.close || [];
  const closes = rawCloses.filter((c: number | null): c is number => c !== null && c > 0);
  const meta = result.meta;
  const currentPrice = meta?.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
  return { closes, currentPrice };
}

async function fetchQuoteSummary(ticker: string): Promise<QuoteSummary> {
  const modules = "price,summaryDetail,defaultKeyStatistics,financialData";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    if (!resp.ok) return {};
    const json = await resp.json();
    const s = json?.quoteSummary?.result?.[0];
    if (!s) return {};
    const price = s.price || {};
    const summaryDetail = s.summaryDetail || {};
    const defaultKey = s.defaultKeyStatistics || {};
    const financial = s.financialData || {};

    const getNum = (obj: any, ...keys: string[]): number | undefined => {
      for (const k of keys) {
        const v = obj?.[k];
        if (typeof v === "number") return v;
        if (v?.raw !== undefined && v.raw !== null) return v.raw;
      }
      return undefined;
    };

    return {
      regularMarketPrice: getNum(price, "regularMarketPrice"),
      marketCap: getNum(price, "marketCap"),
      beta: getNum(summaryDetail, "beta"),
      forwardPE: getNum(summaryDetail, "forwardPE"),
      debtToEquity: getNum(financial, "debtToEquity"),
      totalCash: getNum(financial, "totalCash"),
      totalDebt: getNum(financial, "totalDebt"),
      revenue: getNum(financial, "totalRevenue"),
      revenueGrowth: getNum(financial, "revenueGrowth"),
      earningsGrowth: getNum(financial, "earningsGrowth"),
      targetMeanPrice: getNum(financial, "targetMeanPrice"),
    };
  } catch {
    return {};
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: stocks, error: dbError } = await supabase
      .from("stocks")
      .select("id, ticker");

    if (dbError) throw new Error(`DB error: ${dbError.message}`);
    if (!stocks || stocks.length === 0) {
      return new Response(JSON.stringify({ updated: 0, message: "No stocks in database" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { ticker: string; status: string; price?: number }[] = [];

    const refreshOne = async (stock: { id: string; ticker: string }) => {
      try {
        const { closes, currentPrice } = await fetchChart(stock.ticker);
        const summary = await fetchQuoteSummary(stock.ticker);

        const momentumScore = calcMomentum(closes);
        const volatility = calcVolatility(closes);

        const update: Record<string, number | string> = {
          momentum_score: momentumScore,
          volatility,
          updated_at: new Date().toISOString(),
        };

        if (currentPrice > 0) update.current_price = currentPrice;
        if (summary.marketCap && summary.marketCap > 0) update.market_cap = Math.round(summary.marketCap);
        if (summary.beta !== undefined) update.beta = Math.round(summary.beta * 100) / 100;
        if (summary.debtToEquity !== undefined) update.debt_to_equity = Math.round((summary.debtToEquity / 100) * 100) / 100;
        if (summary.revenueGrowth !== undefined) update.revenue_growth_yoy = Math.round(summary.revenueGrowth * 10000) / 100;
        if (summary.earningsGrowth !== undefined) update.earnings_growth_yoy = Math.round(summary.earningsGrowth * 10000) / 100;
        if (summary.forwardPE !== undefined && summary.forwardPE > 0) update.forward_pe = Math.round(summary.forwardPE * 100) / 100;
        if (summary.targetMeanPrice !== undefined && summary.targetMeanPrice > 0) update.target_price = Math.round(summary.targetMeanPrice * 100) / 100;
        if (summary.marketCap && summary.revenue && summary.revenue > 0) {
          update.price_to_sales = Math.round((summary.marketCap / summary.revenue) * 100) / 100;
        }

        const { error: updateError } = await supabase
          .from("stocks")
          .update(update)
          .eq("id", stock.id);

        if (updateError) {
          results.push({ ticker: stock.ticker, status: "update_failed" });
        } else {
          results.push({ ticker: stock.ticker, status: "ok", price: currentPrice });
        }
      } catch (err) {
        results.push({ ticker: stock.ticker, status: `error: ${err.message}` });
      }
    };

    // Small parallel batches keep 100+ tickers inside the edge function time limit
    // without hammering Yahoo Finance.
    const BATCH_SIZE = 5;
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
      await Promise.all(stocks.slice(i, i + BATCH_SIZE).map(refreshOne));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const succeeded = results.filter((r) => r.status === "ok").length;

    return new Response(JSON.stringify({
      updated: succeeded,
      total: stocks.length,
      results,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
