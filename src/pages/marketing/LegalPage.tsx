import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { cn } from '@/lib/utils';

export type LegalDoc = 'disclaimer' | 'terms' | 'privacy';

const CONTACT_EMAIL = 'legal@example.com';
const LAST_UPDATED = 'October 16, 2026';

interface Section {
  heading: string;
  body: ReactNode[];
}

interface DocContent {
  title: string;
  summary: string;
  sections: Section[];
}

const DOCS: Record<LegalDoc, DocContent> = {
  disclaimer: {
    title: 'Disclaimer',
    summary: '3x Hunter is an educational research tool. Nothing on this site is investment advice.',
    sections: [
      {
        heading: 'Not investment advice',
        body: [
          'The content, scores, rankings, cases and calculations provided by 3x Hunter are for informational and educational purposes only. They are not investment, financial, legal, tax or accounting advice, and they are not an offer or solicitation to buy or sell any security.',
        ],
      },
      {
        heading: 'No fiduciary relationship',
        body: [
          '3x Hunter and its operators are not a registered investment adviser, broker-dealer or financial planner. Using the service does not create an advisory, fiduciary or client relationship of any kind.',
        ],
      },
      {
        heading: 'Model outputs may be wrong',
        body: [
          'The 3x Opportunity Score, risk score and scenario outputs are produced by a published, rules-based model. They are hypothetical, may be wrong, and are not forecasts or guarantees of any result. A high score does not mean a stock will rise.',
        ],
      },
      {
        heading: 'Data may be delayed or inaccurate',
        body: [
          'Market data is sourced from third parties, including Yahoo Finance, and may be delayed, incomplete or inaccurate. We do not guarantee the accuracy, timeliness or completeness of any data shown.',
        ],
      },
      {
        heading: 'Your responsibility',
        body: [
          'Investing involves risk, including the possible loss of principal. Past performance does not predict future results. Do your own research and consult a licensed financial professional before making any investment decision. You use 3x Hunter at your own risk.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of use',
    summary: 'The rules for using 3x Hunter. By creating an account or using the site you agree to these terms.',
    sections: [
      {
        heading: 'The service',
        body: [
          '3x Hunter provides educational stock research tools, including scores, watchlists, catalyst tracking, scenario calculators, in-app alerts, backtests, simulated portfolios and SEC filings data. Features may change, be added or be removed at any time, especially while the product is in beta.',
        ],
      },
      {
        heading: 'Accounts',
        body: [
          'You need an account to use parts of the service. Accounts are managed through Supabase Auth. You are responsible for keeping your password secure and for activity under your account. You must provide a valid email address and be old enough to form a binding contract where you live.',
        ],
      },
      {
        heading: 'Acceptable use',
        body: [
          'Do not misuse the service: no scraping or bulk downloading, no attempts to break or bypass security, no reselling or redistributing data, and no use that violates applicable law or the terms of our data providers.',
        ],
      },
      {
        heading: 'No advice and no warranty',
        body: [
          'The service is provided "as is" and "as available" without warranties of any kind. Nothing in the service is investment advice; see the Disclaimer for details.',
          'Simulated portfolios and backtests are hypothetical. No money is invested and no orders are placed. Backtest results are based on limited stored history and do not predict future returns.',
        ],
      },
      {
        heading: 'Limitation of liability',
        body: [
          'To the maximum extent permitted by law, 3x Hunter and its operators are not liable for any investment losses or for indirect, incidental or consequential damages arising from your use of the service.',
        ],
      },
      {
        heading: 'Termination and changes',
        body: [
          'You may stop using the service and request account deletion at any time. We may suspend accounts that violate these terms. We may update these terms; continued use after an update means you accept the revised terms.',
        ],
      },
      {
        heading: 'Contact',
        body: [`Questions about these terms: ${CONTACT_EMAIL}.`],
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    summary: 'What we collect, why, and what we never do with it.',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Account information: your email address and a securely hashed password, handled by Supabase Auth. Your email is used for authentication and essential account messages (such as confirmation and password reset) only.',
          'Content you create: watchlists, notes, tags and catalyst entries, stored so the service can show them back to you.',
          'Alerts and simulated portfolios: the alert rules you set, the in-app alert notifications they generate, and the positions you enter in simulated portfolios. These are stored per account, visible only to you, and deleted when your account is deleted.',
          'Basic technical data: standard server logs (such as IP address and request time) kept by our hosting providers for security and reliability.',
        ],
      },
      {
        heading: 'What we do not do',
        body: [
          'We do not sell your personal data. We do not share it with advertisers. We do not use your watchlists or notes to trade or to build products for third parties.',
        ],
      },
      {
        heading: 'Service providers',
        body: [
          'We rely on a small number of processors to run the service, including Supabase (authentication and database) and Vercel (hosting). They process data on our behalf under their own security and privacy commitments.',
        ],
      },
      {
        heading: 'Cookies and local storage',
        body: [
          'We use browser storage to keep you signed in. We do not use third-party advertising cookies.',
        ],
      },
      {
        heading: 'Retention and deletion',
        body: [
          'We keep your data while your account is active. You can request deletion of your account at any time by contacting us. Deleting your account also deletes its watchlists, notes, alerts, alert notifications and simulated portfolio positions.',
        ],
      },
      {
        heading: 'Contact',
        body: [`Privacy questions or deletion requests: ${CONTACT_EMAIL}.`],
      },
    ],
  },
};

const ORDER: LegalDoc[] = ['disclaimer', 'terms', 'privacy'];

export default function LegalPage({ doc }: { doc: LegalDoc }) {
  const content = DOCS[doc];
  useDocumentTitle(`${content.title} - 3x Hunter`);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Legal documents" className="mb-8 lg:mb-0">
          <p className="mb-3 hidden text-[12px] font-semibold uppercase tracking-wider text-neutral-500 lg:block">Legal</p>
          <ul className="flex gap-1 overflow-x-auto border-b border-border lg:flex-col lg:border-b-0">
            {ORDER.map((d) => (
              <li key={d} className="shrink-0">
                <NavLink
                  to={`/legal/${d}`}
                  className={({ isActive }) =>
                    cn(
                      'block whitespace-nowrap px-3 py-2 text-[13px] font-medium transition-colors',
                      'border-b-2 -mb-px lg:mb-0 lg:rounded-md lg:border-b-0',
                      isActive
                        ? 'border-neutral-900 text-neutral-900 lg:bg-neutral-100'
                        : 'border-transparent text-neutral-600 hover:text-neutral-900 lg:hover:bg-neutral-50'
                    )
                  }
                >
                  {DOCS[d].title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <article className="max-w-3xl space-y-8">
          <div
            role="note"
            className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-semibold">Draft — review with counsel before launch.</span> This placeholder text is
              not final legal language.
            </p>
          </div>

          <header className="space-y-2">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-neutral-900">{content.title}</h1>
            <p className="text-[15px] leading-relaxed text-neutral-600">{content.summary}</p>
            <p className="text-[12px] text-neutral-500">Last updated {LAST_UPDATED}</p>
          </header>

          <div className="space-y-8">
            {content.sections.map((s) => (
              <section key={s.heading} className="space-y-3">
                <h2 className="text-[17px] font-semibold tracking-tight text-neutral-900">{s.heading}</h2>
                {s.body.map((p, i) => (
                  <p key={i} className="text-[14px] leading-relaxed text-neutral-700">
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
