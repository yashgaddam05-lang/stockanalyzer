// Read-only brokerage sync via SnapTrade. Each connected account becomes a portfolio with
// source='brokerage' whose positions are replaced on every sync. SnapTrade secrets never leave the server.
import { randomUUID } from 'node:crypto';
import { Snaptrade, SnaptradeAuth } from 'snaptrade-typescript-sdk';
import { supabaseAdmin, hasServiceRole } from './_supabase.js';

type Client = InstanceType<typeof Snaptrade<ReturnType<typeof SnaptradeAuth.commercialApiKey>>>;
let client: Client | null = null;

export const brokerageConfigured = () =>
  Boolean(process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY) && hasServiceRole;

function snaptrade(): Client {
  client ??= new Snaptrade({
    auth: SnaptradeAuth.commercialApiKey({
      clientId: process.env.SNAPTRADE_CLIENT_ID as string,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY as string,
    }),
  });
  return client;
}

export interface BrokerageLink {
  owner_id: string;
  provider_user_id: string;
  provider_user_secret: string;
  status: 'pending' | 'connected' | 'error';
  last_synced_at: string | null;
  last_error: string | null;
}

export async function getLink(ownerId: string): Promise<BrokerageLink | null> {
  const { data } = await supabaseAdmin.from('brokerage_links').select('*').eq('owner_id', ownerId).maybeSingle();
  return (data as BrokerageLink | null) ?? null;
}

/** Registers the user with SnapTrade once (an opaque id, never their email) and stores the secret server-side. */
async function ensureLink(ownerId: string): Promise<BrokerageLink> {
  const existing = await getLink(ownerId);
  if (existing) return existing;
  const providerUserId = `3xh-${randomUUID()}`;
  const { data } = await snaptrade().authentication.registerSnapTradeUser({ userId: providerUserId });
  if (!data.userSecret) throw new Error('SnapTrade did not return a user secret.');
  const row = {
    owner_id: ownerId,
    provider_user_id: providerUserId,
    provider_user_secret: data.userSecret,
    status: 'pending' as const,
  };
  const { error } = await supabaseAdmin.from('brokerage_links').insert(row);
  if (error) throw new Error('Could not save the brokerage link.');
  return { ...row, last_synced_at: null, last_error: null };
}

/** SnapTrade Connection Portal URL (read-only), returning the user to `redirectUrl`. */
export async function connectUrl(ownerId: string, redirectUrl: string): Promise<string> {
  const link = await ensureLink(ownerId);
  const { data } = await snaptrade().authentication.loginSnapTradeUser({
    userId: link.provider_user_id,
    userSecret: link.provider_user_secret,
    connectionType: 'read',
    customRedirect: redirectUrl,
    immediateRedirect: true,
  });
  const url = (data as { redirectURI?: string }).redirectURI;
  if (!url) throw new Error('SnapTrade did not return a connection link.');
  return url;
}

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

export interface SyncResult {
  accounts: number;
  positions: number;
  skipped: number;
}

/** Pulls every connected account's current holdings and replaces the matching synced portfolios. */
export async function syncHoldings(ownerId: string): Promise<SyncResult> {
  const link = await getLink(ownerId);
  if (!link) throw new Error('No brokerage connected.');
  const auth = { userId: link.provider_user_id, userSecret: link.provider_user_secret };
  const now = new Date().toISOString();
  try {
    const { data: accounts } = await snaptrade().accountInformation.listUserAccounts(auth);
    let positionsTotal = 0;
    let skipped = 0;
    const seen: string[] = [];

    for (const account of accounts ?? []) {
      const { data: holdings } = await snaptrade().accountInformation.getUserHoldings({ ...auth, accountId: account.id });
      const institution = account.institution_name || 'Brokerage';
      const suffix = (accounts?.length ?? 0) > 1 && account.number ? ` ····${String(account.number).slice(-4)}` : '';
      const name = `${institution}${suffix} (synced)`.slice(0, 60);

      // Aggregate by ticker (a broker can report the same symbol in more than one lot).
      const byTicker = new Map<string, { shares: number; cost: number }>();
      for (const p of holdings.positions ?? []) {
        const ticker = String(p.symbol?.symbol?.symbol ?? '').toUpperCase().replace('/', '.');
        const units = Number(p.units ?? p.fractional_units ?? 0);
        if (!TICKER_RE.test(ticker) || !(units > 0) || p.cash_equivalent) {
          skipped++;
          continue;
        }
        const cost = Number(p.average_purchase_price ?? p.price ?? 0);
        const cur = byTicker.get(ticker) ?? { shares: 0, cost: 0 };
        // Weighted average cost across lots.
        const shares = cur.shares + units;
        byTicker.set(ticker, { shares, cost: shares > 0 ? (cur.cost * cur.shares + Math.max(0, cost) * units) / shares : 0 });
      }

      const { data: portfolio, error: upsertError } = await supabaseAdmin
        .from('portfolios')
        .upsert(
          { owner_id: ownerId, external_account_id: account.id, name, source: 'brokerage', institution, synced_at: now, updated_at: now },
          { onConflict: 'owner_id,external_account_id' }
        )
        .select('id')
        .single();
      if (upsertError || !portfolio) throw new Error('Could not save the synced portfolio.');
      seen.push(account.id);

      await supabaseAdmin.from('positions').delete().eq('portfolio_id', portfolio.id);
      const rows = [...byTicker.entries()].map(([ticker, v]) => ({
        owner_id: ownerId,
        portfolio_id: portfolio.id,
        ticker,
        shares: Math.round(v.shares * 1e6) / 1e6,
        cost_basis: Math.round(v.cost * 1e4) / 1e4,
        notes: `Synced from ${institution}`,
      }));
      if (rows.length) {
        const { error } = await supabaseAdmin.from('positions').insert(rows);
        if (error) throw new Error('Could not save synced positions.');
      }
      positionsTotal += rows.length;
    }

    // Accounts the user disconnected at the broker: remove their synced portfolios.
    let stale = supabaseAdmin.from('portfolios').delete().eq('owner_id', ownerId).eq('source', 'brokerage');
    if (seen.length) stale = stale.not('external_account_id', 'in', `(${seen.map((s) => `"${s}"`).join(',')})`);
    await stale;

    await supabaseAdmin
      .from('brokerage_links')
      .update({ status: (accounts?.length ?? 0) > 0 ? 'connected' : 'pending', last_synced_at: now, last_error: null, updated_at: now })
      .eq('owner_id', ownerId);
    return { accounts: accounts?.length ?? 0, positions: positionsTotal, skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : 'Sync failed.';
    await supabaseAdmin.from('brokerage_links').update({ status: 'error', last_error: message, updated_at: now }).eq('owner_id', ownerId);
    throw error;
  }
}

/** Removes the SnapTrade user (revoking every broker connection) and all synced portfolios. */
export async function disconnect(ownerId: string): Promise<void> {
  const link = await getLink(ownerId);
  if (link) {
    try {
      await snaptrade().authentication.deleteSnapTradeUser({ userId: link.provider_user_id });
    } catch {
      // Already gone at SnapTrade: still clean up locally.
    }
  }
  await supabaseAdmin.from('portfolios').delete().eq('owner_id', ownerId).eq('source', 'brokerage');
  await supabaseAdmin.from('brokerage_links').delete().eq('owner_id', ownerId);
}

/** Daily job: re-sync links not synced in the last 20 hours (bounded per run). */
export async function syncStaleLinks(limit = 25): Promise<{ synced: number; failed: number }> {
  const cutoff = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('brokerage_links')
    .select('owner_id')
    .neq('status', 'pending')
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .limit(limit);
  let synced = 0;
  let failed = 0;
  for (const row of data ?? []) {
    try {
      await syncHoldings(row.owner_id as string);
      synced++;
    } catch {
      failed++;
    }
  }
  return { synced, failed };
}
