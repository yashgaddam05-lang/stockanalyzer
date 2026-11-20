import { sendMethodNotAllowed, supabase, type ApiRequest, type ApiResponse } from '../_supabase.js';
import { ASSISTANT_KNOWLEDGE } from '../_assistant-knowledge.js';
import { PLAN_PRICES } from '../_plan.js';
import { CREDIT_PACK, LEVELS } from '../_ai.js';

// GET /api/agent-knowledge -> live product facts for external agents (the Vapi voice agent).
// Public, product info only (no user data). Built from the same knowledge the in-app assistant uses,
// plus live prices, credits, site status and data freshness, so the agent stays current with every deploy.
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    sendMethodNotAllowed(response, ['GET', 'POST']);
    return;
  }
  const usd = (cents: number) => `$${(cents / 100).toFixed(0)}`;
  const [maint, total, latest] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'maintenance').maybeSingle(),
    supabase.from('stocks').select('id', { count: 'exact', head: true }).neq('is_active', false),
    supabase.from('stocks').select('last_refreshed_at').order('last_refreshed_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);
  const m = (maint.data?.value ?? {}) as { enabled?: boolean; message?: string };

  const live = [
    `# Live facts (as of ${new Date().toISOString()}; these override anything older)`,
    `- Site status: ${m.enabled ? `MAINTENANCE MODE is on. Tell callers the site is briefly down: "${m.message ?? ''}"` : 'live and working normally'}.`,
    `- Plans: Free ($0, ${LEVELS.free.credits} AI credits a month). Pro ${usd(PLAN_PRICES.pro.month.amount)}/month or ${usd(PLAN_PRICES.pro.year.amount)}/year (${LEVELS.pro.credits} credits). ` +
      `Pro+ ${usd(PLAN_PRICES.pro_plus.month.amount)}/month or ${usd(PLAN_PRICES.pro_plus.year.amount)}/year (${LEVELS.pro_plus.credits} credits). ` +
      `Credit pack: ${CREDIT_PACK.credits} credits for ${usd(CREDIT_PACK.amount)}. No credit card needed for Free.`,
    `- Stocks tracked right now: ${total.count ?? 'about 560'}.`,
    latest.data?.last_refreshed_at ? `- Most recent data refresh: ${latest.data.last_refreshed_at}.` : '',
    '- Website: 3xhunter.com. Support email: customercare@3xhunter.com.',
  ]
    .filter(Boolean)
    .join('\n');

  const knowledge = `${live}\n\n${ASSISTANT_KNOWLEDGE}`;
  // Vapi function tools POST { message: { toolCallList: [{ id }] } } and expect { results: [{ toolCallId, result }] }.
  const body = (typeof request.body === 'string' ? safeJson(request.body) : request.body) as
    | { message?: { toolCallList?: { id?: string }[]; toolCalls?: { id?: string }[] } }
    | undefined;
  const calls = body?.message?.toolCallList ?? body?.message?.toolCalls ?? [];
  if (request.method === 'POST' && calls.length) {
    response.status(200).json({ results: calls.map((c) => ({ toolCallId: c.id ?? '', result: knowledge })) });
    return;
  }
  response.setHeader?.('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  response.status(200).json({ updatedAt: new Date().toISOString(), maintenance: m.enabled === true, knowledge });
}
