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
  { label: 'AI assistant: 100 credits a month (Quick, Standard and Researched answers)' },
  { label: '1 alert' },
];

const PRO_FEATURES: Feature[] = [
  { label: 'Full 3x score breakdown: all 8 factors and their drivers' },
  { label: 'Bull, neutral and bear scenarios for every stock' },
  { label: 'AI research assistant: 600 credits a month, 6x Free', isNew: true },
  { label: 'Deep dive answers at full analyst depth', isNew: true },
  { label: 'Voice assistant' },
  { label: 'Up to 50 alerts on score, price and catalysts' },
  { label: 'Top up anytime: 250 credits for $10' },
];

const PLUS_FEATURES: Feature[] = [
  { label: '1,600 AI credits a month, 16x Free', isNew: true },
  { label: 'Full research reports, the most thorough answer', isNew: true },
  { label: 'Room for daily deep dives on your whole portfolio' },
  { label: 'Top up anytime: 250 credits for $10' },
];

const SIZES = [
  { name: 'Quick', credits: 1, what: 'App help, definitions, quick concepts' },
  { name: 'Standard', credits: 3, what: "Focused answers from 3x Hunter data and today's shared research" },
  { name: 'Researched', credits: 12, what: 'Live research on the stocks you ask about, full structure' },
  { name: 'Deep dive', credits: 40, what: 'Analyst depth: scenarios, odds, dollar outcomes, ideas (Pro)' },
  { name: 'Full report', credits: 100, what: 'Everything, cross-checked, for saving or printing (Pro+)' },
];

const FAQ = [
  {
    q: 'What stays free?',
    a: 'Scores, the dashboard, Explore, watchlists, simulated portfolios, the portfolio report, bots and the track record stay free. Pro adds the full score breakdown, scenarios, 6x the AI research credits, deep dives, voice and more alerts. Pro+ adds 16x the credits and full reports.',
  },
  {
    q: 'How do AI credits work?',
    a: 'Each answer uses credits by its size: Quick 1, Standard 3, Researched 12, Deep dive 40, Full report 100. Auto picks the right size for each question, and you can always choose. Monthly credits refresh on the 1st; credits from packs never expire.',
  },
  {
    q: 'Why do some answers come back so fast?',
    a: 'Our research desk researches the most-followed stocks and the whole market before the open every trading day, and the first live research on any stock is shared with everyone who asks next. You get current, sourced data without waiting.',
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
  useDocumentTitle('Pricing - 3x Hunter', '3x Hunter is free to start. Pro is $19/month and Pro+ is $49/month for full score breakdowns, scenarios, the AI research assistant, voice and alerts.');

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

      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
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

        <Card className="flex flex-col p-6 sm:p-8">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Pro+</h2>
            <p className="text-[13px] text-neutral-500">For daily, deep AI research.</p>
          </div>
          <p className="mt-6 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tracking-tight tabular-nums text-neutral-900">$49</span>
            <span className="text-[13px] text-neutral-500">/ month</span>
          </p>
          <p className="text-[12px] text-neutral-500">or $399 / year (save 32%)</p>
          <Button asChild size="lg" variant="outline" className="mt-6 w-full">
            <Link to="/signup?next=%2Fapp%2Fbilling">Get Pro+</Link>
          </Button>
          <div className="mt-8 space-y-4 border-t border-border pt-6">
            <p className="text-[13px] font-medium text-neutral-900">Everything in Pro, plus:</p>
            <FeatureList items={PLUS_FEATURES} />
          </div>
        </Card>
      </div>

      <section aria-labelledby="sizes-heading" className="mx-auto max-w-3xl space-y-4">
        <h2 id="sizes-heading" className="text-xl font-semibold tracking-tight text-neutral-900">
          Answer sizes
        </h2>
        <p className="text-[14px] text-neutral-600">
          Every answer runs on top models with live, sourced data. Bigger answers go deeper and use more credits. Auto picks the right size for each
          question.
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Credits</th>
                <th className="px-4 py-2 font-medium">What you get</th>
              </tr>
            </thead>
            <tbody>
              {SIZES.map((x) => (
                <tr key={x.name} className="border-t border-border">
                  <td className="px-4 py-2 font-medium text-neutral-900">{x.name}</td>
                  <td className="px-4 py-2 tabular-nums">{x.credits}</td>
                  <td className="px-4 py-2 text-neutral-600">{x.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
