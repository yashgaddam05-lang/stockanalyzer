import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Briefcase,
  Check,
  Compass,
  Gauge,
  Landmark,
  Lightbulb,
  Loader2,
  Plus,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { addWatchlistItem, ApiError, createWatchlist, getWatchlists } from '@/lib/api';
import type { Experience, InvestGoal, RiskAppetite, StockListItem, StockSearchResult } from '@/lib/supabase';
import { useStocks } from '@/components/data/StocksProvider';
import { usePreferences } from '@/components/data/PreferencesProvider';
import { StockSearch } from '@/components/search/StockSearch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Path = 'mine' | 'sp500';
type Step = 'intro' | 'about' | 'pick' | 'tour';

interface Pick {
  ticker: string;
  name: string;
  sector: string | null;
  score: number | null;
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'intro', label: 'What you get' },
  { id: 'about', label: 'About you' },
  { id: 'pick', label: 'Your stocks' },
  { id: 'tour', label: 'How to use it' },
];

const GOALS: { value: InvestGoal; icon: ReactNode; title: string; body: string }[] = [
  {
    value: 'multibaggers',
    icon: <Rocket className="h-5 w-5" aria-hidden="true" />,
    title: 'Find stocks that could triple',
    body: 'Rank ideas by 3x Opportunity Score and catch growth, momentum and catalysts early.',
  },
  {
    value: 'track',
    icon: <Briefcase className="h-5 w-5" aria-hidden="true" />,
    title: 'Keep an eye on what I own',
    body: 'Add your holdings and get one score, a risk read and alerts when something changes.',
  },
  {
    value: 'ideas',
    icon: <Lightbulb className="h-5 w-5" aria-hidden="true" />,
    title: 'Research new ideas',
    body: 'Screen by sector and score, compare names side by side, and build watchlists.',
  },
  {
    value: 'learn',
    icon: <BookOpen className="h-5 w-5" aria-hidden="true" />,
    title: 'Learn how to analyze stocks',
    body: 'See which factors drive a score and why, in plain language, on well-known companies.',
  },
];

const EXPERIENCE: { value: Experience; label: string; hint: string }[] = [
  { value: 'new', label: 'New to investing', hint: 'Under a year' },
  { value: 'some', label: 'Some experience', hint: 'I buy stocks now and then' },
  { value: 'experienced', label: 'Experienced', hint: 'I research and trade actively' },
];

const RISK: { value: RiskAppetite; label: string; hint: string }[] = [
  { value: 'conservative', label: 'Play it safe', hint: 'Large, established companies' },
  { value: 'balanced', label: 'Balanced', hint: 'Growth, but avoid the wildest swings' },
  { value: 'aggressive', label: 'Go for big upside', hint: 'I accept high volatility' },
];

const RISK_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, extreme: 3 };

/** Starter suggestions shaped by the user's risk answer (and sectors, when chosen). */
function suggestFor(stocks: StockListItem[], risk: RiskAppetite | null, sectors: string[]): StockListItem[] {
  let pool = stocks.filter((s) => (s.current_price ?? 0) > 0);
  if (sectors.length) pool = pool.filter((s) => s.sector && sectors.includes(s.sector));
  const score = (s: StockListItem) => s.three_x_score ?? 0;
  const riskRank = (s: StockListItem) => RISK_ORDER[s.risk_level] ?? 1;
  if (risk === 'conservative') {
    pool = pool.filter((s) => s.in_sp500 && riskRank(s) <= 1).sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
  } else if (risk === 'aggressive') {
    pool = pool.sort((a, b) => score(b) - score(a));
  } else {
    pool = pool.filter((s) => riskRank(s) <= 2 && (s.market_cap ?? 0) >= 10e9).sort((a, b) => score(b) - score(a));
  }
  return pool.slice(0, SUGGESTIONS_PER_SECTOR);
}

const PICK_COPY: Record<InvestGoal, { title: string; body: string }> = {
  multibaggers: { title: 'Pick stocks to hunt', body: 'Start from the suggestions below or search any US-listed company.' },
  track: { title: 'Add the stocks you own', body: 'Search each holding by ticker or name. We score and watch them for you.' },
  ideas: { title: 'Add stocks you are curious about', body: 'Pick a sector or two to see their top-scoring names, or search directly.' },
  learn: { title: 'Pick a few companies you know', body: 'Familiar names make it easier to see what drives a score.' },
};

const GOAL_TIP: Record<InvestGoal, string> = {
  multibaggers: 'Open Explore and sort by 3x score: names above 70 with a rising score are the ones to research first.',
  track: 'Check the Your stocks table each week. A falling score or a jump in risk is your cue to look closer.',
  ideas: 'Use Explore with your sectors selected, then add anything interesting to a watchlist to compare it.',
  learn: 'Open any stock and read its score breakdown: each of the 8 factors explains what pushed it up or down.',
};

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
  cta = 'Choose',
}: {
  icon: ReactNode;
  title: string;
  body: string;
  selected: boolean;
  onClick: () => void;
  cta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'group flex h-full w-full flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all',
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
        {selected ? 'Selected' : cta}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </button>
  );
}

function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; hint: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-[14px] font-semibold text-neutral-900">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cn(
                'flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-colors',
                on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-border bg-background hover:border-neutral-400'
              )}
            >
              <span className="text-[13px] font-semibold">{o.label}</span>
              <span className={cn('text-[12px]', on ? 'text-neutral-300' : 'text-neutral-500')}>{o.hint}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
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

  // Returning users (via Personalize) skip the product intro.
  const [step, setStep] = useState<Step>(onboarded ? 'about' : 'intro');
  const [path, setPath] = useState<Path>('mine');
  const [goal, setGoal] = useState<InvestGoal | null>(prefs?.goal ?? null);
  const [experience, setExperience] = useState<Experience | null>(prefs?.experience ?? null);
  const [risk, setRisk] = useState<RiskAppetite | null>(prefs?.risk ?? null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [showAllSectors, setShowAllSectors] = useState(false);
  const [saving, setSaving] = useState<'finish' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revisiting: start from the answers the user gave last time.
  useEffect(() => {
    if (prefs?.sectors?.length) setSectors((cur) => (cur.length ? cur : prefs.sectors));
    if (prefs?.goal) setGoal((cur) => cur ?? prefs.goal ?? null);
    if (prefs?.experience) setExperience((cur) => cur ?? prefs.experience ?? null);
    if (prefs?.risk) setRisk((cur) => cur ?? prefs.risk ?? null);
  }, [prefs?.sectors, prefs?.goal, prefs?.experience, prefs?.risk]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  const pickedSet = useMemo(() => new Set(picks.map((p) => p.ticker)), [picks]);

  const sectorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stocks) {
      if (!s.sector || s.sector === 'Other') continue;
      counts.set(s.sector, (counts.get(s.sector) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [stocks]);

  const topBySector = useMemo(() => {
    const map = new Map<string, StockListItem[]>();
    for (const sector of sectors) {
      map.set(sector, suggestFor(stocks.filter((s) => s.sector === sector), risk, []));
    }
    return map;
  }, [stocks, sectors, risk]);

  const suggestions = useMemo(() => suggestFor(stocks, risk, []), [stocks, risk]);
  const suggestionReason =
    risk === 'conservative'
      ? 'Large, lower-risk S&P 500 companies.'
      : risk === 'aggressive'
        ? 'The highest 3x scores we track right now, regardless of risk.'
        : 'High-scoring companies over $10B, skipping the most extreme risk.';
  const pickCopy = PICK_COPY[goal ?? 'multibaggers'];

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

  const continueWith = (p: Path) => {
    setPath(p);
    setError(null);
    setStep('tour');
  };

  const aboutDone = goal !== null && experience !== null && risk !== null;

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
      if (path === 'mine') await savePicks(picks.map((p) => p.ticker));
      await update({
        dashboard_scope: path === 'sp500' ? 'sp500' : 'mine',
        sectors,
        goal,
        experience,
        risk,
        onboarded: true,
      });
      void reloadWatchlist();
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not save your setup. Please try again.');
      setSaving(null);
    }
  }

  /** "Do this later": the dashboard then shows the get-started guide instead of market data. */
  async function skip() {
    if (onboarded) {
      navigate('/app', { replace: true });
      return;
    }
    setSaving('skip');
    setError(null);
    try {
      await update({ dashboard_scope: 'mine', goal, experience, risk, onboarded: true });
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
          {onboarded ? 'Back to dashboard' : "I'll do this later"}
        </button>
      </div>

      <ProgressSteps step={step} skippedPick={path === 'sp500' && step === 'tour'} />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {step === 'intro' && (
        <section className="space-y-8 animate-slide-up" aria-labelledby="ob-intro">
          <div className="space-y-3">
            <h1 id="ob-intro" className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              Your own research desk for finding the next big winners
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              3x Hunter scores US stocks from 0 to 100 on their potential to triple, using 8 factors: growth, valuation
              upside, momentum, fundamental quality, catalysts, market position, risk and market regime. Your dashboard
              shows only the stocks you choose, so it starts empty and becomes yours in about a minute.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: <Gauge className="h-4 w-4" />, title: 'One score instead of twenty tabs', body: 'Growth, valuation, momentum and analyst targets rolled into a single 0-100 number, refreshed through the day.' },
              { icon: <ShieldCheck className="h-4 w-4" />, title: 'Know the risk before you buy', body: 'Every stock gets a separate risk rating from volatility and beta, so a high score never hides a wild ride.' },
              { icon: <TrendingUp className="h-4 w-4" />, title: 'Spot changes early', body: 'Score movers show which of your stocks are improving or slipping, before it shows up in the price.' },
              { icon: <Bell className="h-4 w-4" />, title: 'Get alerted, not overwhelmed', body: 'Set alerts on score, price or risk, and keep catalysts like earnings dates on one calendar.' },
            ].map((b) => (
              <div key={b.title} className="flex gap-3 rounded-xl border border-border p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white" aria-hidden="true">
                  {b.icon}
                </span>
                <div className="space-y-1">
                  <p className="text-[14px] font-semibold text-neutral-900">{b.title}</p>
                  <p className="text-[13px] leading-relaxed text-neutral-600">{b.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-xl bg-neutral-50 p-5">
            <p className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">How we will set it up</p>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                ['Tell us about you', 'Your goal, experience and how much risk you take.'],
                ['Pick your stocks', 'Search any US stock, or start from suggestions that fit you.'],
                ['Learn your dashboard', 'A quick guide to what each section does for you.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-neutral-900">{t}</span>
                    <span className="block text-[12px] text-neutral-600">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex justify-end">
            <Button size="lg" onClick={() => setStep('about')} className="gap-2">
              Build my dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {step === 'about' && (
        <section className="space-y-8 animate-slide-up" aria-labelledby="ob-about">
          <div className="space-y-2">
            <h1 id="ob-about" className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              What do you want 3x Hunter to do for you?
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Three quick questions. We use your answers to suggest stocks and tailor your dashboard tips.
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-[14px] font-semibold text-neutral-900">Your main goal</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {GOALS.map((g) => (
                <ChoiceCard
                  key={g.value}
                  icon={g.icon}
                  title={g.title}
                  body={g.body}
                  selected={goal === g.value}
                  onClick={() => setGoal(g.value)}
                  cta="This is me"
                />
              ))}
            </div>
          </fieldset>

          <OptionRow label="Your investing experience" options={EXPERIENCE} value={experience} onChange={setExperience} />
          <OptionRow label="How much risk are you comfortable with?" options={RISK} value={risk} onChange={setRisk} />

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep('intro')} disabled={busy} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
            <Button onClick={() => setStep('pick')} disabled={!aboutDone || busy} className="gap-1.5">
              {aboutDone ? 'Continue' : 'Answer all three to continue'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {step === 'pick' && (
        <section className="space-y-8 animate-slide-up" aria-labelledby="ob-pick">
          <div className="space-y-2">
            <h1 id="ob-pick" className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              {pickCopy.title}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {pickCopy.body} Stocks we do not track yet are added and scored on the spot.
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
                Pick at least one stock to build your dashboard.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-[13px] font-semibold text-neutral-900">Suggested for you</h2>
              <p className="text-[12px] text-neutral-500">{suggestionReason}</p>
            </div>
            {stocksLoading && !stocks.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : suggestions.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {suggestions.map((s) => (
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

          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-neutral-300 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold text-neutral-900">Not sure what to pick?</p>
                <p className="text-[12px] text-neutral-500">
                  Follow the whole S&P 500 ranked by 3x score instead. You can switch to your own stocks any time.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => continueWith('sp500')} disabled={busy}>
              Follow the S&P 500
            </Button>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => setStep('about')} disabled={busy} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button onClick={() => continueWith('mine')} disabled={!picks.length || busy} className="gap-1.5">
                Continue{picks.length ? ` with ${picks.length}` : ''}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === 'tour' && (
        <section className="space-y-6 animate-slide-up" aria-labelledby="ob-tour">
          <div className="space-y-2">
            <h1 id="ob-tour" className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              Here is how to use your dashboard
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {path === 'sp500'
                ? 'Your dashboard will follow the S&P 500, ranked by 3x Opportunity Score.'
                : `Your dashboard will be built around the ${picks.length} ${picks.length === 1 ? 'stock' : 'stocks'} you picked: ${picks
                    .slice(0, 6)
                    .map((p) => p.ticker)
                    .join(', ')}${picks.length > 6 ? ` and ${picks.length - 6} more` : ''}.`}
            </p>
          </div>

          {goal && (
            <div className="flex gap-3 rounded-xl border border-neutral-900 bg-neutral-50 p-4">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-neutral-900" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold text-neutral-900">Your first move</p>
                <p className="text-[13px] leading-relaxed text-neutral-700">{GOAL_TIP[goal]}</p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: <Gauge className="h-4 w-4" />,
                title: 'Your stocks',
                body: 'Each stock with its 3x score (70+ is strong, under 40 is weak), the score change and a risk label. Click a row for the full breakdown.',
              },
              {
                icon: <TrendingUp className="h-4 w-4" />,
                title: 'Score movers and top opportunities',
                body: 'What improved or slipped since the last refresh, and where the best setups are in your view.',
              },
              {
                icon: <Search className="h-4 w-4" />,
                title: 'Search to add anything',
                body: 'The search bar at the top adds any Nasdaq, NYSE or Cboe stock. New stocks are scored within seconds.',
              },
              {
                icon: <Bell className="h-4 w-4" />,
                title: 'Alerts and catalysts',
                body: 'Open a stock to set an alert on its score or price. Upcoming earnings for your stocks show on the dashboard.',
              },
              {
                icon: <Compass className="h-4 w-4" />,
                title: 'Explore and screens',
                body: 'Screen your stocks, the S&P 500 or everything we track by sector, score and risk to find new ideas.',
              },
              {
                icon: <Landmark className="h-4 w-4" />,
                title: 'Switch your view any time',
                body: 'The toggle at the top of the dashboard flips between My stocks, the S&P 500 and All tracked.',
              },
            ].map((b) => (
              <div key={b.title} className="flex gap-3 rounded-xl border border-border p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white" aria-hidden="true">
                  {b.icon}
                </span>
                <div className="space-y-1">
                  <p className="text-[14px] font-semibold text-neutral-900">{b.title}</p>
                  <p className="text-[13px] leading-relaxed text-neutral-600">{b.body}</p>
                </div>
              </div>
            ))}
          </div>

          {experience === 'new' && (
            <p className="rounded-lg bg-neutral-50 px-4 py-3 text-[12px] leading-relaxed text-neutral-600">
              New to this? A 3x score is a research starting point, not a buy signal. Read the{' '}
              <a href="/methodology" className="font-medium text-neutral-900 underline underline-offset-2">
                methodology
              </a>{' '}
              to see exactly how scores are built.
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setStep('pick')} disabled={busy} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
            <Button size="lg" onClick={() => void finish()} disabled={busy} className="gap-2">
              {saving === 'finish' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving...
                </>
              ) : (
                <>
                  Open my dashboard
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
          <p className="text-center text-[11px] text-neutral-500">
            Educational research tool, not investment advice. Change your answers any time from Personalize in your account menu.
          </p>
        </section>
      )}
    </div>
  );
}
