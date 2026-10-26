import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelation } from './_supabase.js';
import { completeChat } from './_llm.js';

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

const SUMMARY_PROMPT = `Summarize this 3x Hunter research chat for the same user's future sessions. Under 220 words, plain
bullets, grouped as: Asked about; Verdicts given; Ideas suggested; About the user; Follow-ups.
Keep: tickers discussed with the price and date context; verdicts or leans given (short and long term) with the key
reason; every stock idea suggested, each with its industry, the reason it was suggested, the holding it relates to and
its price on that date; the user's stated goals, amounts, horizon and risk tolerance, decisions they said they made and
how they reacted to ideas; open follow-ups (for example "wants a re-check after the Nov 15 earnings"). Drop greetings,
charts and generic explanations. Write about "the user".`;

/** Summarizes this account's finished sessions (all but the current one) and drops their raw transcripts. */
export async function summarizeFinishedSessions(
  db: SupabaseClient,
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
        const summary = await completeChat({
          tier: 'member',
          system: [{ text: SUMMARY_PROMPT }],
          messages: [{ role: 'user', content: `Chat from ${row.started_at.slice(0, 10)}:\n\n${text}` }],
          maxTokens: 1000,
          effort: 'low',
        });
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

/** What the user follows and watches for: watchlists with notes, stocks they added, alerts, recent alert hits and
 * upcoming catalysts on those names. Together with the portfolio this is how the assistant reads their behavior. */
async function activityBlock(db: SupabaseClient, userId: string): Promise<string> {
  const [lists, added, alerts, hits] = await Promise.all([
    db.from('watchlists').select('id, name').eq('owner_id', userId),
    db.from('stocks').select('ticker, added_at').eq('added_by', userId).order('added_at', { ascending: false }).limit(25),
    db.from('alerts').select('ticker, kind, threshold').eq('owner_id', userId).eq('is_active', true).limit(30),
    db.from('alert_events').select('ticker, message, triggered_at').eq('owner_id', userId).order('triggered_at', { ascending: false }).limit(10),
  ]);
  const listRows = (lists.data ?? []) as { id: string; name: string }[];
  const items = listRows.length
    ? (((await db.from('watchlist_items').select('watchlist_id, ticker, notes, tags, added_at').in('watchlist_id', listRows.map((l) => l.id))).data ?? []) as {
        watchlist_id: string;
        ticker: string;
        notes: string | null;
        tags: string[] | null;
        added_at: string;
      }[])
    : [];
  const followed = [...new Set([...items.map((i) => i.ticker.toUpperCase()), ...((added.data ?? []) as { ticker: string }[]).map((r) => r.ticker.toUpperCase())])];
  const [quotes, events] = followed.length
    ? await Promise.all([
        db.from('stocks').select('ticker, current_price, three_x_score, risk_level').in('ticker', followed),
        db
          .from('catalysts')
          .select('ticker, event_type, title, event_date, date_status')
          .in('ticker', followed)
          .gte('event_date', new Date().toISOString().slice(0, 10))
          .lte('event_date', new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10))
          .order('event_date')
          .limit(25),
      ])
    : [{ data: [] }, { data: [] }];
  const quote = new Map(((quotes.data ?? []) as { ticker: string; current_price: unknown; three_x_score: number | null; risk_level: string | null }[]).map((q) => [q.ticker.toUpperCase(), q]));
  const describe = (t: string) => {
    const q = quote.get(t);
    const price = num(q?.current_price);
    return `${t}${price !== null ? ` ${usd(price)}` : ''}${q?.three_x_score != null ? `, 3x ${q.three_x_score}` : ''}${q?.risk_level ? `, ${q.risk_level} risk` : ''}`;
  };

  const out: string[] = [];
  for (const list of listRows) {
    const rows = items.filter((i) => i.watchlist_id === list.id);
    if (!rows.length) continue;
    out.push(`Watchlist "${list.name}": ` + rows.map((r) => {
      const extra = [r.notes?.trim() && `note "${r.notes.trim().slice(0, 120)}"`, r.tags?.length && `tags ${r.tags.join('/')}`, `added ${r.added_at.slice(0, 10)}`].filter(Boolean).join(', ');
      return `${describe(r.ticker.toUpperCase())} (${extra})`;
    }).join('; '));
  }
  const addedRows = (added.data ?? []) as { ticker: string; added_at: string | null }[];
  if (addedRows.length) out.push(`Stocks they added to 3x Hunter: ${addedRows.map((r) => `${r.ticker.toUpperCase()}${r.added_at ? ` (${r.added_at.slice(0, 10)})` : ''}`).join(', ')}`);
  const alertRows = (alerts.data ?? []) as { ticker: string; kind: string; threshold: number | null }[];
  if (alertRows.length) out.push(`Active alerts: ${alertRows.map((a) => `${a.ticker} ${a.kind}${a.threshold != null ? ` ${a.threshold}` : ''}`).join('; ')}`);
  const hitRows = (hits.data ?? []) as { ticker: string; message: string; triggered_at: string }[];
  if (hitRows.length) out.push(`Recent alert hits: ${hitRows.map((h) => `${h.triggered_at.slice(0, 10)} ${h.ticker}: ${h.message}`).join('; ')}`);
  const eventRows = (events.data ?? []) as { ticker: string; event_type: string; title: string; event_date: string; date_status: string | null }[];
  if (eventRows.length) out.push(`Upcoming catalysts on their stocks (90 days): ${eventRows.map((e) => `${e.event_date}${e.date_status === 'estimated' ? ' (est.)' : ''} ${e.ticker} ${e.title}`).join('; ')}`);
  return out.length ? out.join('\n') : 'No watchlists, alerts or added stocks yet.';
}

/** The account block placed in the system prompt for this user's request. */
export async function accountContext(db: SupabaseClient, userId: string, currentId: string): Promise<string> {
  const [profile, portfolio, activity, history] = await Promise.all([
    profileBlock(db, userId),
    portfolioBlock(db, userId),
    activityBlock(db, userId).catch(() => 'Activity could not be loaded.'),
    historyBlock(db, userId, currentId),
  ]);
  return [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    `<user_profile>\n${profile}\n</user_profile>`,
    `<portfolio>\n${portfolio}\n</portfolio>`,
    `<activity>\n${activity}\n</activity>`,
    `<past_sessions>\n${history}\n</past_sessions>`,
  ].join('\n\n');
}
