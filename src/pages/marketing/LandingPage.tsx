import { lazy, Suspense, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bookmark,
  Briefcase,
  CalendarClock,
  Calculator,
  Database,
  FileSearch,
  FileText,
  FlaskConical,
  GitCommitHorizontal,
  Grid3x3,
  History,
  LineChart,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ComplianceNote } from '@/components/marketing/ComplianceNote';
import { ScorePreviewCard } from '@/components/marketing/ScorePreviewCard';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { DIMENSIONS, MODEL_VERSION } from '@/lib/scoring';
import { Skeleton } from '@/components/ui/skeleton';

// Chart code loads on demand so it never weighs down the first page load.
const TrackRecordTeaser = lazy(() => import('@/components/track-record/TrackRecordView').then((m) => ({ default: m.TrackRecordTeaser })));


const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BarChart3,
    title: `${DIMENSIONS.length}-dimension scoring`,
    body: 'Growth, valuation, momentum, quality, catalysts, market position, volatility and daily market regime fit, weighted into one 0-100 score.',
  },
  {
    icon: ShieldAlert,
    title: 'Independent risk score',
    body: 'Volatility, beta, leverage, cash runway and size feed a separate risk score, so upside never hides downside.',
  },
  {
    icon: CalendarClock,
    title: 'Catalyst calendar',
    body: 'Track earnings, trial readouts and product launches across every stock you follow in one timeline.',
  },
  {
    icon: Calculator,
    title: '3x scenario calculator',
    body: 'Model the revenue growth and multiple a company would need to triple, and stress-test the assumptions.',
  },
  {
    icon: Bookmark,
    title: 'Named watchlists',
    body: 'Group ideas into lists with notes and tags, and see aggregate score and risk at a glance.',
  },
  {
    icon: History,
    title: 'Score-change tracking',
    body: 'Score history surfaces the biggest movers and new breakouts so you do not have to go looking.',
  },
  {
    icon: Grid3x3,
    title: 'Sector heat map',
    body: 'See where scores cluster by sector and market cap to spot themes instead of single names.',
  },
  {
    icon: LineChart,
    title: 'Price charts',
    body: 'Interactive price history with 52-week context on every stock detail page.',
  },
  {
    icon: Bell,
    title: 'In-app alerts',
    body: 'Get notified in the app when a price, score or catalyst threshold is crossed. Free during beta.',
  },
  {
    icon: FlaskConical,
    title: 'Score backtesting',
    body: 'See how past stored scores lined up with forward returns, with sample-size caveats up front. Free during beta.',
  },
  {
    icon: Briefcase,
    title: 'Simulated portfolios',
    body: 'Track hypothetical positions with score, risk and sector exposure. No real money involved. Free during beta.',
  },
  {
    icon: FileSearch,
    title: 'SEC filings and insiders',
    body: 'Recent EDGAR filings and Form 4 insider activity on each stock, for context. Free during beta.',
  },
];

const STEPS = [
  {
    title: 'Scan the universe',
    body: 'Every tracked stock is scored on the same weighted dimensions using public market data.',
  },
  {
    title: 'Filter and compare',
    body: 'Use preset screens or your own filters to rank by opportunity, risk-adjusted fit or momentum.',
  },
  {
    title: 'Research the case',
    body: 'Open any stock to see its bull, neutral and bear cases, the inputs behind each score and what would invalidate it.',
  },
];

const TRUST = [
  {
    icon: FileText,
    title: 'Methodology is public',
    body: 'Every weight, input and threshold is documented. No black box, no hidden signals.',
    link: { to: '/methodology', label: 'Read the methodology' },
  },
  {
    icon: Database,
    title: 'Clear data sources',
    body: 'Prices and fundamentals come from Yahoo Finance and may be delayed. Missing inputs are left blank, never invented.',
  },
  {
    icon: GitCommitHorizontal,
    title: 'Versioned model',
    body: `Scores are deterministic and tagged with a model version (currently ${MODEL_VERSION}), so changes are traceable.`,
  },
];

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">{eyebrow}</p>
      <h2 className="text-2xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-3xl">{title}</h2>
      {body && <p className="text-[15px] leading-relaxed text-neutral-600">{body}</p>}
    </div>
  );
}

export default function LandingPage() {
  useDocumentTitle('3x Hunter - Transparent stock opportunity scores', '3x Hunter ranks US stocks with a transparent 0-100 3x Opportunity Score and an independent risk score. Portfolio reports, rule-based bots and a 10-year track record. Free to start.');
  const { hash } = useLocation();

  // React Router does not scroll to hash targets on client-side navigation.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [hash]);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:48px_48px] opacity-50 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
          <div className="animate-slide-up space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[12px] font-medium text-neutral-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Free during beta
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl">
              Find stocks with room to run. See exactly why.
            </h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-neutral-600">
              3x Hunter ranks stocks with a transparent 0-100 3x Opportunity Score built from {DIMENSIONS.length}{' '}
              weighted dimensions, paired with an independent risk score. Every number shows its inputs.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2 px-6">
                <Link to="/signup">
                  Get started
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-6">
                <Link to="/methodology">See methodology</Link>
              </Button>
            </div>
            <p className="text-[12px] text-neutral-500">No credit card. Educational research tool, not investment advice.</p>
          </div>

          <div className="animate-fade-in">
            <ScorePreviewCard />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-16">
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-16 sm:px-8 sm:py-24">
          <SectionHeading
            eyebrow="Features"
            title="Research tools built around one honest score"
            body="Everything you need to go from a long list of tickers to a short list worth your time."
          />
          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="space-y-3 bg-background p-6 transition-colors hover:bg-neutral-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-neutral-50">
                  <f.icon className="h-4 w-4 text-neutral-800" aria-hidden="true" />
                </span>
                <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900">{f.title}</h3>
                <p className="text-[13px] leading-relaxed text-neutral-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Track record */}
      <section id="track-record" className="scroll-mt-16 border-t border-border">
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-8 sm:py-24">
          <SectionHeading
            eyebrow="Track record"
            title="If you had followed the 3x score since 2016"
            body="We rebuilt the score for every quarter since 2016 using only the data available at the time, then compared the top-ranked stocks with simply holding the S&P 500."
          />
          <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
            <TrackRecordTeaser />
          </Suspense>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-16 border-y border-border bg-neutral-50">
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-16 sm:px-8 sm:py-24">
          <SectionHeading eyebrow="How it works" title="From a long list of tickers to a focused short list" />
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Card className="h-full space-y-3 p-6">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-[13px] font-semibold tabular-nums text-white">
                    {i + 1}
                  </span>
                  <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900">{s.title}</h3>
                  <p className="text-[13px] leading-relaxed text-neutral-600">{s.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section>
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-16 sm:px-8 sm:py-24">
          <SectionHeading
            eyebrow="Transparency"
            title="You should be able to check our work"
            body="Scores are only useful if you can see what drives them. We publish how the model works and where the data comes from."
          />
          <div className="grid gap-6 md:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="space-y-3 border-l-2 border-neutral-900 pl-5">
                <t.icon className="h-5 w-5 text-neutral-800" aria-hidden="true" />
                <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900">{t.title}</h3>
                <p className="text-[13px] leading-relaxed text-neutral-600">{t.body}</p>
                {t.link && (
                  <Link
                    to={t.link.to}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-neutral-900 underline-offset-4 hover:underline"
                  >
                    {t.link.label}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-16 sm:px-8 sm:pb-24">
        <div className="mx-auto max-w-6xl rounded-2xl bg-neutral-900 px-6 py-12 text-center sm:px-12 sm:py-16">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
            Start building your short list today
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-neutral-300">
            Free while in beta. Create an account to save watchlists, track catalysts and follow score changes.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2 bg-white px-6 text-neutral-900 hover:bg-neutral-100">
              <Link to="/signup">
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-neutral-700 px-6 text-white hover:bg-neutral-800 hover:text-white"
            >
              <Link to="/pricing">View pricing</Link>
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl">
          <ComplianceNote />
        </div>
      </section>
    </>
  );
}
