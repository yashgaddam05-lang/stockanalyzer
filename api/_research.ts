// Shared market research. A research brief is live, sourced facts about one stock (or the whole market, ticker
// 'MARKET'), written once and reused by every user who asks about it until it expires or the price moves a lot.
// Scheduled runs fill the cache for the most-followed stocks before the open; answers research any missing ticker on
// demand and store it for the next person. One brief costs a few cents; reusing it costs nothing.
import { supabaseAdmin } from './_supabase.js';
import { streamChat, type Citation } from './_llm.js';
import { RESEARCH_MODEL, addUsage, dailyLimitUsd, recordUsage, spentToday, type Usage } from './_ai.js';

export const MARKET = 'MARKET';

/** A brief is reused until it expires, or until the price has moved more than this since it was written. */
const STALE_MOVE = 0.04;
const TTL_HOURS = 8;
const WEEKEND_TTL_HOURS = 60;
const WEB_RESULTS = Number(process.env.RESEARCH_WEB_RESULTS ?? 4);
const MAX_TOKENS = 6000;

export type Slot = 'premarket' | 'open' | 'close';
export const SLOTS: Slot[] = ['premarket', 'open', 'close'];

export type Brief = { ticker: string; content: string; created_at: string; sources: Citation[]; price_at: number | null; cost_usd?: number };

const STOCK_PROMPT = `You are the research desk for 3x Hunter. Write a factual research brief on the stock below that
analysts and the assistant will reuse all day. Search the web now. Facts only: no advice, no buy/sell lean.

Format (markdown, 450-700 words, compact):
## {TICKER} brief, {timestamp ET}
- **Price:** last price, today's or the last session's move and the reason, 52-week range, market cap.
- **Valuation:** P/E, forward P/E, price/sales; versus its own history or peers where known.
- **Analysts:** consensus rating, number of analysts, mean/high/low target and implied upside, notable recent changes.
- **Latest quarter:** revenue and EPS vs estimates, growth, margins, free cash flow, guidance.
- **Upcoming events (next 6 months):** dated earnings, product, regulatory or macro events, each one line.
- **Last 7 days:** the 3-5 news items that matter, dated.
- **Bull points / Bear points:** 3 each, with numbers.
- **Data notes:** anything you could not confirm, conflicting figures across sources, delayed quotes.

Rules: every number comes from this search; name the source inline for key figures ("per Reuters"); use 2+ sources for
the price and the consensus target; write "not confirmed" instead of guessing; never invent tickers or events.`;

const MARKET_PROMPT = `You are the research desk for 3x Hunter. Write today's US market brief that the assistant will
reuse all day. Search the web now. Facts only, no advice.

Format (markdown, 400-600 words, compact):
## Market brief, {timestamp ET}
- **Indices:** S&P 500, Nasdaq, Dow, Russell 2000: level and move (futures if before the open).
- **Rates, dollar, oil, gold, bitcoin, VIX:** level and move.
- **What is driving the market:** 3-5 points, dated.
- **Sectors:** leaders and laggards today or last session, with moves.
- **Big movers:** 5-8 notable stocks with move and reason.
- **This week's calendar:** dated macro data, Fed speakers and major earnings.
- **Data notes:** anything not confirmed.

Rules: every number comes from this search, sources named inline for key figures, 2+ sources for index levels.`;

function etStamp(): string {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function expiry(): string {
  const day = new Date().getUTCDay();
  const hours = day === 5 || day === 6 || day === 0 ? WEEKEND_TTL_HOURS : TTL_HOURS;
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

type StockRow = { ticker: string; company_name: string | null; current_price: number | string | null };
let universe: { at: number; rows: StockRow[] } | null = null;

async function stockUniverse(): Promise<StockRow[]> {
  if (universe && Date.now() - universe.at < 10 * 60_000) return universe.rows;
  const { data } = await supabaseAdmin.from('stocks').select('ticker, company_name, current_price').limit(5000);
  universe = { at: Date.now(), rows: (data ?? []) as StockRow[] };
  return universe.rows;
}

// Uppercase words that are common in questions but also happen to be tickers.
const NOT_TICKERS = new Set(['A', 'I', 'AI', 'ALL', 'ANY', 'ARE', 'CEO', 'CFO', 'EPS', 'ETF', 'FOR', 'IPO', 'IT', 'NEW', 'NOW', 'ON', 'ONE', 'OR', 'OUT', 'PE', 'SEC', 'SO', 'THE', 'USA', 'US', 'YOU', 'GDP', 'CPI', 'FED', 'DD', 'IRA', 'TV', 'EV', 'BE', 'GO', 'HAS', 'CAN', 'BIG', 'KEY', 'RUN', 'TOP', 'BUY', 'WAY', 'SEE', 'LOW', 'HIGH', 'BEST', 'REAL', 'MOVE', 'PLAY', 'GOOD', 'FAST', 'NEXT', 'OPEN', 'COST', 'CASH', 'LOVE', 'LIFE', 'TECH']);
// Company names that are everyday words ("price target", "block", "match").
const COMMON_NAMES = new Set(['target', 'block', 'ball', 'match', 'gap', 'coach', 'best', 'progressive', 'discover', 'public', 'state', 'general', 'unity', 'snap', 'square', 'shift', 'carrier', 'fair', 'focus', 'trade', 'plug', 'rocket', 'sun', 'core']);
const SUFFIX = /\b(inc|incorporated|corp|corporation|co|company|ltd|plc|holdings|group|class [a-c]|the|n\.?v\.?|s\.?a\.?|limited)\b\.?/gi;

/** Tickers a question is about: $TSLA, TSLA, or the company name ("nvidia"), in the order they appear. */
export async function detectTickers(text: string, limit: number): Promise<string[]> {
  if (!text || limit <= 0) return [];
  const rows = await stockUniverse();
  const known = new Map(rows.map((r) => [r.ticker.toUpperCase(), r]));
  const found: { ticker: string; at: number }[] = [];
  for (const m of text.matchAll(/\$?\b[A-Z][A-Z.]{0,5}\b/g)) {
    const raw = m[0];
    const t = raw.replace(/^\$/, '');
    if (!known.has(t)) continue;
    if (!raw.startsWith('$') && (t.length < 2 || NOT_TICKERS.has(t))) continue;
    found.push({ ticker: t, at: m.index ?? 0 });
  }
  const lower = text.toLowerCase();
  for (const r of rows) {
    const name = (r.company_name ?? '').replace(SUFFIX, '').replace(/[,.&]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (name.length < 4 || COMMON_NAMES.has(name)) continue;
    const at = lower.search(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
    if (at >= 0) found.push({ ticker: r.ticker.toUpperCase(), at });
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.ticker))].slice(0, limit);
}

/** Latest usable brief per ticker: not expired, and the price has not moved more than STALE_MOVE since. */
export async function cachedBriefs(tickers: string[]): Promise<Map<string, Brief>> {
  const out = new Map<string, Brief>();
  if (!tickers.length) return out;
  const { data } = await supabaseAdmin
    .from('market_research')
    .select('ticker, content, created_at, sources, price_at')
    .in('ticker', tickers)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(tickers.length * 3);
  const prices = new Map((await stockUniverse()).map((r) => [r.ticker.toUpperCase(), Number(r.current_price)]));
  for (const row of (data ?? []) as Brief[]) {
    if (out.has(row.ticker)) continue;
    const now = prices.get(row.ticker);
    const then = row.price_at === null ? null : Number(row.price_at);
    if (then && now && Math.abs(now / then - 1) > STALE_MOVE) continue;
    out.set(row.ticker, row);
  }
  return out;
}

// Same-instance de-duplication: two users asking about NVDA at once share one research call.
const inFlight = new Map<string, Promise<Brief | null>>();

/** Researches one ticker (or MARKET) now, stores it for everyone and records its cost. */
type ResearchOpts = { trigger: 'schedule' | 'demand' | 'admin'; slot?: string; ownerId?: string | null; signal?: AbortSignal; batch?: boolean };

export function research(ticker: string, opts: ResearchOpts): Promise<Brief | null> {
  const key = ticker.toUpperCase();
  const existing = inFlight.get(key);
  if (existing) return existing;
  const job = runResearch(key, opts).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

async function runResearch(ticker: string, opts: ResearchOpts): Promise<Brief | null> {
  const isMarket = ticker === MARKET;
  const row = isMarket ? null : (await stockUniverse()).find((r) => r.ticker.toUpperCase() === ticker);
  const prompt = (isMarket ? MARKET_PROMPT : STOCK_PROMPT).replace('{TICKER}', ticker).replace('{timestamp ET}', `${etStamp()} ET`);
  const subject = isMarket
    ? 'Write the US market brief for right now.'
    : `Stock: ${ticker}${row?.company_name ? ` (${row.company_name})` : ''}. Last price in our database: ${row?.current_price ?? 'unknown'} (can be delayed).`;
  let text = '';
  const sources = new Map<string, string>();
  let usage: Usage = {};
  // Scheduled runs can use OpenRouter's half-price batch variant when RESEARCH_BATCH=1 (slower; fine before the open).
  const batch = opts.batch ?? (opts.trigger === 'schedule' && process.env.RESEARCH_BATCH === '1');
  const model = process.env.RESEARCH_MODEL || RESEARCH_MODEL;
  try {
    await streamChat(
      {
        tier: 'member',
        models: batch ? [`${model}:batch`, model] : [model, 'anthropic/claude-opus-5.5'],
        system: [{ text: prompt, cache: true }],
        messages: [{ role: 'user', content: subject }],
        maxTokens: MAX_TOKENS,
        // Low effort: a brief is gathering and summarizing, not deep reasoning; most of the cost is reading pages.
        effort: (process.env.RESEARCH_EFFORT as 'low' | 'medium' | 'high') || 'low',
        // 'medium' context: the brief needs facts, not whole pages; this is most of the research cost.
        webSearch: { maxResults: WEB_RESULTS, context: (process.env.RESEARCH_CONTEXT as 'low' | 'medium' | 'high') || 'medium' },
        signal: opts.signal,
        onUsage: (u) => {
          usage = addUsage(usage, u);
        },
      },
      {
        onText: (t) => {
          text += t;
        },
        onCitation: (c) => {
          if (sources.size < 12) sources.set(c.url, c.title);
        },
      }
    );
  } catch (error) {
    console.error('research failed', ticker, (error as Error)?.message ?? error);
    await recordUsage({ owner_id: opts.ownerId ?? null, kind: 'research', ticker, status: 'failed' }, usage);
    return null;
  }
  await recordUsage({ owner_id: opts.ownerId ?? null, kind: 'research', ticker }, usage);
  if (text.trim().length < 200) return null;
  const brief = {
    ticker,
    slot: opts.slot ?? 'demand',
    content: text.trim(),
    sources: [...sources].map(([url, title]) => ({ url, title })),
    price_at: row?.current_price === null || row?.current_price === undefined ? null : Number(row.current_price),
    expires_at: expiry(),
    model: usage.model ?? model,
    cost_usd: Number((usage.costUsd ?? 0).toFixed(6)),
    trigger: opts.trigger,
  };
  const { data } = await supabaseAdmin.from('market_research').insert(brief).select('ticker, content, created_at, sources, price_at, cost_usd').single();
  return (data as Brief | null) ?? { ...brief, created_at: new Date().toISOString() };
}

/**
 * Briefs for an answer: cached ones first; with `fresh`, missing tickers are researched now (in parallel) and saved for
 * everyone. Returns the briefs and how many came from the cache.
 */
export async function briefsFor(
  tickers: string[],
  opts: { fresh: boolean; includeMarket: boolean; ownerId: string; signal?: AbortSignal; onResearch?: (tickers: string[]) => void }
): Promise<{ briefs: Brief[]; hits: number; researched: number }> {
  const wanted = opts.includeMarket ? [MARKET, ...tickers] : tickers;
  const cached = await cachedBriefs(wanted);
  const missing = wanted.filter((t) => !cached.has(t));
  let researched = 0;
  if (opts.fresh && missing.length) {
    opts.onResearch?.(missing.map((t) => (t === MARKET ? 'the market' : t)));
    const results = await Promise.all(missing.map((t) => research(t, { trigger: 'demand', ownerId: opts.ownerId, signal: opts.signal })));
    for (const b of results) {
      if (b) {
        cached.set(b.ticker, b);
        researched++;
      }
    }
  }
  const briefs = wanted.map((t) => cached.get(t)).filter((b): b is Brief => Boolean(b));
  return { briefs, hits: briefs.length - researched, researched };
}

/** The briefs as a prompt block. */
export function briefsBlock(briefs: Brief[]): string {
  if (!briefs.length) return '';
  return `<research>\nShared research briefs written by 3x Hunter's research desk from live web searches. Treat them as this turn's web results: cite them as "per 3x Hunter research, <time>" or by the source they name. Each shows when it was written.\n${briefs
    .map((b) => `<brief ticker="${b.ticker}" written="${b.created_at}">\n${b.content}\n${b.sources.length ? `Sources: ${b.sources.map((s) => s.url).join(' ')}` : ''}\n</brief>`)
    .join('\n')}\n</research>`;
}

// ---------- scheduled runs ----------

/**
 * Which daily slots run at the current size of the business. Early on one pre-market run covers it; at 20+ paying
 * customers a post-close run catches after-hours earnings; at 1,000+ an after-open run catches the opening move.
 * Override with RESEARCH_SLOTS (comma list).
 */
export function activeSlots(paying: number): Slot[] {
  const forced = (process.env.RESEARCH_SLOTS ?? '').split(',').map((s) => s.trim()).filter((s): s is Slot => (SLOTS as string[]).includes(s));
  if (forced.length) return forced;
  if (paying >= 1000) return ['premarket', 'open', 'close'];
  if (paying >= 20) return ['premarket', 'close'];
  return ['premarket'];
}

/** Average real cost of one brief (measured on staging, Nov 2026: Sonnet 5.5, low effort, 4 web results). */
const BRIEF_COST = Number(process.env.RESEARCH_BRIEF_COST ?? 0.15);
const TRADING_DAYS = 22;

/**
 * Scheduled research is paid for out of revenue: 10% of MRR a month (at least $15, RESEARCH_BUDGET_USD to override),
 * split across trading days and active slots. Anything not pre-researched is researched on demand by the first person
 * who asks, inside the credits they pay, and then shared.
 */
export function researchBudget(mrr: number): number {
  const forced = Number(process.env.RESEARCH_BUDGET_USD);
  return Number.isFinite(forced) && forced > 0 ? forced : Math.max(15, mrr * 0.1);
}

/** Stocks per run (besides the market brief) that the budget pays for, between 3 and RESEARCH_MAX_STOCKS (100). */
export function coverage(mrr: number, slots: number): number {
  const cap = Number(process.env.RESEARCH_MAX_STOCKS ?? 100);
  const perRun = researchBudget(mrr) / TRADING_DAYS / Math.max(1, slots);
  return Math.max(3, Math.min(cap, Math.floor(perRun / BRIEF_COST) - 1));
}

export async function businessSize(): Promise<{ paying: number; mrr: number }> {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, interval')
    .in('plan', ['pro', 'pro_plus'])
    .in('status', ['active', 'trialing', 'past_due'])
    .limit(100000);
  const rows = (data ?? []) as { plan: string; interval: string | null }[];
  const mrr = rows.reduce((sum, r) => sum + (r.plan === 'pro_plus' ? (r.interval === 'year' ? 399 / 12 : 49) : r.interval === 'year' ? 149 / 12 : 19), 0);
  return { paying: rows.length, mrr };
}

/** Stocks users follow most (watchlists and portfolios), then the highest 3x scores. */
async function mostFollowed(n: number): Promise<string[]> {
  const [items, positions, top] = await Promise.all([
    supabaseAdmin.from('watchlist_items').select('ticker').limit(20000),
    supabaseAdmin.from('positions').select('ticker').limit(20000),
    supabaseAdmin.from('stocks').select('ticker').not('is_active', 'is', false).order('three_x_score', { ascending: false, nullsFirst: false }).limit(n),
  ]);
  const counts = new Map<string, number>();
  for (const r of [...((items.data ?? []) as { ticker: string }[]), ...((positions.data ?? []) as { ticker: string }[])]) {
    const t = r.ticker?.toUpperCase();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const followed = [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const ranked = ((top.data ?? []) as { ticker: string }[]).map((r) => r.ticker.toUpperCase());
  return [...new Set([...followed, ...ranked])].slice(0, n);
}

export type RunResult = { slot: string; ran: boolean; reason?: string; paying?: number; planned?: number; written: number; skipped: number; costUsd: number };

/**
 * One scheduled research run: the market brief, then the most-followed stocks that do not already have a fresh brief.
 * Stops before the function's time limit; whatever is left is researched on demand by the first person who asks.
 */
export async function runScheduledResearch(slot: string, opts: { force?: boolean; deadlineMs?: number; limit?: number; batch?: boolean; tickers?: string[] } = {}): Promise<RunResult> {
  const started = Date.now();
  const deadline = opts.deadlineMs ?? 240_000;
  if (process.env.RESEARCH_ENABLED === '0') return { slot, ran: false, reason: 'disabled', written: 0, skipped: 0, costUsd: 0 };
  const { paying, mrr } = await businessSize();
  const slots = activeSlots(paying);
  if (!opts.force && !(slots as string[]).includes(slot)) {
    return { slot, ran: false, reason: `slot inactive at ${paying} paying customers`, paying, written: 0, skipped: 0, costUsd: 0 };
  }
  if ((await spentToday()) >= dailyLimitUsd()) return { slot, ran: false, reason: 'daily AI budget reached', paying, written: 0, skipped: 0, costUsd: 0 };

  const planned = opts.tickers?.length ? opts.tickers : [MARKET, ...(await mostFollowed(opts.limit ?? coverage(mrr, slots.length)))];
  // Skip anything researched in the last 2 hours (an earlier batch or an on-demand answer already covered it).
  const recentCut = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data: recent } = await supabaseAdmin.from('market_research').select('ticker').in('ticker', planned).gt('created_at', recentCut);
  const done = new Set(((recent ?? []) as { ticker: string }[]).map((r) => r.ticker));
  const queue = planned.filter((t) => !done.has(t));
  let written = 0;
  let costUsd = 0;
  const CONCURRENCY = 6;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      // Each brief takes ~30-60s; do not start one that cannot finish before the deadline.
      if (Date.now() - started > deadline - 70_000) return;
      const t = queue.shift();
      if (!t) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(10_000, deadline - (Date.now() - started)));
      const b = await research(t, { trigger: opts.force ? 'admin' : 'schedule', slot, signal: controller.signal, batch: opts.batch });
      clearTimeout(timer);
      if (b) {
        written++;
        costUsd += Number(b.cost_usd ?? 0);
      }
    }
  });
  await Promise.all(workers);
  return { slot, ran: true, paying, planned: planned.length, written, skipped: queue.length + done.size, costUsd: Number(costUsd.toFixed(4)) };
}
