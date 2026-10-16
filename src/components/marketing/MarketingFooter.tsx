import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';

const COLUMNS: { title: string; links: { to: string; label: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { to: '/#features', label: 'Features' },
      { to: '/#how-it-works', label: 'How it works' },
      { to: '/methodology', label: 'Methodology' },
      { to: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/signup', label: 'Create account' },
      { to: '/login', label: 'Sign in' },
      { to: '/app', label: 'Open app' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/legal/disclaimer', label: 'Disclaimer' },
      { to: '/legal/terms', label: 'Terms of use' },
      { to: '/legal/privacy', label: 'Privacy policy' },
    ],
  },
];

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900">
                <TrendingUp className="h-3.5 w-3.5 text-white" strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span className="text-[14px] font-semibold tracking-tight text-neutral-900">3x Hunter</span>
            </div>
            <p className="max-w-xs text-[13px] leading-relaxed text-neutral-600">
              Transparent, rules-based stock research. Every score shows its inputs.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="space-y-3">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">{col.title}</p>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-[13px] text-neutral-700 transition-colors hover:text-neutral-900">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 space-y-2 border-t border-border pt-6">
          <p className="text-[12px] font-medium text-neutral-800">
            Educational research tool, not investment advice. Scores are model outputs and may be wrong.
          </p>
          <p className="text-[12px] leading-relaxed text-neutral-500">
            Market data sourced from Yahoo Finance and may be delayed, incomplete or inaccurate. 3x Hunter is not
            affiliated with Yahoo.
          </p>
          <p className="pt-2 text-[12px] text-neutral-500">&copy; {year} 3x Hunter. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
