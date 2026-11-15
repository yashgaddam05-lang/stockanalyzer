import {
  getQueryValue,
  isUuid,
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  sendUnauthorized,
  supabaseAdmin,
  TICKER_RE,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import { LIMITS, getPlan } from '../_plan.js';
import { loadPrices, refreshPaperPrices, valueAccounts, type Holding, type PaperRow } from '../_paper.js';

// Virtual paper accounts: the 8 standard V01-V08 accounts plus the caller's own experiments.
// Accounts are immutable once created, so the original hypothesis is never rewritten.

const COLUMNS = 'id, user_id, code, name, stocks, bonds, cash, sleeve, holdings, benchmark, start_value, target_multiple, horizon_years, assumptions, version, created_at';
const SLEEVES = ['market', 'mix', 'picks'] as const;
const BOTS = ['steady', 'balanced', 'growth', 'moonshot'];

function round(w: number) {
  return Math.round(w * 1e6) / 1e6;
}

function build(stocks: number, bonds: number, cash: number, sleeve: (typeof SLEEVES)[number], picks: string[]): Holding[] {
  const out = new Map<string, number>();
  const add = (s: string, w: number) => w > 0 && out.set(s, round((out.get(s) ?? 0) + w));
  const st = stocks / 100;
  if (sleeve === 'market' || picks.length === 0) {
    add('VTI', st * 0.7);
    add('VXUS', st * 0.3);
  } else if (sleeve === 'mix') {
    add('VTI', st * 0.4);
    add('VXUS', st * 0.3);
    for (const p of picks) add(p, (st * 0.3) / picks.length);
  } else {
    for (const p of picks) add(p, st / picks.length);
  }
  add('VGSH', bonds / 200);
  add('BND', bonds / 200);
  add('SGOV', cash / 100);
  return [...out].map(([symbol, weight]) => ({ symbol, weight }));
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const auth = await resolveAuth(request);
  if (auth.kind !== 'user') {
    sendUnauthorized(response);
    return;
  }
  try {
    if (request.method === 'GET') {
      const { data, error } = await auth.db.from('paper_accounts').select(COLUMNS).order('code', { ascending: true, nullsFirst: false }).order('created_at');
      if (error) {
        sendServerError(response);
        return;
      }
      const rows = (data ?? []) as PaperRow[];
      const symbols = [...new Set(rows.flatMap((r) => [...r.holdings, ...r.benchmark].map((h) => h.symbol)).concat('VTI'))];
      const prices = await loadPrices(symbols);
      const plan = await getPlan(auth.userId, auth.db);
      response.setHeader?.('Cache-Control', 'private, no-store');
      response.status(200).json({
        accounts: valueAccounts(rows, prices),
        limit: LIMITS[plan.plan].maxPaperAccounts,
        plan: plan.plan,
      });
      return;
    }

    if (request.method === 'POST') {
      const body = readJsonBody(request);
      if (!body) {
        sendBadRequest(response, 'Body must be JSON.');
        return;
      }
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
      const [stocks, bonds, cash] = [body.stocks, body.bonds, body.cash].map((v) => (Number.isInteger(v) ? (v as number) : -1));
      const sleeve = SLEEVES.find((s) => s === body.sleeve);
      const multiple = Number(body.targetMultiple);
      const horizon = Number(body.horizonYears);
      const bot = typeof body.bot === 'string' && BOTS.includes(body.bot) ? body.bot : null;
      const rawPicks = Array.isArray(body.picks) ? body.picks : [];
      if (!name || [stocks, bonds, cash].some((v) => v < 0 || v > 100) || stocks + bonds + cash !== 100) {
        sendBadRequest(response, 'Name and a stock/bond/cash mix adding to 100% are required.');
        return;
      }
      if (!sleeve || !(multiple >= 1.5 && multiple <= 10) || !(Number.isInteger(horizon) && horizon >= 1 && horizon <= 30)) {
        sendBadRequest(response, 'Invalid strategy, target or horizon.');
        return;
      }
      const picks = [...new Set(rawPicks.filter((t): t is string => typeof t === 'string').map((t) => t.toUpperCase()).filter((t) => TICKER_RE.test(t)))].slice(0, 30);
      if (sleeve !== 'market' && stocks > 0 && picks.length < 5) {
        sendBadRequest(response, 'Pick at least 5 stocks.');
        return;
      }
      // Only tickers 3x Hunter tracks, so the price job stays bounded.
      if (picks.length) {
        const { data: known } = await supabaseAdmin.from('stocks').select('ticker').in('ticker', picks);
        const ok = new Set(((known ?? []) as { ticker: string }[]).map((r) => r.ticker));
        if (picks.some((p) => !ok.has(p))) {
          sendBadRequest(response, 'Some picks are not tracked by 3x Hunter.');
          return;
        }
      }
      const plan = await getPlan(auth.userId, auth.db);
      const limit = LIMITS[plan.plan].maxPaperAccounts;
      const { count } = await supabaseAdmin.from('paper_accounts').select('id', { count: 'exact', head: true }).eq('user_id', auth.userId);
      if ((count ?? 0) >= limit) {
        response.status(402).json({ error: plan.plan === 'pro' ? `You can run up to ${limit} paper accounts.` : 'Free accounts include 1 paper experiment. Upgrade to Pro for 10.', upgrade: plan.plan !== 'pro' });
        return;
      }
      const usePicks = sleeve === 'market' ? [] : picks;
      const holdings = build(stocks, bonds, cash, sleeve, usePicks);
      const benchmark = build(stocks, bonds, cash, 'market', []);
      const sleeveLabel = sleeve === 'market' ? '70% VTI / 30% VXUS' : sleeve === 'mix' ? `40% VTI / 30% VXUS / 30% ${usePicks.length} picks` : `${usePicks.length} picks, equal weight`;
      const assumptions = {
        objective: `Grow $100,000 to ${multiple}x within ${horizon} years.`,
        stocks: `Stock part: ${sleeveLabel}${bot ? ` (${bot} bot picks on ${new Date().toISOString().slice(0, 10)})` : ''}.`,
        rebalancing: 'None (buy and hold from inception). Drift is shown, not corrected.',
        costs: '0.10% one-time entry cost. Fund expenses are already inside fund prices.',
        income: 'Dividends and interest reinvested through adjusted closing prices.',
        execution: 'Bought at the first market close after the account was created.',
        benchmark: 'Same bond and cash mix, stock part 70% VTI / 30% VXUS.',
        taxes: 'Excluded.',
      };
      const { data, error } = await supabaseAdmin
        .from('paper_accounts')
        .insert({ user_id: auth.userId, name, stocks, bonds, cash, sleeve: bot ? `${sleeve}:${bot}` : sleeve, holdings, benchmark, target_multiple: multiple, horizon_years: horizon, assumptions })
        .select('id')
        .single();
      if (error || !data) {
        sendServerError(response);
        return;
      }
      // Prices for new symbols now, so the account values at the next close without waiting a day.
      const { data: have } = await supabaseAdmin.from('paper_prices').select('symbol').in('symbol', holdings.map((h) => h.symbol)).limit(1000);
      const known = new Set(((have ?? []) as { symbol: string }[]).map((r) => r.symbol));
      const fresh = holdings.map((h) => h.symbol).filter((s) => !known.has(s));
      if (fresh.length) await refreshPaperPrices(fresh).catch(() => undefined);
      response.status(201).json({ id: (data as { id: string }).id });
      return;
    }

    if (request.method === 'DELETE') {
      const id = getQueryValue(request, 'id');
      if (!isUuid(id)) {
        sendBadRequest(response, 'id is required.');
        return;
      }
      const { error } = await supabaseAdmin.from('paper_accounts').delete().eq('id', id).eq('user_id', auth.userId);
      if (error) {
        sendServerError(response);
        return;
      }
      response.status(204).end();
      return;
    }

    sendMethodNotAllowed(response, ['GET', 'POST', 'DELETE']);
  } catch {
    sendServerError(response);
  }
}
