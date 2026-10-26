import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelation } from './_supabase.js';

// Per-account context for the research assistant: the signed-in user's profile, portfolio and summaries of their
// earlier chats. Every query runs on the caller's RLS-scoped client and is also filtered by owner, so nothing here can
// read another account's rows. Nothing is cached between requests; each answer is built from this account's data only.

export type Turn = { role: 'user' | 'assistant'; content: string };

const HISTORY_SESSIONS = 8;
const SUMMARIZE_BATCH = 3;
const TRANSCRIPT_TURNS = 40;
const POSITION_LIMIT = 0.25;
const SECTOR_LIMIT = 0.4;

type SessionRow = { id: string; started_at: string; transcript: Turn[] | null; summary: string | null };
type Quote = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  current_price: number | string | null;
  three_x_score: number | null;
  risk_level: string | null;
  target_mean_price: number | string | null;
};

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const usd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 })}`;
const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

/** Returns the caller's session id: the one they sent if it is theirs, otherwise a new session. */
export async function openSession(db: SupabaseClient, userId: string, requested: unknown): Promise<{ id: string; isNew: boolean } | null> {
  if (typeof requested === 'string' && requested) {
    const { data } = await db.from('assistant_sessions').select('id').eq('id', requested).eq('owner_id', userId).maybeSingle();
    if (data?.id) return { id: data.id as string, isNew: false };
  }
  const { data, error } = await db.from('assistant_sessions').insert({ owner_id: userId }).select('id').single();
  if (error || !data) return null;
  return { id: data.id as string, isNew: true };
}

/** Saves the session transcript (capped) so it can be summarized once the user moves on. */
export async function saveTranscript(db: SupabaseClient, userId: string, sessionId: string, turns: Turn[]): Promise<void> {
  const transcript = turns.slice(-TRANSCRIPT_TURNS);
  await db
    .from('assistant_sessions')
    .update({ transcript, message_count: transcript.length, last_message_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('owner_id', userId);
}

const SUMMARY_PROMPT = `Summarize this 3x Hunter research chat for the same user's future sessions. Under 150 words, plain
bullets. Keep: what they asked about, tickers discussed with the price and date context, verdicts or leans given (short and
long term), their stated goals, amounts, horizon and risk tolerance, decisions they said they made, and open follow-ups
(for example "wants a re-check after the Nov 15 earnings"). Drop greetings and generic explanations. Write about "the user".`;

/** Summarizes this account's finished sessions (all but the current one) and drops their raw transcripts. */
export async function summarizeFinishedSessions(
  db: SupabaseClient,
  client: Anthropic,
  model: string,
  userId: string,
  currentId: string
): Promise<void> {
  const { data } = await db
    .from('assistant_sessions')
    .select('id, started_at, transcript, summary')
    .eq('owner_id', userId)
    .is('summary', null)
    .neq('id', currentId)
    .gt('message_count', 0)
    .order('last_message_at', { ascending: false })
    .limit(SUMMARIZE_BATCH);
  const rows = (data ?? []) as SessionRow[];
  await Promise.all(
    rows.map(async (row) => {
      const turns = Array.isArray(row.transcript) ? row.transcript : [];
      if (!turns.length) return;
      const text = turns.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`).join('\n\n');
      try {
        const message = await client.messages.create({
          model,
          max_tokens: 1000,
          output_config: { effort: 'low' },
          system: SUMMARY_PROMPT,
          messages: [{ role: 'user', content: `Chat from ${row.started_at.slice(0, 10)}:\n\n${text}` }],
        });
        const summary = message.content
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('')
          .trim();
        if (!summary) return;
        await db
          .from('assistant_sessions')
          .update({ summary, summarized_at: new Date().toISOString(), transcript: [] })
          .eq('id', row.id)
          .eq('owner_id', userId);
      } catch (error) {
        // Left unsummarized; the next new session retries it.
        console.error('assistant summary failed', (error as Error)?.message ?? error);
      }
    })
  );
}

async function profileBlock(db: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await db
    .from('user_preferences')
    .select('goal, experience, risk, sectors')
    .eq('owner_id', userId)
    .maybeSingle();
  if (error || !data) return 'No profile saved.';
  const p = data as { goal: string | null; experience: string | null; risk: string | null; sectors: string[] | null };
  return [
    `Goal: ${p.goal ?? 'not set'}`,
    `Experience: ${p.experience ?? 'not set'}`,
    `Risk tolerance: ${p.risk ?? 'not set'}`,
    `Sectors of interest: ${p.sectors?.length ? p.sectors.join(', ') : 'none set'}`,
  ].join('\n');
}

async function portfolioBlock(db: SupabaseClient, userId: string): Promise<string> {
  const [portfolios, positions] = await Promise.all([
    db.from('portfolios').select('id, name').eq('owner_id', userId),
    db.from('positions').select('portfolio_id, ticker, shares, cost_basis').eq('owner_id', userId),
  ]);
  if (portfolios.error || positions.error) {
    return isMissingRelation(portfolios.error) || isMissingRelation(positions.error) ? 'Portfolios are not available.' : 'Portfolio could not be loaded.';
  }
  const names = new Map(((portfolios.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const rows = (positions.data ?? []) as { portfolio_id: string; ticker: string; shares: number | string; cost_basis: number | string }[];
  if (!rows.length) return 'No holdings saved yet.';

  const tickers = [...new Set(rows.map((r) => r.ticker.toUpperCase()))];
  const { data: quoteRows } = await db
    .from('stocks')
    .select('ticker, company_name, sector, current_price, three_x_score, risk_level, target_mean_price')
    .in('ticker', tickers);
  const quotes = new Map(((quoteRows ?? []) as Quote[]).map((q) => [q.ticker.toUpperCase(), q]));

  const out: string[] = [];
  for (const [portfolioId, name] of names) {
    const held = rows.filter((r) => r.portfolio_id === portfolioId);
    if (!held.length) continue;
    const lines = held.map((r) => {
      const q = quotes.get(r.ticker.toUpperCase());
      const shares = Number(r.shares);
      const cost = Number(r.cost_basis);
      const price = num(q?.current_price);
      return { r, q, shares, cost, price, value: price === null ? null : shares * price };
    });
    const total = lines.reduce((s, l) => s + (l.value ?? 0), 0);
    const costTotal = lines.reduce((s, l) => s + l.shares * l.cost, 0);
    const sectors = new Map<string, number>();
    out.push(`Portfolio "${name}": ${usd(total)} market value (cost ${usd(costTotal)}, ${costTotal ? pct(total / costTotal - 1) : 'n/a'})`);
    for (const l of lines.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))) {
      const sector = l.q?.sector ?? 'Unclassified';
      if (l.value !== null) sectors.set(sector, (sectors.get(sector) ?? 0) + l.value);
      const target = num(l.q?.target_mean_price);
      out.push(
        `- ${l.r.ticker.toUpperCase()}${l.q?.company_name ? ` (${l.q.company_name})` : ''}: ${l.shares} sh @ ${usd(l.cost)} cost` +
          (l.price === null
            ? ', no current price'
            : `, price ${usd(l.price)}, value ${usd(l.value!)}, weight ${total ? ((l.value! / total) * 100).toFixed(1) : '0'}%, P/L ${pct(l.price / l.cost - 1)}`) +
          `, sector ${sector}` +
          (l.q?.three_x_score != null ? `, 3x score ${l.q.three_x_score}` : '') +
          (l.q?.risk_level ? `, risk ${l.q.risk_level}` : '') +
          (target !== null && l.price ? `, analyst target ${usd(target)} (${pct(target / l.price - 1)})` : '')
      );
    }
    const flags = [
      ...lines.filter((l) => total && (l.value ?? 0) / total > POSITION_LIMIT).map((l) => `${l.r.ticker.toUpperCase()} is over ${POSITION_LIMIT * 100}% of this portfolio`),
      ...[...sectors].filter(([s, v]) => s !== 'Unclassified' && total && v / total > SECTOR_LIMIT).map(([s]) => `${s} is over ${SECTOR_LIMIT * 100}% of this portfolio`),
    ];
    out.push(`Sectors: ${[...sectors].sort((a, b) => b[1] - a[1]).map(([s, v]) => `${s} ${((v / total) * 100).toFixed(0)}%`).join(', ')}`);
    if (flags.length) out.push(`Flags: ${flags.join('; ')}`);
  }
  out.push('Prices are from the 3x Hunter database (last refresh), not live; search for live quotes before quoting them.');
  return out.join('\n');
}

async function historyBlock(db: SupabaseClient, userId: string, currentId: string): Promise<string> {
  const { data } = await db
    .from('assistant_sessions')
    .select('started_at, summary')
    .eq('owner_id', userId)
    .neq('id', currentId)
    .not('summary', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(HISTORY_SESSIONS);
  const rows = (data ?? []) as { started_at: string; summary: string }[];
  if (!rows.length) return 'No earlier conversations.';
  return rows.map((r) => `Session on ${r.started_at.slice(0, 10)}:\n${r.summary}`).join('\n\n');
}

/** The account block placed in the system prompt for this user's request. */
export async function accountContext(db: SupabaseClient, userId: string, currentId: string): Promise<string> {
  const [profile, portfolio, history] = await Promise.all([
    profileBlock(db, userId),
    portfolioBlock(db, userId),
    historyBlock(db, userId, currentId),
  ]);
  return [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    `<user_profile>\n${profile}\n</user_profile>`,
    `<portfolio>\n${portfolio}\n</portfolio>`,
    `<past_sessions>\n${history}\n</past_sessions>`,
  ].join('\n\n');
}
