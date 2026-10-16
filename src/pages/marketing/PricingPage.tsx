import { Link } from 'react-router-dom';
import { Check, ChevronDown, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ComplianceNote } from '@/components/marketing/ComplianceNote';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { cn } from '@/lib/utils';

type Feature = { label: string; isNew?: boolean };

const FREE_FEATURES: Feature[] = [
  { label: '3x Opportunity Score on every tracked stock' },
  { label: 'Independent 0-100 risk score' },
  { label: 'Bull, neutral and bear cases' },
  { label: '3x scenario calculator' },
  { label: 'Catalyst calendar' },
  { label: 'Named watchlists with notes and tags' },
  { label: 'Score-change tracking and movers' },
  { label: 'Sector heat map and price charts' },
  { label: 'In-app score and catalyst alerts', isNew: true },
  { label: 'Strategy backtesting on stored score history', isNew: true },
  { label: 'Simulated (hypothetical) portfolios', isNew: true },
  { label: 'SEC filings and insider activity (Form 4)', isNew: true },
  { label: 'Market regime dashboard and regime-fit scoring', isNew: true },
];

const PRO_FEATURES: Feature[] = [
  { label: 'Expanded stock coverage' },
  { label: 'Longer score and price history' },
  { label: 'Deeper fundamental and filings data' },
];

const FAQ = [
  {
    q: 'Is 3x Hunter really free?',
    a: 'Yes. Everything currently in the product is free while we are in beta. If we introduce paid plans later, features you use today will not disappear without notice.',
  },
  {
    q: 'When will Pro be available?',
    a: 'There is no date yet. Alerts, backtesting, simulated portfolios, SEC filings and market regime are all free during the beta. Pro is planned for deeper data and broader coverage later. Join the waitlist and we will email you if it opens. Joining does not commit you to anything and no payment details are collected.',
  },
  {
    q: 'Is this investment advice?',
    a: '3x Hunter is an educational research tool. Scores are hypothetical outputs of a published model, not recommendations to buy, sell or hold any security.',
  },
  {
    q: 'Where does the data come from?',
    a: 'Prices and fundamentals come from Yahoo Finance and may be delayed or incomplete. When an input is missing it is left unscored rather than estimated.',
  },
  {
    q: 'Can I delete my account?',
    a: 'Yes. Contact us and we will delete your account and associated watchlists. See the privacy policy for details.',
  },
];

function FeatureList({ items, muted = false }: { items: Feature[]; muted?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={f.label} className="flex items-start gap-3 text-[14px] leading-snug text-neutral-700">
          {muted ? (
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          )}
          <span>
            {f.label}
            {f.isNew && (
              <span className="ml-2 rounded border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-800">
                New
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  useDocumentTitle('Pricing - 3x Hunter');

  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl space-y-3 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">Pricing</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-4xl">
          Free while in beta
        </h1>
        <p className="text-[15px] leading-relaxed text-neutral-600">
          Every feature we have shipped is free, including alerts, backtesting, simulated portfolios, SEC filings and market regime. A future Pro plan may add deeper data and broader coverage.
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        <Card className="flex flex-col border-neutral-900 p-6 sm:p-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Free</h2>
              <Badge>Beta</Badge>
            </div>
            <p className="text-[13px] text-neutral-500">Everything currently built.</p>
          </div>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tracking-tight tabular-nums text-neutral-900">$0</span>
            <span className="text-[13px] text-neutral-500">/ month</span>
          </p>
          <Button asChild size="lg" className="mt-6 w-full">
            <Link to="/signup">Get started</Link>
          </Button>
          <div className="mt-8 border-t border-border pt-6">
            <FeatureList items={FREE_FEATURES} />
          </div>
        </Card>

        <Card className="flex flex-col bg-neutral-50 p-6 sm:p-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Pro</h2>
              <Badge variant="outline">Coming soon</Badge>
            </div>
            <p className="text-[13px] text-neutral-500">Future plan for deeper data. Not available yet.</p>
          </div>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tracking-tight text-neutral-400">TBD</span>
          </p>
          <Button asChild size="lg" variant="outline" className="mt-6 w-full bg-background">
            <Link to="/signup?plan=pro">Join waitlist</Link>
          </Button>
          <div className="mt-8 space-y-4 border-t border-border pt-6">
            <p className="text-[13px] font-medium text-neutral-900">Everything in Free, plus ideas we are exploring:</p>
            <FeatureList items={PRO_FEATURES} muted />
            <p className="text-[12px] leading-relaxed text-neutral-500">
              Join the waitlist to hear if Pro opens. No payment details are collected.
            </p>
          </div>
        </Card>
      </div>

      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl space-y-6">
        <h2 id="faq-heading" className="text-xl font-semibold tracking-tight text-neutral-900">
          Frequently asked questions
        </h2>
        <div className="divide-y divide-border rounded-xl border border-border">
          {FAQ.map((item) => (
            <details key={item.q} className="group">
              <summary
                className={cn(
                  'flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[14px] font-medium text-neutral-900',
                  'rounded-xl hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden'
                )}
              >
                {item.q}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-5 pb-5 text-[14px] leading-relaxed text-neutral-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <ComplianceNote className="mx-auto max-w-3xl" />
    </div>
  );
}
