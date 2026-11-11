import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CreditCard, Loader2, Sparkles } from 'lucide-react';
import { ApiError, confirmCheckout, openBillingPortal, startCheckout } from '@/lib/api';
import { usePlan, invalidatePlan } from '@/components/billing/usePlan';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { PRO_FEATURES } from '@/components/billing/features';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';


const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';

export default function BillingPage() {
  useDocumentTitle('Plan & billing · 3x Hunter');
  const { plan, loading, reload } = usePlan();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<'month' | 'year' | 'portal' | 'confirm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(params.get('canceled') ? 'Checkout canceled. You were not charged.' : null);
  const confirmed = useRef(false);

  // Returning from Stripe Checkout: confirm the session so Pro switches on immediately.
  useEffect(() => {
    const sessionId = params.get('session_id');
    if (!sessionId || confirmed.current) return;
    confirmed.current = true;
    setBusy('confirm');
    confirmCheckout(sessionId)
      .then(() => {
        invalidatePlan();
        reload();
        setNotice('Welcome to Pro! Your subscription is active.');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not confirm your payment. Refresh this page in a moment.'))
      .finally(() => {
        setBusy(null);
        setParams({}, { replace: true });
      });
  }, [params, setParams, reload]);

  async function go(kind: 'month' | 'year' | 'portal') {
    setBusy(kind);
    setError(null);
    try {
      const { url } = kind === 'portal' ? await openBillingPortal() : await startCheckout(kind);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setBusy(null);
    }
  }

  const isPaid = plan?.tier === 'pro';
  const isFounding = plan?.tier === 'founding';

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Plan & billing</h1>
        <p className="text-sm text-muted-foreground">Payments are handled securely by Stripe. 3x Hunter never sees your card.</p>
      </div>

      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">{notice}</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800" role="alert">{error}</p>}

      {loading || busy === 'confirm' ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Current plan</p>
            <p className="text-xl font-semibold text-neutral-900">
              {isPaid ? `Pro (${plan?.interval === 'year' ? 'annual' : 'monthly'})` : isFounding ? 'Pro, founding member' : 'Free'}
            </p>
            <p className="text-[13px] text-neutral-600">
              {isPaid
                ? plan?.cancelAtPeriodEnd
                  ? `Cancels on ${fmtDate(plan.currentPeriodEnd)}. You keep Pro until then.`
                  : `Renews on ${fmtDate(plan?.currentPeriodEnd ?? null)}.${plan?.status === 'past_due' ? ' Your last payment failed; update your card to keep Pro.' : ''}`
                : isFounding
                  ? `Thanks for being early. Pro is free for you until ${fmtDate(plan?.currentPeriodEnd ?? null)}. Subscribe anytime to keep it after that.`
                  : 'Scores, watchlists, portfolios and the market view are free forever.'}
            </p>
          </div>
          {plan?.hasCustomer && (
            <Button variant="outline" onClick={() => void go('portal')} disabled={busy !== null} className="gap-1.5">
              {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Manage billing
            </Button>
          )}
        </Card>
      )}

      {!isPaid && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {(['month', 'year'] as const).map((interval) => (
              <Card key={interval} className={cn('flex flex-col gap-4 p-6', interval === 'year' && 'border-neutral-900 shadow-md')}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[15px] font-semibold text-neutral-900">Pro {interval === 'year' ? 'annual' : 'monthly'}</p>
                    <p className="text-3xl font-bold tracking-tight text-neutral-900">
                      {interval === 'year' ? '$149' : '$19'}
                      <span className="text-[14px] font-medium text-neutral-500"> / {interval === 'year' ? 'year' : 'month'}</span>
                    </p>
                    {interval === 'year' && <p className="text-[12px] text-emerald-700">About $12.42 a month, 35% off monthly</p>}
                  </div>
                  {interval === 'year' && <span className="rounded-md bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">Best value</span>}
                </div>
                <Button
                  onClick={() => void go(interval)}
                  disabled={busy !== null || !plan?.billingAvailable}
                  variant={interval === 'year' ? 'default' : 'outline'}
                  className="gap-1.5"
                >
                  {busy === interval ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {plan?.billingAvailable === false ? 'Payments opening soon' : `Upgrade ${interval === 'year' ? 'yearly' : 'monthly'}`}
                </Button>
              </Card>
            ))}
          </div>
          <Card className="p-6">
            <p className="mb-3 text-[14px] font-semibold text-neutral-900">What Pro adds</p>
            <ul className="space-y-2">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-neutral-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-neutral-500">
              Cancel anytime from Manage billing; you keep Pro until the end of the period you paid for. 3x Hunter is an educational research
              tool, not investment advice.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
