// AI economics: answer sizes, what each plan may use, credit prices and the real-cost ledger.
// 1 credit is priced at about 1 cent of model cost, so a plan's monthly credits are its AI budget in cents.
// Credits per size are fixed (predictable for users); the real cost of each call is recorded next to it, so cache hits
// and cheap answers are margin and the admin page shows cost vs credits per size.
import { supabaseAdmin, hasServiceRole } from './_supabase.js';
import type { Usage } from './_llm.js';

export type { Usage };

export type Size = 'quick' | 'standard' | 'researched' | 'deep' | 'report';
export type Level = 'free' | 'pro' | 'pro_plus';

export const SIZES: Size[] = ['quick', 'standard', 'researched', 'deep', 'report'];

const OPUS = 'anthropic/claude-opus-5.5';
const SONNET = 'anthropic/claude-sonnet-5.5';
const HAIKU = 'anthropic/claude-haiku-5.5';

export type SizeSpec = {
  label: string;
  credits: number;
  models: string[];
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  /** Live web results for the answer itself (research briefs are separate and shared). */
  web: number;
  /** Research briefs: 'none', reuse cached only, or research missing tickers now. */
  research: 'none' | 'cached' | 'fresh';
  /** Tickers researched per answer at most. */
  researchTickers: number;
  continuations: number;
  minLevel: Level;
};

export const SIZE_SPECS: Record<Size, SizeSpec> = {
  quick: { label: 'Quick', credits: 1, models: [HAIKU, SONNET], effort: 'low', maxTokens: 1500, web: 0, research: 'none', researchTickers: 0, continuations: 0, minLevel: 'free' },
  standard: { label: 'Standard', credits: 4, models: [SONNET, HAIKU], effort: 'low', maxTokens: 6000, web: 0, research: 'cached', researchTickers: 3, continuations: 0, minLevel: 'free' },
  researched: { label: 'Researched', credits: 12, models: [SONNET, OPUS], effort: 'medium', maxTokens: 16000, web: 0, research: 'fresh', researchTickers: 2, continuations: 1, minLevel: 'free' },
  deep: { label: 'Deep dive', credits: 40, models: [OPUS, SONNET], effort: 'high', maxTokens: 32000, web: 6, research: 'fresh', researchTickers: 3, continuations: 1, minLevel: 'pro' },
  report: { label: 'Full report', credits: 100, models: [OPUS, SONNET], effort: 'high', maxTokens: 64000, web: 10, research: 'fresh', researchTickers: 5, continuations: 2, minLevel: 'pro_plus' },
};

export const ROUTER_MODEL = HAIKU;
export const SUMMARY_MODEL = HAIKU;
export const GUEST_MODEL = SONNET;
export const RESEARCH_MODEL = SONNET;

/** Monthly credits (≈ cents of AI cost) and anti-abuse daily message caps per plan. */
export const LEVELS: Record<Level, { credits: number; perDay: number; label: string }> = {
  free: { credits: 100, perDay: 25, label: 'Free' },
  pro: { credits: 600, perDay: 120, label: 'Pro' },
  pro_plus: { credits: 1600, perDay: 250, label: 'Pro+' },
};

const RANK: Record<Level, number> = { free: 0, pro: 1, pro_plus: 2 };
export const levelAllows = (level: Level, size: Size) => RANK[level] >= RANK[SIZE_SPECS[size].minLevel];

/** Credit pack sold on top of a paid plan. 250 credits for $10: ~$2.50 of model cost at most. */
export const CREDIT_PACK = { lookupKey: '3xh_credits_250', credits: 250, amount: 1000, label: '$10 for 250 credits' };

/**
 * Global circuit breaker: once today's total model spend passes this, answers are held to Quick/Standard and research
 * pauses until midnight UTC. Admins are exempt. Set AI_DAILY_LIMIT_USD to change it.
 */
export const dailyLimitUsd = () => Number(process.env.AI_DAILY_LIMIT_USD ?? 25);

// List prices per token (OpenRouter, Nov 2026), used only when a response does not report its own cost.
const PRICE: Record<string, [number, number]> = {
  [OPUS]: [4e-6, 20e-6],
  [SONNET]: [2e-6, 10e-6],
  [HAIKU]: [0.1e-6, 0.5e-6],
};

export function costOf(u: Usage): number {
  if (typeof u.costUsd === 'number' && Number.isFinite(u.costUsd)) return u.costUsd;
  const base = (u.model ?? '').replace(/:.*$/, '');
  const [inp, out] = PRICE[base] ?? PRICE[OPUS];
  return (u.inputTokens ?? 0) * inp + (u.outputTokens ?? 0) * out;
}

/** Sums several calls (research, continuations) into one ledger line. */
export function addUsage(a: Usage, b: Usage): Usage {
  return {
    model: a.model ?? b.model,
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    costUsd: costOf(a) + costOf(b),
  };
}

type Row = {
  owner_id?: string | null;
  kind: 'answer' | 'guest' | 'research' | 'router' | 'summary' | 'voice';
  size?: string | null;
  ticker?: string | null;
  research_hits?: number;
  status?: 'ok' | 'failed';
};

/** Records one model call's real cost. Never throws: the ledger must not break an answer. */
export async function recordUsage(row: Row, usage: Usage): Promise<void> {
  if (!hasServiceRole) return;
  try {
    await supabaseAdmin.from('ai_usage').insert({
      ...row,
      model: usage.model ?? null,
      input_tokens: usage.inputTokens ?? null,
      output_tokens: usage.outputTokens ?? null,
      cost_usd: Number(costOf(usage).toFixed(6)),
    });
  } catch (error) {
    console.error('ai usage record failed', (error as Error)?.message ?? error);
  }
}

/** Fills in a charged answer's real cost once it finishes, or refunds it when nothing was answered. */
export async function settleCharge(id: number, outcome: { usage: Usage; researchHits: number; answered: boolean; size: Size }): Promise<void> {
  try {
    await supabaseAdmin
      .from('ai_usage')
      .update({
        status: outcome.answered ? 'ok' : 'refunded',
        size: outcome.size,
        ...(outcome.answered ? {} : { credits: 0, from_pack: 0 }),
        model: outcome.usage.model ?? null,
        input_tokens: outcome.usage.inputTokens ?? null,
        output_tokens: outcome.usage.outputTokens ?? null,
        cost_usd: Number(costOf(outcome.usage).toFixed(6)),
        research_hits: outcome.researchHits,
      })
      .eq('id', id);
  } catch (error) {
    console.error('ai charge settle failed', (error as Error)?.message ?? error);
  }
}

export type Balance = { monthly_left: number; pack_left: number; allowance: number; resets_at: string };

export async function getBalance(userId: string, level: Level): Promise<Balance | null> {
  const { data, error } = await supabaseAdmin.rpc('ai_balance', { p_owner: userId, p_allowance: LEVELS[level].credits });
  return error ? null : (data as Balance);
}

export async function charge(userId: string, level: Level, size: Size, allowance = LEVELS[level].credits): Promise<(Balance & { ok: boolean; id?: number }) | null> {
  const { data, error } = await supabaseAdmin.rpc('ai_charge', {
    p_owner: userId,
    p_credits: SIZE_SPECS[size].credits,
    p_allowance: allowance,
    p_size: size,
  });
  if (error) {
    console.error('ai charge failed', error.message);
    return null;
  }
  return data as Balance & { ok: boolean; id?: number };
}

/** Today's total model spend across the app (UTC day). */
export async function spentToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin.from('ai_usage').select('cost_usd').gte('created_at', start.toISOString()).limit(20000);
  return ((data ?? []) as { cost_usd: number | string }[]).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
}
