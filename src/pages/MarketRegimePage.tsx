import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { getMarketRegime } from '@/lib/api';
import type { MarketRegimeResponse, MarketRegimeSnapshot } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RegimeBadge } from '@/components/regime/RegimeBadge';
import { RiskAppetiteGauge } from '@/components/regime/RiskAppetiteGauge';
import { RiskAppetiteChart } from '@/components/regime/RiskAppetiteChart';
import { SectorStrengthTable } from '@/components/regime/SectorStrengthTable';
import { REGIME_EMPTY_MESSAGE, fmtDate, fmtNum, fmtSigned, isFiniteNumber, signClass } from '@/components/regime/regime-format';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';

export { RegimeSummaryCard } from '@/components/regime/RegimeSummaryCard';

const HISTORY_DAYS = 180;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }
  | { status: 'ready'; latest: MarketRegimeSnapshot; history: MarketRegimeSnapshot[] };

function Stat({ label, value, sub, subClass }: { label: string; value: string; sub?: string; subClass?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">{value}</p>
      {sub && <p className={cn('mt-0.5 text-[12px] tabular-nums', subClass ?? 'text-muted-foreground')}>{sub}</p>}
    </Card>
  );
}

function Attribution() {
  return (
    <p className="text-[12px] text-muted-foreground">
      Data source: Yahoo Finance index and ETF daily closes. Educational research only, not investment advice.
    </p>
  );
}

export default function MarketRegimePage() {
  useDocumentTitle('Market regime · 3x Hunter');
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getMarketRegime(HISTORY_DAYS)
      .then((res: MarketRegimeResponse) => {
        if (cancelled) return;
        if (!res?.available || !res.latest) setState({ status: 'unavailable' });
        else setState({ status: 'ready', latest: res.latest, history: Array.isArray(res.history) ? res.history : [] });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load market regime.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Market regime
            <InfoTip topic="regime" />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Macro backdrop from volatility, rates, trend and sector leadership.
          </p>
        </div>
        {state.status === 'ready' && (
          <div className="flex items-center gap-2">
            <RegimeBadge label={state.latest.regime_label} className="text-[13px]" />
            <span className="text-[12px] text-muted-foreground">as of {fmtDate(state.latest.as_of)}</span>
          </div>
        )}
      </header>

      {state.status === 'loading' && (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <Card className="flex flex-col items-start gap-3 p-6">
          <div className="flex items-center gap-2 text-sm text-neutral-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            {state.message}
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RotateCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </Card>
      )}

      {state.status === 'unavailable' && (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-neutral-900">{REGIME_EMPTY_MESSAGE}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The Market Regime Fit dimension stays unscored until the first snapshot lands.
          </p>
        </Card>
      )}

      {state.status === 'ready' && <RegimeContent latest={state.latest} history={state.history} />}

      <Attribution />
    </div>
  );
}

function RegimeContent({ latest, history }: { latest: MarketRegimeSnapshot; history: MarketRegimeSnapshot[] }) {
  const spyTrend =
    latest.spy_above_200dma === null || latest.spy_above_200dma === undefined
      ? '—'
      : latest.spy_above_200dma
        ? 'Above 200-day'
        : 'Below 200-day';
  const drivers = Array.isArray(latest.drivers) ? latest.drivers.filter((d) => typeof d === 'string' && d) : [];

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Risk appetite</h2>
          <RiskAppetiteGauge value={latest.risk_appetite} />
        </Card>
        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <Stat label="VIX" value={fmtNum(latest.vix, 1)} sub="Implied volatility" />
          <Stat
            label="10Y yield"
            value={isFiniteNumber(latest.tnx) ? `${latest.tnx.toFixed(2)}%` : '—'}
            sub={isFiniteNumber(latest.tnx_change_63d) ? `${fmtSigned(latest.tnx_change_63d, 2)} pts over 63d` : '63d change unavailable'}
          />
          <Stat
            label="SPY vs 200-day MA"
            value={spyTrend}
            sub={isFiniteNumber(latest.spy_close) ? `Close ${latest.spy_close.toFixed(2)}` : undefined}
            subClass="text-muted-foreground"
          />
          <Stat
            label="SPY 63d return"
            value={fmtSigned(latest.spy_return_63d, 1, '%')}
            sub="About 3 months"
            subClass={signClass(latest.spy_return_63d)}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Drivers</h2>
          {drivers.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No drivers recorded for this snapshot.</p>
          ) : (
            <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-neutral-700">
              {drivers.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Risk appetite history</h2>
          <RiskAppetiteChart history={history.length ? history : [latest]} />
        </Card>
      </div>

      <Card className="p-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Sector relative strength</h2>
          <span className="text-[12px] text-muted-foreground">63 trading days, sorted by performance vs SPY</span>
        </div>
        <SectorStrengthTable strength={latest.sector_strength} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">How this feeds the 3x score</h2>
        <div className="space-y-2 text-[13px] text-neutral-700">
          <p>
            The regime drives the <span className="font-medium text-neutral-900">Market Regime Fit</span> dimension, which carries a
            5% weight in the 3x Opportunity Score. Each stock is mapped to a benchmark sector ETF; 60% of its fit comes from that
            ETF's 63-day strength versus SPY, and 40% from style fit (aggressive, high-beta names score better when risk appetite
            is high, defensive names when it is low).
          </p>
          <p>
            When the regime is marked insufficient data, the dimension is left unscored rather than guessed. See the{' '}
            <Link to="/methodology" className="underline underline-offset-2 hover:text-neutral-900">
              methodology
            </Link>{' '}
            for the full model.
          </p>
          <p className="text-muted-foreground">
            Snapshot as of {fmtDate(latest.as_of)}
            {latest.model_version ? ` · model ${latest.model_version}` : ''}
          </p>
        </div>
      </Card>
    </>
  );
}
