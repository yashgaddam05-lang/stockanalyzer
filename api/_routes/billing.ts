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
import { PRICES, billingConfigured, ensurePrice, getPlan, getStoredCustomerId, saveSubscription, stripe } from '../_plan.js';

// GET  /api/billing                          -> the signed-in user's plan
// POST /api/billing { action: 'checkout', interval: 'month' | 'year' } -> Stripe Checkout URL
// POST /api/billing { action: 'confirm', session_id }                 -> records a completed checkout
// POST /api/billing { action: 'portal' }                              -> Stripe customer portal URL

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
    response.status(200).json({ ...plan, billingAvailable: billingConfigured(), prices: { month: PRICES.month.label, year: PRICES.year.label } });
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
      const current = await getPlan(auth.userId, auth.db);
      if (current.tier === 'pro') {
        response.status(409).json({ error: 'You already have Pro. Use Manage billing to change plans.' });
        return;
      }
      const price = await ensurePrice(interval);
      let customer = await getStoredCustomerId(auth.userId);
      if (!customer) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(auth.userId);
        const created = await s.customers.create({ email: u?.user?.email ?? undefined, metadata: { user_id: auth.userId } });
        customer = created.id;
        await supabaseAdmin.from('subscriptions').upsert(
          { owner_id: auth.userId, stripe_customer_id: customer, updated_at: new Date().toISOString() },
          { onConflict: 'owner_id' }
        );
      }
      const base = origin(request);
      const session = await s.checkout.sessions.create({
        mode: 'subscription',
        customer,
        client_reference_id: auth.userId,
        line_items: [{ price, quantity: 1 }],
        allow_promotion_codes: true,
        subscription_data: { metadata: { user_id: auth.userId } },
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
