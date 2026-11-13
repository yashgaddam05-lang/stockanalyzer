import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CreditCard, Loader2, Plus, Sparkles, Zap } from 'lucide-react';
import { ApiError, buyCredits, changePlan, confirmCheckout, openBillingPortal, startCheckout } from '@/lib/api';
import { usePlan, invalidatePlan } from '@/components/billing/usePlan';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { PLUS_FEATURES, PRO_FEATURES } from '@/components/billing/features';
import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type PaidPlan = 'pro' | 'pro_plus';
type Busy = `${PaidPlan}:${'month' | 'year'}` | `switch:${PaidPlan}` | 'portal' | 'confirm' | 'credits' | null;

const PLAN_INFO: Record<PaidPlan, { name: string; month: number; year: number; blurb: string; features: string[] }> = {
  pro: { name: 'Pro', month: 19, year: 149, blurb: 'The full research toolkit.', features: PRO_FEATURES },
  pro_plus: { name: 'Pro+', month: 49, year: 399, blurb: 'For daily, deep AI research.', features: PLUS_FEATURES },
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';

export default function BillingPage() {
  useDocumentTitle('Plan & billing · 3x Hunter');
  const { plan, loading, reload } = usePlan();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<Busy>(null);
  const [yearly, setYearly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(params.get('canceled') ? 'Checkout canceled. You were not charged.' : null);
  const confirmed = useRef(false);

  // Returning from Stripe Checkout: confirm the session so the plan or credits switch on immediately.
  useEffect(() => {
    const sessionId = params.get('session_id');
    if (!sessionId || confirmed.current) return;
    confirmed.current = true;
    setBusy('confirm');
    confirmCheckout(sessionId)
      .then((s) => {
        const pack = (s as { kind?: string }).kind === 'credits';
        if (!pack) {
          const info = PLAN_INFO[s.tier === 'pro_plus' ? 'pro_plus' : 'pro'];
          track('purchase', { currency: 'USD', value: s.interval === 'year' ? info.year : info.month, items: [{ item_name: `${info.name} ${s.interval ?? 'month'}` }] });
        } else {
          track('purchase', { currency: 'USD', value: 10, items: [{ item_name: 'AI credit pack' }] });
        }
        invalidatePlan();
        reload();
        setNotice(pack ? 'Credits added. They never expire.' : `Welcome to ${s.tier === 'pro_plus' ? 'Pro+' : 'Pro'}! Your subscription is active.`);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not confirm your payment. Refresh this page in a moment.'))
      .finally(() => {
        setBusy(null);
        setParams({}, { replace: true });
      });
  }, [params, setParams, reload]);

  async function redirect(kind: Busy, get: () => Promise<{ url: string }>) {
    setBusy(kind);
    setError(null);
    try {
      window.location.assign((await get()).url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setBusy(null);
    }
  }

  function checkout(p: PaidPlan) {
    const interval = yearly ? 'year' : 'month';
    track('begin_checkout', { currency: 'USD', value: yearly ? PLAN_INFO[p].year : PLAN_INFO[p].month });
    void redirect(`${p}:${interval}`, () => startCheckout(interval, p));
  }

  async function switchTo(p: PaidPlan) {
    setBusy(`switch:${p}`);
    setError(null);
    try {
      await changePlan(p);
      invalidatePlan();
      reload();
      setNotice(p === 'pro_plus' ? 'You are on Pro+ now. The prorated difference was charged to your card.' : 'You are on Pro now. The unused difference is credited to your next invoice.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change your plan. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const tier = plan?.tier;
  const paid = tier === 'pro' || tier === 'pro_plus';
  const isFounding = tier === 'founding';
  const ai = plan?.ai;
  const left = ai?.credits ? ai.credits.monthly_left : null;
  const allowance = ai?.credits?.allowance ?? 0;
  const pct = left !== null && allowance ? Math.max(0, Math.min(100, (left / allowance) * 100)) : 0;
  const currentName = tier === 'pro_plus' ? 'Pro+' : tier === 'pro' ? 'Pro' : isFounding ? 'Pro, founding member' : tier === 'admin' ? 'Admin (all features)' : 'Free';

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Plan & billing</h1>
        <p className="text-sm text-muted-foreground">Payments are handled securely by Stripe. 3x Hunter never sees your card.</p>
      </div>

      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">{notice}</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800" role="alert">{error}</p>}

      {loading || busy === 'confirm' ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col justify-between gap-3 p-5">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Current plan</p>
              <p className="text-xl font-semibold text-neutral-900">
                {currentName}
                {paid && ` (${plan?.interval === 'year' ? 'annual' : 'monthly'})`}
              </p>
              <p className="text-[13px] text-neutral-600">
                {paid
                  ? plan?.cancelAtPeriodEnd
                    ? `Cancels on ${fmtDate(plan.currentPeriodEnd)}. You keep it until then.`
                    : `Renews on ${fmtDate(plan?.currentPeriodEnd)}.${plan?.status === 'past_due' ? ' Your last payment failed; update your card to keep it.' : ''}`
                  : isFounding
                    ? `Thanks for being early. Pro is free for you until ${fmtDate(plan?.currentPeriodEnd)}. Subscribe anytime to keep it after that.`
                    : 'Scores, watchlists, portfolios and the market view are free forever.'}
              </p>
            </div>
            {plan?.hasCustomer && (
              <Button variant="outline" onClick={() => void redirect('portal', openBillingPortal)} disabled={busy !== null} className="w-fit gap-1.5">
                {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Manage billing
              </Button>
            )}
          </Card>

          <Card className="flex flex-col justify-between gap-3 p-5">
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-neutral-500">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" /> AI research credits
              </p>
              {ai?.credits ? (
                <>
                  <p className="text-xl font-semibold tabular-nums text-neutral-900">
                    {tier === 'admin' ? 'Unlimited' : `${ai.credits.monthly_left} of ${allowance} left`}
                    {ai.credits.pack_left > 0 && <span className="text-[14px] font-medium text-neutral-500"> + {ai.credits.pack_left} from packs</span>}
                  </p>
                  {tier !== 'admin' && (
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
                      <div className={cn('h-full rounded-full', pct < 15 ? 'bg-amber-500' : 'bg-neutral-900')} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <p className="text-[12px] text-neutral-500">Monthly credits refresh on {fmtDate(ai.credits.resets_at)}. Pack credits never expire.</p>
                </>
              ) : (
                <p className="text-[13px] text-neutral-600">Credits show here once you are signed in.</p>
              )}
            </div>
            {paid || isFounding || tier === 'admin' ? (
              <Button variant="outline" onClick={() => void redirect('credits', buyCredits)} disabled={busy !== null || !plan?.billingAvailable} className="w-fit gap-1.5">
                {busy === 'credits' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add {ai?.creditPack.credits ?? 250} credits for $10
              </Button>
            ) : (
              <p className="text-[12px] text-neutral-500">Pro gives you 6x the credits and Deep dive answers.</p>
            )}
          </Card>
        </div>
      )}

      {ai && (
        <Card className="overflow-hidden">
          <div className="p-5 pb-3">
            <h2 className="text-[15px] font-semibold text-neutral-900">What each answer uses</h2>
            <p className="text-[13px] text-neutral-600">Auto picks the right size for each question. You can choose a size in the assistant anytime.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="border-y border-border bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Size</th>
                  <th className="px-5 py-2 font-medium">Credits</th>
                  <th className="px-5 py-2 font-medium">Your plan</th>
                </tr>
              </thead>
              <tbody>
                {ai.sizes.map((x) => (
                  <tr key={x.size} className="border-b border-border last:border-0">
                    <td className="px-5 py-2 font-medium text-neutral-900">{x.label}</td>
                    <td className="px-5 py-2 tabular-nums">{x.credits}</td>
                    <td className="px-5 py-2">{x.allowed ? <span className="text-emerald-700">Included</span> : <span className="text-neutral-500">{x.minLevel === 'pro_plus' ? 'Pro+' : 'Pro'}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{paid ? 'Change plan' : 'Upgrade'}</h2>
          {!paid && (
            <div className="inline-flex rounded-lg border border-border p-0.5 text-[13px]" role="group" aria-label="Billing period">
              {[false, true].map((y) => (
                <button
                  key={String(y)}
                  type="button"
                  onClick={() => setYearly(y)}
                  aria-pressed={yearly === y}
                  className={cn('rounded-md px-3 py-1 font-medium', yearly === y ? 'bg-neutral-900 text-white' : 'text-neutral-600')}
                >
                  {y ? 'Yearly (save ~33%)' : 'Monthly'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(['pro', 'pro_plus'] as const).map((p) => {
            const info = PLAN_INFO[p];
            const current = tier === p;
            const price = yearly && !paid ? info.year : info.month;
            return (
              <Card key={p} className={cn('flex flex-col gap-4 p-6', p === 'pro' && !paid && 'border-neutral-900 shadow-md', current && 'border-emerald-600')}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[15px] font-semibold text-neutral-900">{info.name}</p>
                    <p className="text-[13px] text-neutral-500">{info.blurb}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-neutral-900">
                      ${price}
                      <span className="text-[14px] font-medium text-neutral-500"> / {yearly && !paid ? 'year' : 'month'}</span>
                    </p>
                    {yearly && !paid && <p className="text-[12px] text-emerald-700">About ${(info.year / 12).toFixed(2)} a month</p>}
                  </div>
                  {current && <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">Your plan</span>}
                </div>
                <ul className="space-y-2">
                  {info.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-neutral-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                {!current && (
                  <Button
                    onClick={() => (paid ? void switchTo(p) : checkout(p))}
                    disabled={busy !== null || !plan?.billingAvailable}
                    variant={p === 'pro' && !paid ? 'default' : 'outline'}
                    className="mt-auto gap-1.5"
                  >
                    {busy === `switch:${p}` || busy === `${p}:${yearly ? 'year' : 'month'}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {plan?.billingAvailable === false ? 'Payments opening soon' : paid ? `Switch to ${info.name}` : `Get ${info.name}`}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
        <p className="text-[11px] text-neutral-500">
          Cancel anytime from Manage billing; you keep your plan until the end of the period you paid for. Upgrading from Pro to Pro+ charges the
          prorated difference today. 3x Hunter is an educational research tool, not investment advice.
        </p>
      </div>
    </div>
  );
}
