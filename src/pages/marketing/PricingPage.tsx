import { Link } from 'react-router-dom';
import { Check, ChevronDown, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ComplianceNote } from '@/components/marketing/ComplianceNote';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { cn } from '@/lib/utils';

const FREE_FEATURES = [
  '3x Opportunity Score on every tracked stock',
  'Independent 0-100 risk score',
  'Bull, neutral and bear cases',
  '3x scenario calculator',
  'Catalyst calendar',
  'Named watchlists with notes and tags',
  'Score-change tracking and movers',
  'Sector heat map and price charts',
];

const PRO_FEATURES = [
  'Score and catalyst alerts',
  'Strategy backtesting',
  'Simulated portfolios',
  'SEC filings and insider activity',
  'Expanded stock coverage',
];

const FAQ = [
  {
    q: 'Is 3x Hunter really free?',
    a: 'Yes. Everything currently in the product is free while we are in beta. If we introduce paid plans later, features you use today will not disappear without notice.',
  },
  {
    q: 'When will Pro be available?',
    a: 'Pro is in development. Join the waitlist and we will email you when it opens. Joining does not commit you to anything and no payment details are collected.',
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

function FeatureList({ items, muted = false }: { items: string[]; muted?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-3 text-[14px] leading-snug text-neutral-700">
          {muted ? (
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          )}
          {f}
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
          Every feature we have shipped is free. Pro will add alerts, backtesting and deeper data when it launches.
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
            <p className="text-[13px] text-neutral-500">For deeper, ongoing research.</p>
          </div>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tracking-tight text-neutral-400">TBD</span>
          </p>
          <Button asChild size="lg" variant="outline" className="mt-6 w-full bg-background">
            <Link to="/signup?plan=pro">Join waitlist</Link>
          </Button>
          <div className="mt-8 space-y-4 border-t border-border pt-6">
            <p className="text-[13px] font-medium text-neutral-900">Everything in Free, plus:</p>
            <FeatureList items={PRO_FEATURES} muted />
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
