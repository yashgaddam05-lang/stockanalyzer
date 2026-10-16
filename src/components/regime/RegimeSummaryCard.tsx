import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getMarketRegime } from '@/lib/api';
import type { MarketRegimeSnapshot } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RegimeBadge } from '@/components/regime/RegimeBadge';
import { REGIME_EMPTY_MESSAGE, fmtDate, fmtNum, fmtSigned, isFiniteNumber } from '@/components/regime/regime-format';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; latest: MarketRegimeSnapshot };

/** Compact, self-fetching market regime card for the dashboard. */
export function RegimeSummaryCard() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getMarketRegime(1)
      .then((res) => {
        if (cancelled) return;
        if (!res?.available || !res.latest) setState({ status: 'empty' });
        else setState({ status: 'ready', latest: res.latest });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">Market regime</h2>
        <Link
          to="/app/market"
          className="inline-flex items-center gap-1 text-[13px] text-neutral-600 hover:text-neutral-900"
        >
          View market regime
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {state.status === 'loading' && (
        <div className="mt-3 space-y-2" aria-busy="true">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {state.status === 'error' && <p className="mt-3 text-[13px] text-muted-foreground">Market regime unavailable right now.</p>}
      {state.status === 'empty' && <p className="mt-3 text-[13px] text-muted-foreground">{REGIME_EMPTY_MESSAGE}</p>}
      {state.status === 'ready' && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RegimeBadge label={state.latest.regime_label} />
            <span className="text-[12px] text-muted-foreground">as of {fmtDate(state.latest.as_of)}</span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Risk appetite</dt>
              <dd className="font-semibold tabular-nums text-neutral-900">
                {isFiniteNumber(state.latest.risk_appetite) ? Math.round(state.latest.risk_appetite) : '—'}
                <span className="font-normal text-muted-foreground">/100</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">VIX</dt>
              <dd className="font-semibold tabular-nums text-neutral-900">{fmtNum(state.latest.vix, 1)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">10Y</dt>
              <dd className="font-semibold tabular-nums text-neutral-900">
                {isFiniteNumber(state.latest.tnx) ? `${state.latest.tnx.toFixed(2)}%` : '—'}
                {isFiniteNumber(state.latest.tnx_change_63d) && (
                  <span className="ml-1 font-normal text-muted-foreground">{fmtSigned(state.latest.tnx_change_63d, 2)}</span>
                )}
              </dd>
            </div>
          </dl>
        </>
      )}
    </Card>
  );
}
