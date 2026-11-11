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
  { label: '3x Opportunity Score and risk score on every tracked stock' },
  { label: 'Dashboard, Explore, preset screens and the heat map' },
  { label: 'Watchlists, simulated portfolios and brokerage import' },
  { label: 'Portfolio score, holding report and improvement tips' },
  { label: '3x Bots and the 2016 track record' },
  { label: 'Catalyst calendar, market regime and SEC filings' },
  { label: 'AI assistant: 5 questions a day' },
  { label: '1 alert' },
];

const PRO_FEATURES: Feature[] = [
  { label: 'Full 3x score breakdown: all 8 factors and their drivers', isNew: true },
  { label: 'Bull, neutral and bear scenarios for every stock', isNew: true },
  { label: 'AI research assistant: 40 questions a day', isNew: true },
  { label: 'Voice assistant', isNew: true },
  { label: 'Up to 50 alerts on score, price and catalysts', isNew: true },
];

const FAQ = [
  {
    q: 'What stays free?',
    a: 'Scores, the dashboard, Explore, watchlists, simulated portfolios, the portfolio report, bots and the track record stay free. Pro adds the full score breakdown, scenarios, more AI assistant questions, voice and more alerts.',
  },
  {
    q: 'I signed up during the beta. Do I lose anything?',
    a: 'No. Every account created before paid plans launched is a founding member and keeps Pro free until January 31, 2027. Nothing you set up is deleted.',
  },
  {
    q: 'How do I cancel?',
    a: 'Open Plan & billing in your account menu and choose Manage billing. Cancel in two clicks; you keep Pro until the end of the period you paid for. Payments are handled by Stripe.',
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
  useDocumentTitle('Pricing - 3x Hunter', '3x Hunter is free to start. Pro is $19/month or $149/year for full score breakdowns, scenarios, the AI research assistant, voice and alerts.');

  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl space-y-3 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">Pricing</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-4xl">
          Free to start. Pro when you want the full picture.
        </h1>
        <p className="text-[15px] leading-relaxed text-neutral-600">
          Scores, portfolios and the market view are free forever. Pro unlocks the full score breakdown, scenarios, the AI research assistant,
          voice and alerts.
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        <Card className="flex flex-col p-6 sm:p-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Free</h2>
            </div>
            <p className="text-[13px] text-neutral-500">Everything you need to start researching.</p>
          </div>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tracking-tight tabular-nums text-neutral-900">$0</span>
            <span className="text-[13px] text-neutral-500">/ month</span>
          </p>
          <Button asChild size="lg" variant="outline" className="mt-6 w-full">
            <Link to="/signup">Start free</Link>
          </Button>
          <div className="mt-8 border-t border-border pt-6">
            <FeatureList items={FREE_FEATURES} />
          </div>
        </Card>

        <Card className="flex flex-col border-neutral-900 p-6 shadow-md sm:p-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Pro</h2>
              <Badge>Most popular</Badge>
            </div>
            <p className="text-[13px] text-neutral-500">The full research toolkit.</p>
          </div>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tracking-tight tabular-nums text-neutral-900">$19</span>
            <span className="text-[13px] text-neutral-500">/ month</span>
          </p>
          <p className="text-[12px] text-neutral-500">or $149 / year (save 35%)</p>
          <Button asChild size="lg" className="mt-6 w-full">
            <Link to="/signup?next=%2Fapp%2Fbilling">Get Pro</Link>
          </Button>
          <div className="mt-8 space-y-4 border-t border-border pt-6">
            <p className="text-[13px] font-medium text-neutral-900">Everything in Free, plus:</p>
            <FeatureList items={PRO_FEATURES} />
            <p className="text-[12px] leading-relaxed text-neutral-500">Cancel anytime. Secure checkout by Stripe.</p>
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
