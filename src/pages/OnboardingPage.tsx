import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Landmark, ListPlus, Loader2, Plus, X } from 'lucide-react';
import { addWatchlistItem, ApiError, createWatchlist, getWatchlists } from '@/lib/api';
import type { StockListItem, StockSearchResult } from '@/lib/supabase';
import { useStocks } from '@/components/data/StocksProvider';
import { usePreferences } from '@/components/data/PreferencesProvider';
import { StockSearch } from '@/components/search/StockSearch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Path = 'mine' | 'sp500';
type Step = 'start' | 'pick' | 'finish';

interface Pick {
  ticker: string;
  name: string;
  sector: string | null;
  score: number | null;
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'start', label: 'Start' },
  { id: 'pick', label: 'Your stocks' },
  { id: 'finish', label: 'Finish' },
];

const SECTORS_COLLAPSED = 12;
const SUGGESTIONS_PER_SECTOR = 8;

function toPick(s: StockListItem): Pick {
  return { ticker: s.ticker.toUpperCase(), name: s.company_name, sector: s.sector ?? null, score: s.three_x_score ?? null };
}

function ProgressSteps({ step, skippedPick }: { step: Step; skippedPick: boolean }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2" aria-label="Onboarding progress">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const skipped = s.id === 'pick' && skippedPick && current > i;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                active && 'bg-neutral-900 text-white',
                done && !skipped && 'bg-neutral-900 text-white',
                skipped && 'border border-neutral-300 text-neutral-400',
                !active && !done && 'border border-neutral-300 text-neutral-500'
              )}
            >
              {done && !skipped ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn('hidden text-[12px] font-medium sm:inline', active ? 'text-neutral-900' : 'text-neutral-500')}>
              {s.label}
              {skipped ? ' (skipped)' : ''}
            </span>
            {i < STEPS.length - 1 && <span className={cn('h-px flex-1', done ? 'bg-neutral-900' : 'bg-neutral-200')} />}
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceCard({
  icon,
  title,
  body,
  selected,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'group flex h-full w-full flex-col items-start gap-4 rounded-xl border p-6 text-left transition-all',
        'hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2',
        selected ? 'border-neutral-900 bg-neutral-50 shadow-sm' : 'border-border bg-background'
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-900 text-white">{icon}</span>
      <span className="space-y-1">
        <span className="block text-[15px] font-semibold text-neutral-900">{title}</span>
        <span className="block text-[13px] leading-relaxed text-neutral-600">{body}</span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium text-neutral-900">
        Choose
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </button>
  );
}

function StockToggle({ stock, selected, onToggle }: { stock: StockListItem; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      title={stock.company_name}
      className={cn(
        'flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
        selected ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-border bg-background hover:border-neutral-400'
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{stock.ticker}</span>
        <span className={cn('block truncate text-[11px]', selected ? 'text-neutral-300' : 'text-neutral-500')}>
          {stock.company_name}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {stock.three_x_score != null && (
          <span className={cn('text-[11px] font-semibold tabular-nums', selected ? 'text-neutral-200' : 'text-neutral-600')}>
            {Math.round(stock.three_x_score)}
          </span>
        )}
        {selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />}
      </span>
    </button>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { stocks, loading: stocksLoading, reloadWatchlist } = useStocks();
  const { prefs, onboarded, update } = usePreferences();

  const [step, setStep] = useState<Step>('start');
  const [path, setPath] = useState<Path | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [showAllSectors, setShowAllSectors] = useState(false);
  const [saving, setSaving] = useState<'finish' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revisiting: start from the sectors the user chose last time.
  useEffect(() => {
    if (prefs?.sectors?.length) setSectors((cur) => (cur.length ? cur : prefs.sectors));
  }, [prefs?.sectors]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  const pickedSet = useMemo(() => new Set(picks.map((p) => p.ticker)), [picks]);

  const sectorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stocks) {
      if (!s.sector) continue;
      counts.set(s.sector, (counts.get(s.sector) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [stocks]);

  const topBySector = useMemo(() => {
    const map = new Map<string, StockListItem[]>();
    for (const sector of sectors) {
      map.set(
        sector,
        stocks
          .filter((s) => s.sector === sector)
          .sort((a, b) => (b.three_x_score ?? 0) - (a.three_x_score ?? 0))
          .slice(0, SUGGESTIONS_PER_SECTOR)
      );
    }
    return map;
  }, [stocks, sectors]);

  const popular = useMemo(
    () =>
      stocks
        .filter((s) => s.in_sp500)
        .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
        .slice(0, SUGGESTIONS_PER_SECTOR),
    [stocks]
  );

  const visibleSectors = showAllSectors ? sectorCounts : sectorCounts.slice(0, SECTORS_COLLAPSED);

  const togglePick = (p: Pick) =>
    setPicks((cur) => (cur.some((c) => c.ticker === p.ticker) ? cur.filter((c) => c.ticker !== p.ticker) : [...cur, p]));

  const addPick = (r: StockSearchResult) => {
    const ticker = r.ticker.toUpperCase();
    setPicks((cur) =>
      cur.some((c) => c.ticker === ticker) ? cur : [...cur, { ticker, name: r.name, sector: r.sector, score: r.three_x_score }]
    );
  };

  const toggleSector = (sector: string) =>
    setSectors((cur) => (cur.includes(sector) ? cur.filter((s) => s !== sector) : [...cur, sector]));

  const choosePath = (p: Path) => {
    setPath(p);
    setError(null);
    setStep(p === 'mine' ? 'pick' : 'finish');
  };

  const canContinue = path === 'sp500' || picks.length > 0;

  /** Writes picks to the user's default watchlist, creating "My Stocks" if they have none. */
  async function savePicks(tickers: string[]) {
    if (!tickers.length) return;
    const { lists } = await getWatchlists();
    let target = lists.find((l) => l.is_default) ?? lists[0];
    if (!target) target = { ...(await createWatchlist('My Stocks')), items: [] };
    const existing = new Set((target.items ?? []).map((i) => i.ticker.toUpperCase()));
    const listId = target.id;
    const results = await Promise.allSettled(
      tickers.filter((t) => !existing.has(t)).map((ticker) => addWatchlistItem({ watchlist_id: listId, ticker }))
    );
    const failed = results.filter(
      (r) => r.status === 'rejected' && !(r.reason instanceof ApiError && r.reason.status === 409)
    ).length;
    if (failed) throw new Error(`Could not save ${failed} of your stocks. Please try again.`);
  }

  async function finish() {
    setSaving('finish');
    setError(null);
    try {
      await savePicks(picks.map((p) => p.ticker));
      await update({
        // An explicit "Follow the S&P 500" choice wins even if a few extra stocks were added.
        dashboard_scope: path === 'sp500' || !picks.length ? 'sp500' : 'mine',
        sectors,
        onboarded: true,
      });
      void reloadWatchlist();
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not save your setup. Please try again.');
      setSaving(null);
    }
  }

  async function skip() {
    if (onboarded) {
      navigate('/app', { replace: true });
      return;
    }
    setSaving('skip');
    setError(null);
    try {
      await update({ onboarded: true });
      navigate('/app', { replace: true });
    } catch {
      setError('Could not save. Please try again.');
      setSaving(null);
    }
  }

  const busy = saving !== null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-24 sm:pb-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">
          {onboarded ? 'Personalize your dashboard' : 'Welcome to 3x Hunter'}
        </p>
        <button
          type="button"
          onClick={() => void skip()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline disabled:opacity-50"
        >
          {saving === 'skip' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {onboarded ? 'Back to dashboard' : 'Skip for now'}
        </button>
      </div>

      <ProgressSteps step={step} skippedPick={path === 'sp500' && picks.length === 0} />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {step === 'start' && (
        <section className="space-y-6 animate-slide-up" aria-labelledby="ob-start">
          <div className="space-y-2">
            <h1 id="ob-start" className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              How do you want to start?
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your dashboard is built around what you follow. You can add or remove stocks any time.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceCard
              icon={<ListPlus className="h-5 w-5" aria-hidden="true" />}
              title="Pick my own stocks"
              body="Search any US stock or ETF, or start from top-scoring names in the sectors you care about."
              selected={path === 'mine'}
              onClick={() => choosePath('mine')}
            />
            <ChoiceCard
              icon={<Landmark className="h-5 w-5" aria-hidden="true" />}
              title="Follow the S&P 500"
              body="See all 500 constituents ranked by 3x score. A solid default you can narrow down later."
              selected={path === 'sp500'}
              onClick={() => choosePath('sp500')}
            />
          </div>
        </section>
      )}

      {step === 'pick' && (
        <section className="space-y-8 animate-slide-up" aria-labelledby="ob-pick">
          <div className="space-y-2">
            <h1 id="ob-pick" className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              Add the stocks you like
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Search by ticker or company. Stocks we do not track yet are added and scored on the spot.
            </p>
          </div>

          <StockSearch mode="pick" selectedTickers={pickedSet} onSelect={addPick} autoFocus placeholder="Search e.g. NVDA, Costco, SPY" />

          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-neutral-900">Selected</h2>
              <span className="text-[12px] tabular-nums text-neutral-500" aria-live="polite">
                {picks.length} {picks.length === 1 ? 'stock' : 'stocks'}
              </span>
            </div>
            {picks.length ? (
              <ul className="flex flex-wrap gap-2">
                {picks.map((p) => (
                  <li key={p.ticker}>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-neutral-50 py-1 pl-3 pr-1 text-[12px] font-medium text-neutral-900">
                      {p.ticker}
                      <button
                        type="button"
                        onClick={() => togglePick(p)}
                        aria-label={`Remove ${p.ticker}`}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-[13px] text-neutral-500">
                {path === 'sp500' ? 'Optional: add a few stocks to keep an eye on.' : 'Pick at least one stock to continue.'}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-[13px] font-semibold text-neutral-900">Popular</h2>
            {stocksLoading && !stocks.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : popular.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {popular.map((s) => (
                  <StockToggle key={s.ticker} stock={s} selected={pickedSet.has(s.ticker.toUpperCase())} onToggle={() => togglePick(toPick(s))} />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-neutral-500">Stock data is unavailable right now. You can still search above.</p>
            )}
          </div>

          {sectorCounts.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-[13px] font-semibold text-neutral-900">Sectors you care about</h2>
                <p className="text-[12px] text-neutral-500">Tap a sector to see its top-scoring stocks.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleSectors.map(([sector, count]) => {
                  const on = sectors.includes(sector);
                  return (
                    <button
                      key={sector}
                      type="button"
                      onClick={() => toggleSector(sector)}
                      aria-pressed={on}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                        on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
                      )}
                    >
                      {on && <Check className="h-3 w-3" aria-hidden="true" />}
                      {sector}
                      <span className={cn('tabular-nums', on ? 'text-neutral-300' : 'text-neutral-400')}>{count}</span>
                    </button>
                  );
                })}
                {sectorCounts.length > SECTORS_COLLAPSED && (
                  <button
                    type="button"
                    onClick={() => setShowAllSectors((v) => !v)}
                    className="rounded-full px-3 py-1.5 text-[12px] font-medium text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
                  >
                    {showAllSectors ? 'Show fewer' : `Show all ${sectorCounts.length}`}
                  </button>
                )}
              </div>

              {sectors.map((sector) => {
                const top = topBySector.get(sector) ?? [];
                if (!top.length) return null;
                return (
                  <div key={sector} className="space-y-2 rounded-xl border border-border p-4 animate-fade-in">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[13px] font-semibold text-neutral-900">Top in {sector}</h3>
                      <button
                        type="button"
                        onClick={() => {
                          const missing = top.filter((s) => !pickedSet.has(s.ticker.toUpperCase())).map(toPick);
                          setPicks((cur) => [...cur, ...missing]);
                        }}
                        className="text-[12px] font-medium text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
                      >
                        Add all
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {top.map((s) => (
                        <StockToggle key={s.ticker} stock={s} selected={pickedSet.has(s.ticker.toUpperCase())} onToggle={() => togglePick(toPick(s))} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => setStep(path === 'sp500' ? 'finish' : 'start')} disabled={busy} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button onClick={() => setStep('finish')} disabled={!canContinue || busy} className="gap-1.5">
                Continue{picks.length ? ` with ${picks.length}` : ''}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === 'finish' && (
        <section className="space-y-6 animate-slide-up" aria-labelledby="ob-finish">
          <div className="space-y-2">
            <h1 id="ob-finish" className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              {path === 'sp500' ? 'Your dashboard will follow the S&P 500' : 'Your dashboard is ready'}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {path === 'sp500'
                ? 'All 500 constituents, ranked by 3x Opportunity Score.'
                : `Your dashboard will focus on the ${picks.length} ${picks.length === 1 ? 'stock' : 'stocks'} you picked.`}{' '}
              You can change this from the dashboard or from Personalize in your account menu.
            </p>
          </div>

          <div className="space-y-4 rounded-xl border border-border p-5">
            <div className="space-y-2">
              <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Dashboard view</p>
              <p className="text-[14px] font-semibold text-neutral-900">{path === 'sp500' ? 'S&P 500' : 'My stocks'}</p>
            </div>
            {picks.length > 0 && (
              <div className="space-y-2">
                <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">
                  Added to your watchlist ({picks.length})
                </p>
                <p className="text-[13px] leading-relaxed text-neutral-700">{picks.map((p) => p.ticker).join(', ')}</p>
              </div>
            )}
            {sectors.length > 0 && (
              <div className="space-y-2">
                <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Sectors</p>
                <p className="text-[13px] leading-relaxed text-neutral-700">{sectors.join(', ')}</p>
              </div>
            )}
            {path === 'sp500' && (
              <button
                type="button"
                onClick={() => setStep('pick')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-900 underline-offset-4 hover:underline disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {picks.length ? 'Edit the stocks you added' : 'Also add a few stocks to watch'}
              </button>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setStep(path === 'sp500' ? 'start' : 'pick')} disabled={busy} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
            <Button size="lg" onClick={() => void finish()} disabled={busy || !canContinue} className="gap-2">
              {saving === 'finish' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving...
                </>
              ) : (
                <>
                  Go to my dashboard
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
