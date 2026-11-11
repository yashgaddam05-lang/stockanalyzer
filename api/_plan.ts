// Plans and entitlements. A user is Pro when their subscriptions row is an active paid or founding plan.
import Stripe from 'stripe';
import { supabaseAdmin, hasServiceRole } from './_supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Plan = 'free' | 'pro';

export interface PlanState {
  plan: Plan;
  /** free | pro | founding */
  tier: string;
  status: string;
  interval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  isAdmin: boolean;
}

export const PRICES = {
  month: { lookupKey: '3xh_pro_monthly', amount: 1900, label: '$19 / month' },
  year: { lookupKey: '3xh_pro_annual', amount: 14900, label: '$149 / year' },
} as const;

/** Per-plan daily limits, enforced server-side. */
export const LIMITS = {
  free: { assistantPerDay: 5, voice: false, maxAlerts: 1 },
  pro: { assistantPerDay: 40, voice: true, maxAlerts: 50 },
} as const;

const ACTIVE = new Set(['active', 'trialing', 'past_due']);
const RESYNC_MS = 6 * 60 * 60 * 1000;

let stripeClient: Stripe | null = null;
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient ??= new Stripe(key);
  return stripeClient;
}
export const billingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY) && hasServiceRole;

type Row = {
  owner_id: string;
  plan: string;
  status: string;
  interval: 'month' | 'year' | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  synced_at: string | null;
};

function toState(row: Row | null): PlanState {
  if (!row) return { plan: 'free', tier: 'free', status: 'none', interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, hasCustomer: false, isAdmin: false };
  const notExpired = !row.current_period_end || Date.parse(row.current_period_end) > Date.now();
  const pro = (row.plan === 'pro' || row.plan === 'founding') && ACTIVE.has(row.status) && notExpired;
  return {
    plan: pro ? 'pro' : 'free',
    tier: pro ? row.plan : 'free',
    status: row.status,
    interval: row.interval,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    hasCustomer: Boolean(row.stripe_customer_id),
    isAdmin: false,
  };
}

/** Writes a Stripe subscription onto the user's row (server only). */
export async function saveSubscription(userId: string, sub: Stripe.Subscription): Promise<void> {
  const item = sub.items.data[0];
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end
    ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  await supabaseAdmin.from('subscriptions').upsert(
    {
      owner_id: userId,
      plan: 'pro',
      status: sub.status,
      interval: item?.price?.recurring?.interval === 'year' ? 'year' : 'month',
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_id' }
  );
}

/**
 * The user's plan. Paid subscriptions are re-checked with Stripe every few hours (and whenever the
 * paid period has ended), so cancellations and failed payments apply without webhooks.
 */
export async function getPlan(userId: string, db: SupabaseClient): Promise<PlanState> {
  const { data } = await db.from('subscriptions').select('*').eq('owner_id', userId).maybeSingle();
  let row = (data as Row | null) ?? null;
  const s = stripe();
  if (s && hasServiceRole && row?.plan === 'pro' && row.stripe_subscription_id) {
    const stale = !row.synced_at || Date.now() - Date.parse(row.synced_at) > RESYNC_MS;
    const ended = row.current_period_end && Date.parse(row.current_period_end) < Date.now();
    if (stale || ended) {
      try {
        const sub = await s.subscriptions.retrieve(row.stripe_subscription_id);
        await saveSubscription(userId, sub);
        const { data: fresh } = await db.from('subscriptions').select('*').eq('owner_id', userId).maybeSingle();
        row = (fresh as Row | null) ?? row;
      } catch {
        // Stripe unreachable: keep the stored state rather than locking the user out.
      }
    }
  }
  const state = toState(row);
  // Admins have every feature, whatever their billing row says.
  const { data: admin } = await db.rpc('is_app_admin');
  if (admin === true) return { ...state, plan: 'pro', tier: state.tier === 'pro' ? 'pro' : 'admin', isAdmin: true };
  return state;
}

export async function getStoredCustomerId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('subscriptions').select('stripe_customer_id').eq('owner_id', userId).maybeSingle();
  return (data?.stripe_customer_id as string | null) ?? null;
}

/** Finds or creates the Pro product's two prices by lookup key, so no dashboard setup is needed. */
export async function ensurePrice(interval: 'month' | 'year'): Promise<string> {
  const s = stripe()!;
  const def = PRICES[interval];
  const found = await s.prices.list({ lookup_keys: [def.lookupKey], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const products = await s.products.search({ query: "metadata['app']:'3xhunter-pro'", limit: 1 });
  const product = products.data[0] ?? (await s.products.create({
    name: '3x Hunter Pro',
    description: 'Full 3x score breakdowns, the AI research assistant, voice and alerts.',
    metadata: { app: '3xhunter-pro' },
  }));
  const price = await s.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: def.amount,
    recurring: { interval },
    lookup_key: def.lookupKey,
  });
  return price.id;
}
