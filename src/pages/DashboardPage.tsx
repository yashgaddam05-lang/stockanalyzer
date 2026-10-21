import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import type { DashboardScope } from '@/lib/supabase';
import { useStocks } from '@/components/data/StocksProvider';
import { usePreferences } from '@/components/data/PreferencesProvider';
import { StatsOverview } from '@/components/StatsOverview';
import { TopOpportunities } from '@/components/dashboard/TopOpportunities';
import { ScoreMovers } from '@/components/dashboard/ScoreMovers';
import { SectorCapHeatmap } from '@/components/dashboard/SectorCapHeatmap';
import { PresetShortcuts } from '@/components/dashboard/PresetShortcuts';
import { ScopeToggle } from '@/components/dashboard/ScopeToggle';
import { MyStocksTable } from '@/components/dashboard/MyStocksTable';
import { PortfolioSnapshot } from '@/components/dashboard/PortfolioSnapshot';
import { MyAlertsCard } from '@/components/dashboard/MyAlertsCard';
import { UpcomingCatalystsCard } from '@/components/dashboard/UpcomingCatalystsCard';
import { SectionBoundary } from '@/components/dashboard/SectionBoundary';
import { useScopedStocks } from '@/components/dashboard/useScopedStocks';
import { DEFAULT_SCOPE, SCOPE_OPTIONS, scopePhrase, withScope } from '@/components/dashboard/scope';
import { RegimeSummaryCard } from '@/components/regime/RegimeSummaryCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const UNIVERSE_LABEL: Record<DashboardScope, string> = { mine: 'followed', sp500: 'in S&P 500', all: 'tracked' };
const NOUN: Record<DashboardScope, string> = { mine: 'of your stocks', sp500: 'S&P 500 stocks', all: 'tracked stocks' };

export default function DashboardPage() {
  const { stocks: allStocks, analyses: allAnalyses, loading: stocksLoading, error, reload } = useStocks();
  const { prefs, update } = usePreferences();

  // Local override so the toggle responds instantly even if prefs are missing or the save fails.
  const [localScope, setLocalScope] = useState<DashboardScope | null>(null);
  const scope: DashboardScope = localScope ?? prefs?.dashboard_scope ?? DEFAULT_SCOPE;

  const changeScope = (next: DashboardScope) => {
    setLocalScope(next);
    if (prefs && prefs.dashboard_scope !== next) {
      update({ dashboard_scope: next }).catch(() => {
        // Persist failed: keep the local choice for this session.
      });
    }
  };

  const { stocks, analyses, myStocks, myTickers, myTickersLoading, loading, counts } = useScopedStocks(scope);
  // Catalyst fallback when the user follows nothing: the active scope, or the S&P 500 when that scope is 'mine'.
  const fallbackScope: DashboardScope = scope === 'mine' ? 'sp500' : scope;
  const fallbackTickers = useMemo(
    () =>
      new Set(
        (fallbackScope === 'sp500' ? allStocks.filter((s) => s.in_sp500 === true) : allStocks).map((s) => s.ticker.toUpperCase())
      ),
    [allStocks, fallbackScope]
  );
  const phrase = scopePhrase(scope);
  const scopeLabel = SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? '';
  const mineEmpty = scope === 'mine' && !loading && myStocks.length === 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Your dashboard</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Built around the stocks you follow. Switch the market view between your stocks, the S&P 500, or everything
            we track. Scores are a research starting point, not investment advice.
          </p>
        </div>
        <ScopeToggle value={scope} onChange={changeScope} counts={stocksLoading ? undefined : counts} />
      </div>

      {/* Personal: always about the signed-in user, regardless of scope. */}
      <section className="space-y-4" aria-label="Your activity">
        <SectionBoundary label="Your stocks">
          <MyStocksTable
            stocks={myStocks}
            analyses={allAnalyses}
            myTickers={myTickers}
            loading={stocksLoading || myTickersLoading}
            error={error}
            onRetry={() => void reload()}
          />
        </SectionBoundary>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SectionBoundary label="Portfolio snapshot">
            <PortfolioSnapshot stocks={allStocks} stocksLoading={stocksLoading} />
          </SectionBoundary>
          <SectionBoundary label="Alerts">
            <MyAlertsCard />
          </SectionBoundary>
          <SectionBoundary label="Upcoming catalysts">
            <UpcomingCatalystsCard
              myTickers={myTickers}
              fallbackTickers={fallbackTickers}
              fallbackLabel={scopePhrase(fallbackScope)}
            />
          </SectionBoundary>
        </div>
      </section>

      {/* Market view: everything below follows the active scope. */}
      <section className="space-y-8" aria-labelledby="market-view-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-8">
          <h2 id="market-view-heading" className="text-xl font-semibold tracking-tight text-neutral-900">
            Market view: {scopeLabel}
          </h2>
          {!loading && !error && (
            <span className="text-[12px] text-muted-foreground">
              {stocks.length} {stocks.length === 1 ? 'stock' : 'stocks'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <p className="mb-3 text-sm text-red-700">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              Try again
            </Button>
          </Card>
        ) : mineEmpty ? (
          <Card className="flex flex-col items-center justify-center p-10 text-center" data-testid="mine-empty">
            <ListChecks className="mb-3 h-8 w-8 text-neutral-300" aria-hidden="true" />
            <p className="text-sm font-medium text-neutral-900">Nothing to show for your stocks yet</p>
            <p className="mt-1 max-w-md text-[12px] text-muted-foreground">
              Follow a few stocks and this section ranks, compares and maps them for you. Until then, the S&P 500 is a
              good place to start.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button size="sm" onClick={() => changeScope('sp500')}>
                Show the S&P 500
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/welcome">Pick your stocks</Link>
              </Button>
            </div>
          </Card>
        ) : stocks.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">No stocks in {phrase} yet.</Card>
        ) : (
          <>
            <SectionBoundary label="Overview">
              <StatsOverview
                stocks={stocks}
                analyses={analyses}
                watchlistCount={myTickers.size}
                universeLabel={UNIVERSE_LABEL[scope]}
              />
            </SectionBoundary>
            <SectionBoundary label="Top opportunities">
              <TopOpportunities
                stocks={stocks}
                analyses={analyses}
                title={`Top opportunities in ${phrase}`}
                noun={NOUN[scope]}
                exploreHref={withScope('/app/explore', scope)}
              />
            </SectionBoundary>
            <SectionBoundary label="Score movers">
              <ScoreMovers stocks={stocks} analyses={analyses} title={`Score movers in ${phrase}`} />
            </SectionBoundary>
            <SectionBoundary label="Heat map">
              <SectorCapHeatmap
                stocks={stocks}
                analyses={analyses}
                title={`Sector and market-cap heat map: ${scopeLabel}`}
                scope={scope}
              />
            </SectionBoundary>
            <SectionBoundary label="Preset screens">
              <PresetShortcuts stocks={stocks} scope={scope} />
            </SectionBoundary>
          </>
        )}

        <SectionBoundary label="Market regime">
          <RegimeSummaryCard />
        </SectionBoundary>
      </section>
    </div>
  );
}
