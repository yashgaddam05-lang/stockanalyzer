import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { Card } from '@/components/ui/card';
import { DimensionTable } from '@/components/methodology/DimensionTable';
import { Disclaimer } from '@/components/methodology/Disclaimer';
import { MethodologyToc, type TocItem } from '@/components/methodology/MethodologyToc';
import { DATA_SOURCES, STOCK_CHECK_LIMITS as LIM } from '@/lib/data-provenance';
import { DIMENSION_EXPLAINERS, DIMENSIONS, MODEL_VERSION, PRESET_SCREENS, riskLabelFor, type RiskLabel } from '@/lib/scoring';

const SECTIONS: TocItem[] = [
  { id: 'simple', label: 'The simple version' },
  { id: 'overview', label: 'Overview' },
  { id: 'dimensions', label: 'Score dimensions' },
  { id: 'risk', label: 'Risk score' },
  { id: 'cases', label: 'Bull, neutral and bear cases' },
  { id: 'presets', label: 'Preset screens' },
  { id: 'regime', label: 'Market regime fit' },
  { id: 'backtesting', label: 'Backtesting' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'portfolios', label: 'Simulated portfolios' },
  { id: 'sec', label: 'SEC filings' },
  { id: 'sources', label: 'Where the data comes from' },
  { id: 'stock-checks', label: 'How we check each stock' },
  { id: 'quality-checks', label: 'Pipeline checks' },
  { id: 'data', label: 'Data and limitations' },
  { id: 'disclaimer', label: 'Disclaimer' },
];

const REGIME_INPUTS = [
  'VIX level (market volatility)',
  '10-year Treasury yield and its 3-month trend',
  'SPY vs its 200-day moving average, and SPY 3-month return',
  'Small-cap (IWM) and Nasdaq (QQQ) relative strength vs SPY',
  'Sector ETF 3-month relative strength vs SPY',
];

const RISK_INPUTS = [
  'Annualized volatility',
  'Beta',
  'Debt/equity',
  'Cash runway (months)',
  'Market cap (log scale, smaller is riskier)',
  'Net profit margin (falls back to earnings growth direction)',
];

/** Derive risk bands from riskLabelFor so the page never drifts from the code. */
function riskBands(): { label: RiskLabel; min: number; max: number }[] {
  const bands: { label: RiskLabel; min: number; max: number }[] = [];
  for (let s = 0; s <= 100; s++) {
    const label = riskLabelFor(s);
    const last = bands[bands.length - 1];
    if (last && last.label === label) last.max = s;
    else bands.push({ label, min: s, max: s });
  }
  return bands;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="text-sm leading-relaxed text-neutral-700">{children}</p>;

export default function MethodologyPage() {
  useDocumentTitle('Methodology · 3x Hunter', 'How the 3x Opportunity Score, risk score and scenarios are calculated: 9 weighted factors, data sources, confidence and limits.');
  const { hash } = useLocation();
  const [activeId, setActiveId] = useState<string | undefined>(SECTIONS[0].id);

  // React Router does not scroll to hash targets on client-side navigation (footer link).
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
      setActiveId(el.id);
    }
  }, [hash]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        // At the page bottom the last short section can never reach the top band; select it explicitly.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          setActiveId(SECTIONS[SECTIONS.length - 1].id);
          return;
        }
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -60% 0px' },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const unavailable = DIMENSIONS.filter((d) => d.inputs.length === 0);
  const unavailableWeight = unavailable.reduce((a, d) => a + d.weight, 0);
  const totalWeight = DIMENSIONS.reduce((a, d) => a + d.weight, 0);
  const bands = riskBands();

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Methodology</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          How the 3x Opportunity Score, risk score and scenario cases are calculated. Model {MODEL_VERSION}.
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <MethodologyToc items={SECTIONS} activeId={activeId} />
        </aside>

        <div className="max-w-3xl space-y-12">
          <Section id="simple" title="The simple version">
            <Card className="space-y-4 p-5">
              <P>
                Imagine you want to buy part of a lemonade stand, and you hope it grows to be worth three times what you
                paid. You can’t see the future, so you look at a report card instead. 3x Hunter gives every stock a report
                card with {DIMENSIONS.length} subjects. Each subject gets a grade from 0 to 100, and some subjects count
                more than others.
              </P>
              <ul className="space-y-2">
                {DIMENSIONS.map((d) => (
                  <li key={d.key} className="flex gap-3 text-sm">
                    <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-neutral-900">{d.weight}%</span>
                    <span className="text-neutral-700">
                      <span className="font-medium text-neutral-900">{d.label}:</span> {DIMENSION_EXPLAINERS[d.key].plain}
                    </span>
                  </li>
                ))}
              </ul>
              <P>
                Add up the grades, giving the bigger subjects more say, and you get one number: the 3x Score. A stand with a
                high score looks a lot like the stands that grew big in the past. It is a good report card, not a promise. A
                kid with straight A’s can still have a bad day, and a stock with a high score can still go down.
              </P>
            </Card>
          </Section>

          <Section id="overview" title="Overview">
            <P>
              The 3x Opportunity Score is a 0-100 heuristic that estimates how well a stock fits the profile of companies
              that have historically had room for a large move: strong growth, reasonable valuation, positive momentum,
              solid fundamentals and identifiable catalysts. It combines {DIMENSIONS.length} weighted dimensions into a
              single number.
            </P>
            <P>
              3x Hunter is an educational research tool. A higher score means a stronger fit for the model, not a
              prediction that the price will triple and not a recommendation to act. The score is deterministic: the same
              inputs always produce the same output, and missing inputs are never fabricated.
            </P>
          </Section>

          <Section id="dimensions" title="Score dimensions">
            <P>
              Each dimension is scored 0-100 from the inputs listed below, then combined using the weights shown. The
              total is the weighted average of the dimensions that have data.
            </P>
            <DimensionTable />
            <P>
              {unavailable.length > 0 && (
                <>
                  {unavailable.map((d) => d.label).join(', ')} ({unavailableWeight}% of {totalWeight}%) is currently
                  unavailable.{' '}
                </>
              )}
              When a dimension has no usable inputs for a stock it is left unscored and its weight is re-normalized
              across the remaining dimensions, so the total stays on a 0-100 scale.
            </P>
            <Card className="space-y-2 p-5">
              <h3 className="text-sm font-semibold text-neutral-900">Confidence</h3>
              <P>
                Confidence reflects how much of the total weight is backed by data for a given stock: high when at least
                85% of weight has data, medium from 65% to below 85%, and low below 65%. Low-confidence scores rest on
                fewer inputs and deserve more skepticism.
              </P>
            </Card>
          </Section>

          <Section id="risk" title="Risk score">
            <P>
              The risk score is a separate 0-100 measure where higher means riskier. It is not the inverse of the
              opportunity score: a stock can rank high on opportunity and high on risk at the same time.
            </P>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {bands.map((b) => (
                <div key={b.label} className="rounded-lg border border-border p-3">
                  <p className="text-[12px] font-medium capitalize text-neutral-900">{b.label}</p>
                  <p className="text-[12px] tabular-nums text-muted-foreground">
                    {b.min}-{b.max}
                  </p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-900">Inputs</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {RISK_INPUTS.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
            <P>
              Inputs are weighted and averaged over whichever are available. With no risk inputs at all the score
              defaults to a neutral 50. The detail view also lists invalidation signals: observable conditions, such as
              decelerating revenue growth or a break below the 52-week low, that would weaken the opportunity thesis.
            </P>
          </Section>

          <Section id="cases" title="Bull, neutral and bear cases">
            <P>
              Cases are generated only from metrics the stock actually has. They describe scenarios and never recommend
              an action.
            </P>
            <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
              <li>
                <span className="font-medium text-neutral-900">Bull case:</span> built from the strongest dimensions
                (scores of 60 or more), plus a revenue-tripling estimate when growth exceeds 30% and the analyst mean
                target when it sits above the current price.
              </li>
              <li>
                <span className="font-medium text-neutral-900">Neutral case:</span> assumes the stock tracks its current
                score and risk profile, citing middling dimensions (45 to 59), dimensions not yet scored and model
                confidence.
              </li>
              <li>
                <span className="font-medium text-neutral-900">Bear case:</span> built from the weakest dimensions
                (below 45) and the main risk-score drivers.
              </li>
            </ul>
          </Section>

          <Section id="presets" title="Preset screens">
            <P>Preset screens are fixed filter and sort rules applied to scored stocks on the Explore page.</P>
            <dl className="divide-y divide-border rounded-xl border border-border">
              {PRESET_SCREENS.map((p) => (
                <div key={p.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-sm font-medium text-neutral-900">{p.label}</dt>
                  <dd className="text-sm text-muted-foreground">{p.description}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="regime" title="Market regime fit">
            <P>
              Market Regime Fit is scored as of model {MODEL_VERSION}. A daily job builds a market snapshot from public
              index and ETF prices, labels the backdrop risk-on, neutral or risk-off, and then scores how well each
              stock&apos;s profile fits that backdrop. The per-stock result is stored with the stock and feeds the
              dimension like any other input.
            </P>
            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-900">Inputs</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {REGIME_INPUTS.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
            <P>
              Only prices on or before the snapshot date are used, so there is no look-ahead. If the daily snapshot is
              missing or has too little history, the dimension is left unscored and its weight is re-normalized.
            </P>
          </Section>

          <Section id="backtesting" title="Backtesting">
            <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
              <li>
                <span className="font-medium text-neutral-900">Stored history only:</span> backtests use score snapshots
                we actually recorded at the time, never scores recomputed after the fact.
              </li>
              <li>
                <span className="font-medium text-neutral-900">Next-session entry:</span> returns are measured from the
                close of the next trading session after a score was captured, over fixed forward horizons, alongside SPY
                for comparison.
              </li>
              <li>
                <span className="font-medium text-neutral-900">Same model version:</span> results only combine snapshots
                produced by the same model version, so a methodology change never mixes into the numbers.
              </li>
              <li>
                <span className="font-medium text-neutral-900">Sample size:</span> score history is short and the universe
                is small. Results below the minimum observation thresholds are flagged as insufficient, and even
                sufficient samples can be noise. Past results do not predict future returns.
              </li>
            </ul>
          </Section>

          <Section id="alerts" title="Alerts">
            <P>
              Alerts are delivered in-app only; there are no email, SMS or push notifications. Rules are edge-triggered:
              a price or score threshold fires once when it is crossed and re-arms only after the condition is no longer
              true. Score-change alerts compare consecutive snapshots from the same model version, and catalyst alerts fire
              once per event. Alerts are informational and are not signals to trade.
            </P>
          </Section>

          <Section id="portfolios" title="Simulated portfolios">
            <P>
              Simulated portfolios are hypothetical. No money is invested, no orders are placed and no brokerage account is
              connected. Positions are valued from the same delayed prices shown elsewhere and do not account for fees, taxes,
              slippage or dividends. Positions without a current price are shown at cost and flagged.
            </P>
          </Section>

          <Section id="sec" title="SEC filings">
            <P>
              Recent filings and insider transactions come from SEC EDGAR, including Form 4 insider reports. They are
              shown for information and context only. Filings data does not change the 3x Opportunity Score, can lag the
              original filing, and may be incomplete or misclassified.
            </P>
          </Section>

          <Section id="sources" title="Where the data comes from">
            <P>
              Nothing is typed in by hand except catalysts. Our server fetches every figure directly from the sources below,
              stores when it fetched it, and shows that timestamp on each stock page.
            </P>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[13px]">
                <thead className="border-b border-border bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">What it provides</th>
                    <th className="px-3 py-2 font-medium">How often</th>
                    <th className="px-3 py-2 font-medium">Why trust it / limit</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_SOURCES.map((s) => (
                    <tr key={s.id} className="border-b border-border align-top last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-neutral-900">{s.name}</p>
                        <p className="text-[11px] text-neutral-500">{s.publisher}</p>
                        {s.official && (
                          <span className="mt-1 inline-block rounded border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-800">
                            Official
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-neutral-700">{s.fields.join(', ')}</td>
                      <td className="px-3 py-2 text-neutral-700">{s.cadence}</td>
                      <td className="px-3 py-2 text-neutral-700">
                        {s.trust} <span className="text-amber-800">Limit: {s.limit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P>
              Honest caveat: most market figures come from one vendor, Yahoo Finance, through an unofficial API. That is why
              every stock is cross-checked against itself (below) and why filings come straight from the SEC. If Yahoo fails,
              we keep the last good value and show its age rather than inventing a new one.
            </P>
          </Section>

          <Section id="stock-checks" title="How we check each stock">
            <P>
              Every stock page has a <span className="font-medium text-neutral-900">Data</span> badge and a panel listing
              these checks with a pass, warning or fail for that stock. The same rules run for every stock:
            </P>
            <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
              <li><span className="font-medium text-neutral-900">Live source:</span> fetched from Yahoo, not a setup placeholder. Placeholder data fails.</li>
              <li><span className="font-medium text-neutral-900">Freshness:</span> passes within {LIM.staleHours} hours of the last refresh, warns up to {LIM.brokenHours / 24} days, fails after that.</li>
              <li><span className="font-medium text-neutral-900">Valid price:</span> positive and finite.</li>
              <li><span className="font-medium text-neutral-900">Cross-check:</span> the price (chart feed) must sit within its 52-week range (fundamentals feed), with {LIM.rangeTolerance * 100}% tolerance. Two separate endpoints have to agree.</li>
              <li><span className="font-medium text-neutral-900">Analyst targets:</span> low ≤ average ≤ high, or the consensus is flagged.</li>
              <li><span className="font-medium text-neutral-900">No impossible values:</span> market cap above zero, margins at most 100%, growth within ±{LIM.maxGrowthPct}%, forward P/E under {LIM.maxForwardPe}, volatility under {LIM.maxVolatility}%.</li>
              <li><span className="font-medium text-neutral-900">Key fields present:</span> at least 9 of 10 key figures; missing ones stay blank and are never estimated.</li>
              <li><span className="font-medium text-neutral-900">Score confidence:</span> the share of score weight backed by real data (high at 85% or more).</li>
            </ul>
            <P>
              Grades: <span className="font-medium text-emerald-800">Verified</span> (all checks pass, refreshed within{' '}
              {LIM.freshHours} hours), <span className="font-medium text-sky-800">Good</span> (live, minor notes),{' '}
              <span className="font-medium text-amber-900">Check before using</span> (a failed check or several warnings), and{' '}
              <span className="font-medium text-red-800">Unreliable</span> (placeholder or too old to trust).
            </P>
          </Section>

          <Section id="quality-checks" title="Pipeline checks">
            <P>
              Automated checks run over the stock universe and the data pipeline, including stale prices, invalid or
              out-of-range values, missing score inputs, daily price coverage, and freshness of the market regime snapshot,
              score history and filings, plus recent job failures. Each check reports ok, warning or failure so problems are
              visible instead of silently affecting scores.
            </P>
          </Section>

          <Section id="data" title="Data and limitations">
            <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
              <li>
                <span className="font-medium text-neutral-900">Source:</span> Yahoo Finance unofficial endpoints, fetched
                server-side by Supabase Edge Functions, plus SEC EDGAR for filings. The Yahoo endpoints are undocumented and
                can change or fail without notice.
              </li>
              <li>
                <span className="font-medium text-neutral-900">Refresh cadence:</span> stock prices and fundamentals
                refresh continuously in batches (each stock about every 1.5 hours), the market regime snapshot refreshes
                daily, and filings refresh daily. Prices are delayed, not real-time.
              </li>
              <li>
                <span className="font-medium text-neutral-900">Seed data:</span> rows not yet refreshed from Yahoo Finance
                are approximate placeholder values entered at setup. They are marked with a{' '}
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-800">
                  Seed
                </span>{' '}
                badge and should not be relied on.
              </li>
              <li>
                <span className="font-medium text-neutral-900">Known gaps:</span> the catalyst dimension is a proxy from pipeline count and R&amp;D intensity because there is no dated catalyst
                calendar yet; valuation inputs may be missing for unprofitable or thinly covered companies; the stock
                universe is limited.
              </li>
              <li>
                <span className="font-medium text-neutral-900">Model version:</span> {MODEL_VERSION}
              </li>
            </ul>
          </Section>

          <Section id="disclaimer" title="Disclaimer">
            <Disclaimer />
          </Section>
        </div>
      </div>
    </div>
  );
}
