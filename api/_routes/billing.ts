import {
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendMethodNotAllowed,
  sendUnauthorized,
  supabaseAdmin,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import {
  PLAN_PRICES,
  billingConfigured,
  ensureCreditPackPrice,
  ensurePrice,
  getPlan,
  getStoredCustomerId,
  saveSubscription,
  stripe,
  type PaidPlan,
} from '../_plan.js';
import { CREDIT_PACK, LEVELS, SIZES, SIZE_SPECS, getBalance, levelAllows } from '../_ai.js';
import type Stripe from 'stripe';

// GET  /api/billing                          -> the signed-in user's plan
// POST /api/billing { action: 'checkout', interval: 'month' | 'year', plan?: 'pro' | 'pro_plus' } -> Stripe Checkout URL
// POST /api/billing { action: 'change_plan', plan: 'pro' | 'pro_plus' }  -> switches a live subscription (prorated)
// POST /api/billing { action: 'credits' }                              -> Checkout URL for a credit pack (paid plans)
// POST /api/billing { action: 'confirm', session_id }                 -> records a completed checkout or pack
// POST /api/billing { action: 'portal' }                              -> Stripe customer portal URL

async function customerFor(userId: string, s: Stripe): Promise<string> {
  let customer = await getStoredCustomerId(userId);
  if (customer) return customer;
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
  const created = await s.customers.create({ email: u?.user?.email ?? undefined, metadata: { user_id: userId } });
  customer = created.id;
  await supabaseAdmin.from('subscriptions').upsert(
    { owner_id: userId, stripe_customer_id: customer, updated_at: new Date().toISOString() },
    { onConflict: 'owner_id' }
  );
  return customer;
}

/** The AI part of the billing state: credits left, plan budgets and which answer sizes this plan can use. */
async function aiState(userId: string, level: keyof typeof LEVELS) {
  const balance = await getBalance(userId, level);
  return {
    credits: balance,
    levels: Object.fromEntries(Object.entries(LEVELS).map(([k, v]) => [k, { credits: v.credits, label: v.label }])),
    sizes: SIZES.map((size) => ({ size, label: SIZE_SPECS[size].label, credits: SIZE_SPECS[size].credits, minLevel: SIZE_SPECS[size].minLevel, allowed: levelAllows(level, size) })),
    creditPack: { credits: CREDIT_PACK.credits, label: CREDIT_PACK.label },
  };
}

function origin(request: ApiRequest): string {
  const h = request.headers ?? {};
  const host = (h['x-forwarded-host'] ?? h.host) as string | undefined;
  const proto = (h['x-forwarded-proto'] as string | undefined) ?? 'https';
  return process.env.APP_URL ?? (host ? `${proto}://${host}` : 'https://stockanalyzer-bolot1.vercel.app');
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    sendMethodNotAllowed(response, ['GET', 'POST']);
    return;
  }
  const auth = await resolveAuth(request);
  if (auth.kind !== 'user') {
    sendUnauthorized(response, auth.kind === 'invalid' ? 'Your session expired. Sign in again.' : undefined);
    return;
  }

  if (request.method === 'GET') {
    const plan = await getPlan(auth.userId, auth.db);
    response.status(200).json({
      ...plan,
      billingAvailable: billingConfigured(),
      prices: { month: PLAN_PRICES.pro.month.label, year: PLAN_PRICES.pro.year.label },
      planPrices: {
        pro: { month: PLAN_PRICES.pro.month.label, year: PLAN_PRICES.pro.year.label },
        pro_plus: { month: PLAN_PRICES.pro_plus.month.label, year: PLAN_PRICES.pro_plus.year.label },
      },
      ai: await aiState(auth.userId, plan.level),
    });
    return;
  }

  if (!billingConfigured()) {
    response.status(503).json({ error: 'Payments are not switched on yet. Please try again soon.' });
    return;
  }
  const s = stripe()!;
  const body = readJsonBody(request) ?? {};
  const action = body.action;

  try {
    if (action === 'checkout') {
      const interval = body.interval === 'year' ? 'year' : 'month';
      const plan: PaidPlan = body.plan === 'pro_plus' ? 'pro_plus' : 'pro';
      const current = await getPlan(auth.userId, auth.db);
      if (current.tier === 'pro' || current.tier === 'pro_plus') {
        response.status(409).json({ error: 'You already have a paid plan. Switch plans below or use Manage billing.' });
        return;
      }
      const price = await ensurePrice(interval, plan);
      const customer = await customerFor(auth.userId, s);
      const base = origin(request);
      const session = await s.checkout.sessions.create({
        mode: 'subscription',
        customer,
        client_reference_id: auth.userId,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        subscription_data: { metadata: { user_id: auth.userId, plan } },
        success_url: `${base}/app/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/app/billing?canceled=1`,
      });
      response.status(200).json({ url: session.url });
      return;
    }

    if (action === 'change_plan') {
      const plan: PaidPlan = body.plan === 'pro_plus' ? 'pro_plus' : 'pro';
      const current = await getPlan(auth.userId, auth.db);
      const { data: row } = await supabaseAdmin.from('subscriptions').select('stripe_subscription_id').eq('owner_id', auth.userId).maybeSingle();
      const subId = row?.stripe_subscription_id as string | undefined;
      if (!subId || (current.tier !== 'pro' && current.tier !== 'pro_plus')) {
        response.status(409).json({ error: 'No paid subscription to change. Choose a plan first.' });
        return;
      }
      if (current.tier === plan) {
        response.status(409).json({ error: 'You are already on that plan.' });
        return;
      }
      const sub = await s.subscriptions.retrieve(subId);
      const item = sub.items.data[0];
      const interval = item?.price?.recurring?.interval === 'year' ? 'year' : 'month';
      const price = await ensurePrice(interval, plan);
      // Upgrades charge the prorated difference now; downgrades credit it to the next invoice.
      const updated = await s.subscriptions.update(subId, {
        items: [{ id: item.id, price }],
        proration_behavior: plan === 'pro_plus' ? 'always_invoice' : 'create_prorations',
        cancel_at_period_end: false,
        metadata: { user_id: auth.userId, plan },
      });
      await saveSubscription(auth.userId, updated);
      response.status(200).json(await getPlan(auth.userId, auth.db));
      return;
    }

    if (action === 'credits') {
      const current = await getPlan(auth.userId, auth.db);
      if (current.level === 'free') {
        response.status(402).json({ error: 'Credit packs are for Pro and Pro+ members. Upgrade first.', upgrade: true });
        return;
      }
      const price = await ensureCreditPackPrice();
      const customer = await customerFor(auth.userId, s);
      const base = origin(request);
      const session = await s.checkout.sessions.create({
        mode: 'payment',
        customer,
        client_reference_id: auth.userId,
        line_items: [{ price, quantity: 1 }],
        metadata: { user_id: auth.userId, kind: 'credits', credits: String(CREDIT_PACK.credits) },
        success_url: `${base}/app/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/app/billing?canceled=1`,
      });
      response.status(200).json({ url: session.url });
      return;
    }

    if (action === 'confirm') {
      const id = typeof body.session_id === 'string' && /^cs_[A-Za-z0-9_]+$/.test(body.session_id) ? body.session_id : null;
      if (!id) return sendBadRequest(response, 'Missing checkout session.');
      const session = await s.checkout.sessions.retrieve(id, { expand: ['subscription'] });
      // Only the user who started the checkout can claim it.
      if (session.client_reference_id !== auth.userId) {
        response.status(403).json({ error: 'This checkout belongs to a different account.' });
        return;
      }
      if (session.mode === 'payment') {
        if (session.status !== 'complete' || session.payment_status !== 'paid' || session.metadata?.kind !== 'credits') {
          response.status(409).json({ error: 'Payment is not complete yet. Refresh in a moment.' });
          return;
        }
        // Unique on the session id: confirming twice never grants twice.
        await supabaseAdmin.from('ai_credit_grants').upsert(
          { owner_id: auth.userId, credits: Number(session.metadata.credits) || CREDIT_PACK.credits, reason: 'pack', stripe_session_id: session.id },
          { onConflict: 'stripe_session_id', ignoreDuplicates: true }
        );
        const plan = await getPlan(auth.userId, auth.db);
        response.status(200).json({ ...plan, kind: 'credits', credits: CREDIT_PACK.credits });
        return;
      }
      if (session.status !== 'complete' || !session.subscription || typeof session.subscription === 'string') {
        response.status(409).json({ error: 'Payment is not complete yet. Refresh in a moment.' });
        return;
      }
      await saveSubscription(auth.userId, session.subscription);
      response.status(200).json(await getPlan(auth.userId, auth.db));
      return;
    }

    if (action === 'portal') {
      const customer = await getStoredCustomerId(auth.userId);
      if (!customer) {
        response.status(409).json({ error: 'No billing account yet. Upgrade first.' });
        return;
      }
      const portal = await s.billingPortal.sessions.create({ customer, return_url: `${origin(request)}/app/billing` });
      response.status(200).json({ url: portal.url });
      return;
    }

    sendBadRequest(response, 'Unknown billing action.');
  } catch (error) {
    console.error('billing error', (error as Error)?.message ?? error);
    response.status(502).json({ error: 'Stripe could not complete that request. Please try again.' });
  }
}
