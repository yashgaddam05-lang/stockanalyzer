// Offline help: answers common questions from a built-in guide and points to the right page.
// Used when the AI assistant is unavailable, so help never depends on an API key.

import type { AnalysisResult } from '@/lib/analysis';
import type { StockListItem } from '@/lib/supabase';
import { EXPLAINERS } from '@/lib/explainers';

export interface HelpLink {
  label: string;
  to: string;
}

export interface HelpAnswer {
  text: string;
  links: HelpLink[];
}

interface Topic {
  /** Words or phrases that signal this topic; multi-word phrases count double. */
  keys: string[];
  text: string;
  links: HelpLink[];
}

const METHOD = (anchor: string, label = 'Full explanation'): HelpLink => ({ label, to: `/methodology#${anchor}` });

const TOPICS: Topic[] = [
  {
    keys: ['3x', 'score', 'opportunity', 'calculated', 'calculate', 'how does the score', 'what is the score', 'rating', 'dimensions', 'factors', 'weights'],
    text: EXPLAINERS.score.body,
    links: [METHOD('dimensions', 'How the 3x score works'), { label: 'Highest 3x screen', to: '/app/explore?preset=highest-3x' }],
  },
  {
    keys: ['risk', 'risky', 'volatility', 'beta', 'safe', 'safer', 'extreme', 'risk score'],
    text: EXPLAINERS.risk.body,
    links: [METHOD('risk', 'How risk is scored'), { label: 'Lower risk screen', to: '/app/explore?preset=lower-risk' }],
  },
  {
    keys: ['confidence', 'low confidence', 'missing data', 'unscored', 'n/a'],
    text: EXPLAINERS.confidence.body,
    links: [METHOD('dimensions')],
  },
  {
    keys: ['preset', 'presets', 'screen', 'screens', 'strategy', 'strategies', 'filter', 'compounders', 'undervalued', 'oversold', 'breakout', 'breakouts', 'risk-adjusted', 'start with'],
    text:
      EXPLAINERS.presets.body +
      ' New here? Start with Best risk-adjusted: strong scores without the wildest swings.',
    links: [
      { label: 'Best risk-adjusted', to: '/app/explore?preset=best-risk-adjusted' },
      { label: 'All screens in Explore', to: '/app/explore' },
      METHOD('presets', 'Screen rules'),
    ],
  },
  {
    keys: ['momentum', 'trend', 'trending'],
    text: 'Momentum is 15% of the 3x score: recent price strength and where the price sits in its 52-week range. The Highest momentum screen shows stocks with a Momentum score of 60+, strongest first.',
    links: [{ label: 'Highest momentum screen', to: '/app/explore?preset=highest-momentum' }, METHOD('dimensions')],
  },
  {
    keys: ['valuation', 'cheap', 'expensive', 'pe', 'p/e', 'analyst', 'target', 'price target'],
    text: 'Valuation Upside is 18% of the 3x score: forward P/E, price-to-sales, PEG and how far the analyst mean target sits above the price. Most undervalued shows stocks scoring 50+ on it.',
    links: [{ label: 'Most undervalued screen', to: '/app/explore?preset=most-undervalued' }, METHOD('dimensions')],
  },
  {
    keys: ['movers', 'mover', 'gainers', 'decliners', 'score change', 'changed', 'went up', 'went down', 'dropped', 'jumped'],
    text: EXPLAINERS.movers.body + ' Score changes appear after two data refreshes.',
    links: [{ label: 'New score breakouts', to: '/app/explore?preset=new-score-breakouts' }, { label: 'Dashboard', to: '/app' }],
  },
  {
    keys: ['heat map', 'heatmap', 'sector', 'sectors', 'market cap', 'grid'],
    text: EXPLAINERS.heatmap.body,
    links: [{ label: 'Dashboard', to: '/app' }, { label: 'Explore by sector', to: '/app/explore' }],
  },
  {
    keys: ['regime', 'macro', 'market', 'risk-on', 'risk-off', 'vix', 'backdrop', 'economy'],
    text: EXPLAINERS.regime.body,
    links: [{ label: 'Market regime page', to: '/app/market' }, METHOD('regime')],
  },
  {
    keys: ['backtest', 'back test', 'track record', 'performance', 'accurate', 'accuracy', 'does it work', 'reliable', 'proof'],
    text: EXPLAINERS.backtest.body,
    links: [{ label: 'Score backtest', to: '/app/backtest' }, METHOD('backtesting')],
  },
  {
    keys: ['scenario', 'scenarios', 'bull', 'bear', 'neutral', 'case', 'cases'],
    text: EXPLAINERS.cases.body,
    links: [METHOD('cases')],
  },
  {
    keys: ['history', 'chart', 'over time', 'score history'],
    text: EXPLAINERS.scoreHistory.body + ' Open any stock to see its score history and price chart.',
    links: [{ label: 'Explore stocks', to: '/app/explore' }],
  },
  {
    keys: ['add', 'add a stock', 'search', 'find', 'ticker', 'track', 'new stock', 'missing stock', 'not listed', 'etf'],
    text: 'Use the search bar at the top of any page: type a ticker or company name. Stocks we already track open instantly; any other Nasdaq, NYSE or Cboe stock can be added and is scored within seconds (up to 10 new stocks a day). ETFs are not supported yet.',
    links: [{ label: 'Explore all stocks', to: '/app/explore' }],
  },
  {
    keys: ['watchlist', 'watchlists', 'follow', 'following', 'my stocks', 'favorite', 'star', 'list', 'lists', 'remove'],
    text: 'Your dashboard is built from your watchlists. Open a stock and add it to a watchlist, or manage lists (create, rename, remove stocks) on the Watchlists page. Everything you follow shows in the Your stocks table.',
    links: [{ label: 'Watchlists', to: '/app/watchlists' }, { label: 'Dashboard', to: '/app' }],
  },
  {
    keys: ['alert', 'alerts', 'notify', 'notification', 'notifications', 'email', 'sms', 'push', 'remind'],
    text: 'Alerts fire on price, score, score change or catalyst events and show inside the app (no email, SMS or push yet). A threshold alert fires once when crossed and re-arms after it clears. Create and manage them on the Alerts page or from a stock page.',
    links: [{ label: 'Alerts', to: '/app/alerts' }, METHOD('alerts')],
  },
  {
    keys: ['portfolio', 'portfolios', 'position', 'positions', 'paper', 'simulate', 'simulated', 'holdings', 'p&l', 'profit'],
    text: 'Portfolios are simulated: enter positions to track hypothetical value and exposure. No money is invested, nothing connects to a brokerage, and fees, taxes and dividends are not modeled.',
    links: [{ label: 'Portfolios', to: '/app/portfolios' }, METHOD('portfolios')],
  },
  {
    keys: ['catalyst', 'catalysts', 'earnings', 'calendar', 'events', 'upcoming'],
    text: 'Catalysts lists upcoming events such as earnings dates. Your dashboard shows the next ones for the stocks you follow, and you can set catalyst alerts.',
    links: [{ label: 'Catalysts', to: '/app/catalysts' }],
  },
  {
    keys: ['filing', 'filings', 'sec', 'insider', 'form 4', 'edgar'],
    text: 'Stock pages show recent SEC filings and Form 4 insider trades from SEC EDGAR. They are context only and do not change the 3x score.',
    links: [METHOD('sec')],
  },
  {
    keys: ['data', 'refresh', 'updated', 'update', 'stale', 'delayed', 'real time', 'realtime', 'live', 'seed', 'source', 'yahoo', 'wrong', 'incorrect'],
    text: 'Prices and fundamentals come from Yahoo Finance and refresh in batches through the trading day; SEC filings refresh daily. Data can be delayed. A "Seed" badge marks placeholder values not yet refreshed. The Data health page shows the latest checks.',
    links: [{ label: 'Data health', to: '/app/data-health' }, METHOD('data')],
  },
  {
    keys: ['personalize', 'onboarding', 'setup', 'set up', 'customize', 'preferences', 'goal', 'start over', 'welcome', 'empty'],
    text: 'Rerun the setup any time from Personalize in the account menu: pick your goal, experience, risk level and stocks. The toggle at the top of the dashboard switches between My stocks, the S&P 500 and All tracked.',
    links: [{ label: 'Personalize', to: '/app/welcome' }, { label: 'Dashboard', to: '/app' }],
  },
  {
    keys: ['s&p', 'sp500', 's&p 500', 'index', 'all tracked', 'toggle', 'view'],
    text: 'The toggle at the top of the dashboard sets what the market sections cover: My stocks (your watchlists), the S&P 500, or All tracked stocks. Your choice is saved to your account.',
    links: [{ label: 'Dashboard', to: '/app' }],
  },
  {
    keys: ['account', 'password', 'email address', 'sign out', 'log out', 'logout', 'delete account', 'profile', 'login', 'sign in'],
    text: 'Manage your account on the Account page. Sign out is in the account menu at the top right. You sign in with a 6-digit code sent to your email, so there is no password to remember.',
    links: [{ label: 'Account', to: '/app/account' }],
  },
  {
    keys: ['price', 'pricing', 'cost', 'free', 'pay', 'subscription', 'plan', 'upgrade'],
    text: 'See the Pricing page for current plans.',
    links: [{ label: 'Pricing', to: '/pricing' }],
  },
  {
    keys: ['buy', 'sell', 'hold', 'should i', 'invest', 'recommend', 'advice', 'good stock', 'best stock', 'triple', 'will it'],
    text: 'I cannot tell you what to buy or sell. 3x Hunter is an educational research tool: a high 3x score means a stock fits the model well, not that its price will triple. Use scores, risk and scenarios as a starting point for your own research.',
    links: [{ label: 'Best risk-adjusted ideas', to: '/app/explore?preset=best-risk-adjusted' }, { label: 'Disclaimer', to: '/legal/disclaimer' }],
  },
  {
    keys: ['what is 3x hunter', 'what does this app', 'how do i use', 'how to use', 'help', 'getting started', 'get started', 'new here', 'tutorial', 'guide'],
    text: 'Quick start: 1) Search and add the stocks you care about. 2) Read each one\'s 3x score (potential, 0-100) and risk score. 3) Watch Score movers and set alerts so changes come to you. 4) Use Explore and the preset screens to find new ideas.',
    links: [{ label: 'Personalize setup', to: '/app/welcome' }, { label: 'Explore', to: '/app/explore' }, METHOD('overview', 'How scores work')],
  },
];

const STOCK_WORDS = ['this stock', 'this company', 'why', 'its score', 'this score', 'this one', 'explain'];

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9&/+\- ]+/g, ' ').replace(/\s+/g, ' ')} `;
}

function scoreTopic(q: string, topic: Topic): number {
  let total = 0;
  for (const key of topic.keys) {
    if (q.includes(` ${key} `) || (key.includes(' ') && q.includes(key))) total += key.includes(' ') ? 2 : 1;
  }
  return total;
}

/** Explains the stock on screen from its own breakdown. */
function stockAnswer(stock: StockListItem, a: AnalysisResult): HelpAnswer {
  const scored = a.dimensions.filter((d) => d.score != null).sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
  const top = scored.slice(0, 2).map((d) => `${d.label} (${Math.round(d.score ?? 0)})`);
  const weak = scored.slice(-2).reverse().map((d) => `${d.label} (${Math.round(d.score ?? 0)})`);
  const unscored = a.dimensions.filter((d) => d.score == null).map((d) => d.label);
  const parts = [
    `**${stock.ticker}** has a 3x score of **${Math.round(a.totalScore)}** (${a.rating}, ${a.confidence} confidence) and a risk score of **${Math.round(a.riskScore)}** (${a.riskLabel}).`,
    top.length ? `Strongest factors: ${top.join(', ')}.` : '',
    weak.length ? `Weakest factors: ${weak.join(', ')}.` : '',
    unscored.length ? `Not scored for lack of data: ${unscored.join(', ')} (their weight is spread over the rest).` : '',
    a.riskDrivers.length ? `Main risk drivers: ${a.riskDrivers.slice(0, 3).join('; ')}.` : '',
    'Scroll down the stock page for the full breakdown and scenarios.',
  ];
  return { text: parts.filter(Boolean).join('\n\n'), links: [METHOD('dimensions', 'How each factor is scored')] };
}

export function offlineAnswer(
  question: string,
  screen: { pathname: string; stock?: StockListItem; analysis?: AnalysisResult }
): HelpAnswer {
  const q = normalize(question);
  if (screen.stock && screen.analysis && STOCK_WORDS.some((w) => q.includes(w))) {
    return stockAnswer(screen.stock, screen.analysis);
  }

  const ranked = TOPICS.map((t) => ({ t, s: scoreTopic(q, t) }))
    .filter((r) => r.s > 0)
    .sort((x, y) => y.s - x.s);

  if (!ranked.length) {
    return {
      text: "I'm not sure about that one. Try asking about the 3x score, risk score, preset screens, adding stocks, watchlists, alerts or data freshness. The Methodology page explains everything in detail.",
      links: [METHOD('overview', 'Methodology'), { label: 'Explore', to: '/app/explore' }, { label: 'Personalize', to: '/app/welcome' }],
    };
  }

  const best = ranked[0].t;
  // Combine two topics for close matches or compound questions ("X and Y", "difference between X and Y").
  const compound = / and | vs | versus |difference|compare/.test(q);
  const related = ranked[1] && (ranked[1].s >= ranked[0].s - 1 || compound) ? ranked[1].t : null;
  const links = [...best.links];
  if (related) for (const l of related.links) if (!links.some((x) => x.to === l.to || x.label === l.label)) links.push(l);
  return { text: related ? `${best.text}\n\n${related.text}` : best.text, links: links.slice(0, 4) };
}
