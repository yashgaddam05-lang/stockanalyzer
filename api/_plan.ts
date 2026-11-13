// Plans and entitlements. A user is Pro when their subscriptions row is an active paid or founding plan.
import Stripe from 'stripe';
import { supabaseAdmin, hasServiceRole } from './_supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CREDIT_PACK, type Level } from './_ai.js';

export type Plan = 'free' | 'pro';

export interface PlanState {
  plan: Plan;
  /** free | pro | pro_plus | founding | admin */
  tier: string;
  /** AI budget level: free, pro (Pro and founding members) or pro_plus (Pro+ and admins). */
  level: Level;
  status: string;
  interval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  isAdmin: boolean;
}

export type PaidPlan = 'pro' | 'pro_plus';

export const PLAN_PRICES = {
  pro: {
    month: { lookupKey: '3xh_pro_monthly', amount: 1900, label: '$19 / month' },
    year: { lookupKey: '3xh_pro_annual', amount: 14900, label: '$149 / year' },
  },
  pro_plus: {
    month: { lookupKey: '3xh_plus_monthly', amount: 4900, label: '$49 / month' },
    year: { lookupKey: '3xh_plus_annual', amount: 39900, label: '$399 / year' },
  },
} as const;
/** Pro prices (kept for existing callers). */
export const PRICES = PLAN_PRICES.pro;

const PRODUCTS: Record<PaidPlan, { app: string; name: string; description: string }> = {
  pro: { app: '3xhunter-pro', name: '3x Hunter Pro', description: 'Full 3x score breakdowns, the AI research assistant with deep dives, voice and alerts.' },
  pro_plus: { app: '3xhunter-pro-plus', name: '3x Hunter Pro+', description: 'Everything in Pro with nearly 3x the AI research budget and full research reports.' },
};

/** Per-plan daily limits, enforced server-side. */
export const LIMITS = {
  free: { assistantPerDay: 5, voice: false, maxAlerts: 1 },
  pro: { assistantPerDay: 40, voice: true, maxAlerts: 50 },
} as const;

const ACTIVE = new Set(['active', 'trialing', 'past_due']);
const RESYNC_MS = 6 * 60 * 60 * 1000;
const ORPHAN_CHECK_MS = 2 * 60 * 1000;

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
  if (!row) return { plan: 'free', tier: 'free', level: 'free', status: 'none', interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, hasCustomer: false, isAdmin: false };
  const notExpired = !row.current_period_end || Date.parse(row.current_period_end) > Date.now();
  const pro = (row.plan === 'pro' || row.plan === 'pro_plus' || row.plan === 'founding') && ACTIVE.has(row.status) && notExpired;
  return {
    plan: pro ? 'pro' : 'free',
    tier: pro ? row.plan : 'free',
    level: !pro ? 'free' : row.plan === 'pro_plus' ? 'pro_plus' : 'pro',
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
  const lookup = item?.price?.lookup_key ?? '';
  const plan: PaidPlan = lookup.startsWith('3xh_plus') ? 'pro_plus' : 'pro';
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end
    ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  await supabaseAdmin.from('subscriptions').upsert(
    {
      owner_id: userId,
      plan,
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
  if (s && hasServiceRole && (row?.plan === 'pro' || row?.plan === 'pro_plus') && row.stripe_subscription_id) {
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
  // Paid but never confirmed (tab closed before Stripe redirected back): ask Stripe directly whether
  // this customer has a live subscription. Checked at most every few minutes per user.
  const unconfirmed = row?.stripe_customer_id && !row.stripe_subscription_id && row.plan !== 'founding';
  if (s && hasServiceRole && unconfirmed) {
    const recentlyChecked = row!.synced_at && Date.now() - Date.parse(row!.synced_at) < ORPHAN_CHECK_MS;
    if (!recentlyChecked) {
      try {
        const subs = await s.subscriptions.list({ customer: row!.stripe_customer_id!, status: 'all', limit: 5 });
        const live = subs.data.find((x) => ACTIVE.has(x.status));
        if (live) {
          await saveSubscription(userId, live);
        } else {
          await supabaseAdmin.from('subscriptions').update({ synced_at: new Date().toISOString() }).eq('owner_id', userId);
        }
        const { data: fresh } = await db.from('subscriptions').select('*').eq('owner_id', userId).maybeSingle();
        row = (fresh as Row | null) ?? row;
      } catch {
        // Stripe unreachable: try again on the next check.
      }
    }
  }
  const state = toState(row);
  // Admins have every feature, whatever their billing row says.
  const { data: admin } = await db.rpc('is_app_admin');
  if (admin === true) return { ...state, plan: 'pro', level: 'pro_plus', tier: state.tier === 'pro' || state.tier === 'pro_plus' ? state.tier : 'admin', isAdmin: true };
  return state;
}

export async function getStoredCustomerId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('subscriptions').select('stripe_customer_id').eq('owner_id', userId).maybeSingle();
  return (data?.stripe_customer_id as string | null) ?? null;
}

async function ensureProduct(app: string, name: string, description: string): Promise<string> {
  const s = stripe()!;
  const products = await s.products.search({ query: `metadata['app']:'${app}'`, limit: 1 });
  return (products.data[0] ?? (await s.products.create({ name, description, metadata: { app } }))).id;
}

/** Finds or creates a plan's price by lookup key, so no dashboard setup is needed. */
export async function ensurePrice(interval: 'month' | 'year', plan: PaidPlan = 'pro'): Promise<string> {
  const s = stripe()!;
  const def = PLAN_PRICES[plan][interval];
  const found = await s.prices.list({ lookup_keys: [def.lookupKey], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const p = PRODUCTS[plan];
  const product = { id: await ensureProduct(p.app, p.name, p.description) };
  const price = await s.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: def.amount,
    recurring: { interval },
    lookup_key: def.lookupKey,
  });
  return price.id;
}

/** One-time price for the credit pack. */
export async function ensureCreditPackPrice(): Promise<string> {
  const s = stripe()!;
  const found = await s.prices.list({ lookup_keys: [CREDIT_PACK.lookupKey], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const product = await ensureProduct('3xhunter-credits', '3x Hunter AI credits', `${CREDIT_PACK.credits} extra AI research credits. Never expire.`);
  const price = await s.prices.create({ product, currency: 'usd', unit_amount: CREDIT_PACK.amount, lookup_key: CREDIT_PACK.lookupKey });
  return price.id;
}
