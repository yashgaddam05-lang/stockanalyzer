// One source of truth for navigation. PUBLIC pages are open to everyone (marketing site).
// PRIVATE pages live under /app and require sign-in; they are only ever shown to signed-in users.
export type NavLinkItem = { to: string; label: string; desc?: string; end?: boolean };
export type NavColumn = { title: string; items: NavLinkItem[] };

export const PUBLIC_MARKETS: NavColumn[] = [
  {
    title: 'Markets',
    items: [
      { to: '/news', label: 'News desk', desc: 'Live market headlines' },
      { to: '/#markets', label: 'Right now', desc: 'Top stories on the home page' },
    ],
  },
  {
    title: 'Research',
    items: [
      { to: '/methodology', label: 'Methodology', desc: 'How every score is built' },
      { to: '/track-record', label: 'Track record', desc: 'The score since 2016' },
    ],
  },
  {
    title: 'Product',
    items: [
      { to: '/#features', label: 'Features', desc: 'Everything in 3x Hunter' },
      { to: '/#how-it-works', label: 'How it works', desc: 'From tickers to a short list' },
      { to: '/pricing', label: 'Pricing', desc: 'Free, Pro and Pro Plus' },
    ],
  },
];

export const PRIVATE_TOP: NavLinkItem[] = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/explore', label: 'Explore' },
  { to: '/app/news', label: 'News' },
  { to: '/app/watchlists', label: 'Watchlists' },
  { to: '/app/portfolios', label: 'Portfolios' },
  { to: '/app/alerts', label: 'Alerts' },
];

export const PRIVATE_COLUMNS: NavColumn[] = [
  {
    title: 'Research tools',
    items: [
      { to: '/app/explore', label: 'Explore', desc: 'Screen every scored stock' },
      { to: '/app/catalysts', label: 'Catalysts', desc: 'Earnings and events calendar' },
      { to: '/app/market', label: 'Market regime', desc: 'Risk-on or risk-off today' },
      { to: '/app/backtest', label: 'Backtest', desc: 'Test the score on history' },
      { to: '/app/track-record', label: 'Track record', desc: 'Score vs the S&P 500' },
      { to: '/app/data-health', label: 'Data health', desc: 'How fresh the data is' },
    ],
  },
  {
    title: 'Your money',
    items: [
      { to: '/app/watchlists', label: 'Watchlists', desc: 'Your saved ideas' },
      { to: '/app/portfolios', label: 'Portfolios', desc: 'Holdings, score and risk' },
      { to: '/app/paper', label: 'Paper accounts', desc: 'Practice with fake money' },
      { to: '/app/bots', label: '3x Bots', desc: 'Rule-based strategies' },
      { to: '/app/alerts', label: 'Alerts', desc: 'Price, score and catalyst' },
    ],
  },
  {
    title: 'Plan & account',
    items: [
      { to: '/app/goal', label: '3x Goal Planner', desc: 'What it takes to triple' },
      { to: '/app/temperament', label: 'Investor temperament', desc: 'Your risk profile' },
      { to: '/app/account', label: 'Account settings' },
      { to: '/app/billing', label: 'Plan & billing' },
    ],
  },
];

export const ALL_PRIVATE: NavLinkItem[] = [
  ...PRIVATE_TOP,
  ...PRIVATE_COLUMNS.flatMap((c) => c.items).filter((i) => !PRIVATE_TOP.some((t) => t.to === i.to)),
];
