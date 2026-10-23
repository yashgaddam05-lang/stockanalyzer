// Single serverless entry for all lightweight API routes. Vercel Hobby caps a deployment
// at 12 functions, so /api/<route> is rewritten here (vercel.json) and dispatched by name.
// refresh.ts and cron.ts stay separate functions for their longer maxDuration and cron hooks.
import type { ApiRequest, ApiResponse } from './_supabase.js';
import alertEvents from './_routes/alert-events.js';
import alerts from './_routes/alerts.js';
import backtest from './_routes/backtest.js';
import catalysts from './_routes/catalysts.js';
import dataHealth from './_routes/data-health.js';
import filings from './_routes/filings.js';
import marketRegime from './_routes/market-regime.js';
import portfolioImport from './_routes/portfolio-import.js';
import portfolios from './_routes/portfolios.js';
import positions from './_routes/positions.js';
import preferences from './_routes/preferences.js';
import priceHistory from './_routes/price-history.js';
import scoreHistory from './_routes/score-history.js';
import stockAdd from './_routes/stock-add.js';
import stockSearch from './_routes/stock-search.js';
import stocks from './_routes/stocks.js';
import watchlistItems from './_routes/watchlist-items.js';
import watchlist from './_routes/watchlist.js';
import watchlists from './_routes/watchlists.js';

type Handler = (request: ApiRequest, response: ApiResponse) => unknown;

const ROUTES: Record<string, Handler> = {
  'alert-events': alertEvents,
  'alerts': alerts,
  // Loaded on demand so the AI SDK never adds to cold starts of the other routes.
  'assistant': async (req, res) => (await import('./_routes/assistant.js')).default(req, res),
  'backtest': backtest,
  'catalysts': catalysts,
  'data-health': dataHealth,
  'filings': filings,
  'market-regime': marketRegime,
  'portfolio-import': portfolioImport,
  'portfolios': portfolios,
  'positions': positions,
  'preferences': preferences,
  'price-history': priceHistory,
  'score-history': scoreHistory,
  'stock-add': stockAdd,
  'stock-search': stockSearch,
  'stocks': stocks,
  'watchlist-items': watchlistItems,
  'watchlist': watchlist,
  'watchlists': watchlists,
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const raw = request.query?.__route;
  const name = Array.isArray(raw) ? raw[0] : raw;
  const route = name ? ROUTES[name] : undefined;
  if (!route) {
    response.status(404).json({ error: 'Not found.' });
    return;
  }
  if (request.query) delete request.query.__route;
  await route(request, response);
}
