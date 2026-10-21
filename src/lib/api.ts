import type {
  AlertEventsResponse,
  AlertRule,
  AlertRuleInput,
  AlertRulePatch,
  AlertsResponse,
  BacktestHorizon,
  BacktestResponse,
  DataHealthResponse,
  FilingsResponse,
  MarketRegimeResponse,
  Portfolio,
  PortfoliosResponse,
  Position,
  PositionInput,
  PositionPatch,
  RegimeLabel,
  Catalyst,
  CatalystInput,
  CatalystsResponse,
  CatalystType,
  PriceHistoryResponse,
  PriceRange,
  ScoreHistoryResponse,
  StockListItem,
  Watchlist,
  WatchlistEntry,
  WatchlistItem,
  WatchlistsResponse,
  DashboardScope,
  Stock,
  StockSearchResult,
  UserPreferences,
  InvestGoal,
  Experience,
  RiskAppetite,
} from '@/lib/supabase';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type AuthTokenProvider = () => Promise<string | null>;

let authTokenProvider: AuthTokenProvider | null = null;

/** Registers (or clears with null) the source of the bearer token attached to every API request. */
export function setAuthTokenProvider(fn: AuthTokenProvider | null): void {
  authTokenProvider = fn;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  if (!authTokenProvider) return {};
  try {
    const token = await authTokenProvider();
    return typeof token === 'string' && token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // Provider failure: proceed anonymously.
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeader = await getAuthHeader();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeader,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = 'Request failed.';
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && payload.error) {
        message = payload.error;
      }
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function getStocks(): Promise<StockListItem[]> {
  return request<StockListItem[]>('/api/stocks');
}

export function getWatchlist(): Promise<WatchlistEntry[]> {
  return request<WatchlistEntry[]>('/api/watchlist');
}

export function addToWatchlist(ticker: string): Promise<{ ticker: string }> {
  return request<{ ticker: string }>('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ ticker }),
  });
}

export function removeFromWatchlist(ticker: string): Promise<void> {
  return request<void>(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, {
    method: 'DELETE',
  });
}

export type RefreshResponse = {
  updated?: number;
  total?: number;
  regime?: { as_of: string; regime_label: RegimeLabel } | null;
  modelVersion?: string;
};

export function refreshStocks(): Promise<RefreshResponse> {
  return request<RefreshResponse>('/api/refresh', { method: 'POST' });
}

export function getScoreHistory(ticker: string, limit?: number): Promise<ScoreHistoryResponse> {
  const params = new URLSearchParams({ ticker });
  if (limit !== undefined) params.set('limit', String(limit));
  return request<ScoreHistoryResponse>(`/api/score-history?${params.toString()}`);
}

export function getWatchlists(): Promise<WatchlistsResponse> {
  return request<WatchlistsResponse>('/api/watchlists');
}

export function createWatchlist(name: string): Promise<Watchlist> {
  return request<Watchlist>('/api/watchlists', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function renameWatchlist(id: string, name: string): Promise<Watchlist> {
  return request<Watchlist>(`/api/watchlists?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deleteWatchlist(id: string): Promise<void> {
  return request<void>(`/api/watchlists?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function addWatchlistItem(input: {
  watchlist_id: string;
  ticker: string;
  notes?: string;
  tags?: string[];
}): Promise<WatchlistItem> {
  return request<WatchlistItem>('/api/watchlist-items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateWatchlistItem(id: string, patch: { notes?: string; tags?: string[] }): Promise<WatchlistItem> {
  return request<WatchlistItem>(`/api/watchlist-items?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function removeWatchlistItem(id: string): Promise<void> {
  return request<void>(`/api/watchlist-items?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getPriceHistory(ticker: string, range: PriceRange): Promise<PriceHistoryResponse> {
  const params = new URLSearchParams({ ticker, range });
  return request<PriceHistoryResponse>(`/api/price-history?${params.toString()}`);
}

export function getCatalysts(params?: {
  ticker?: string;
  from?: string;
  to?: string;
  type?: CatalystType;
  limit?: number;
}): Promise<CatalystsResponse> {
  const search = new URLSearchParams();
  if (params?.ticker !== undefined) search.set('ticker', params.ticker);
  if (params?.from !== undefined) search.set('from', params.from);
  if (params?.to !== undefined) search.set('to', params.to);
  if (params?.type !== undefined) search.set('type', params.type);
  if (params?.limit !== undefined) search.set('limit', String(params.limit));
  const query = search.toString();
  return request<CatalystsResponse>(query ? `/api/catalysts?${query}` : '/api/catalysts');
}

export function createCatalyst(input: CatalystInput): Promise<Catalyst> {
  return request<Catalyst>('/api/catalysts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteCatalyst(id: string): Promise<void> {
  return request<void>(`/api/catalysts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getMarketRegime(days?: number): Promise<MarketRegimeResponse> {
  const params = new URLSearchParams();
  if (days !== undefined) params.set('days', String(days));
  const query = params.toString();
  return request<MarketRegimeResponse>(query ? `/api/market-regime?${query}` : '/api/market-regime');
}

export function getAlerts(): Promise<AlertsResponse> {
  return request<AlertsResponse>('/api/alerts');
}

export function createAlert(input: AlertRuleInput): Promise<AlertRule> {
  return request<AlertRule>('/api/alerts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAlert(id: string, patch: AlertRulePatch): Promise<AlertRule> {
  return request<AlertRule>(`/api/alerts?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteAlert(id: string): Promise<void> {
  return request<void>(`/api/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getAlertEvents(opts?: { unreadOnly?: boolean; limit?: number }): Promise<AlertEventsResponse> {
  const params = new URLSearchParams();
  if (opts?.unreadOnly) params.set('unread', '1');
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  const query = params.toString();
  return request<AlertEventsResponse>(query ? `/api/alert-events?${query}` : '/api/alert-events');
}

export function markAlertEventsRead(target: string[] | 'all'): Promise<{ updated: number }> {
  return request<{ updated: number }>('/api/alert-events', {
    method: 'PATCH',
    body: JSON.stringify(target === 'all' ? { all: true } : { ids: target }),
  });
}

export function getPortfolios(): Promise<PortfoliosResponse> {
  return request<PortfoliosResponse>('/api/portfolios');
}

export function createPortfolio(name: string): Promise<Portfolio> {
  return request<Portfolio>('/api/portfolios', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function renamePortfolio(id: string, name: string): Promise<Portfolio> {
  return request<Portfolio>(`/api/portfolios?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deletePortfolio(id: string): Promise<void> {
  return request<void>(`/api/portfolios?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function addPosition(input: PositionInput): Promise<Position> {
  return request<Position>('/api/positions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updatePosition(id: string, patch: PositionPatch): Promise<Position> {
  return request<Position>(`/api/positions?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deletePosition(id: string): Promise<void> {
  return request<void>(`/api/positions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getFilings(ticker: string): Promise<FilingsResponse> {
  const params = new URLSearchParams({ ticker });
  return request<FilingsResponse>(`/api/filings?${params.toString()}`);
}

export function getBacktest(params: { horizon: BacktestHorizon; modelVersion?: string }): Promise<BacktestResponse> {
  const search = new URLSearchParams({ horizon: String(params.horizon) });
  if (params.modelVersion !== undefined) search.set('model_version', params.modelVersion);
  return request<BacktestResponse>(`/api/backtest?${search.toString()}`);
}

export function getDataHealth(): Promise<DataHealthResponse> {
  return request<DataHealthResponse>('/api/data-health');
}

// ---------- personalization ----------

export function getPreferences(): Promise<UserPreferences> {
  return request<UserPreferences>('/api/preferences');
}

export function savePreferences(input: {
  dashboard_scope?: DashboardScope;
  sectors?: string[];
  goal?: InvestGoal | null;
  experience?: Experience | null;
  risk?: RiskAppetite | null;
  onboarded?: boolean;
}): Promise<UserPreferences> {
  return request<UserPreferences>('/api/preferences', { method: 'PUT', body: JSON.stringify(input) });
}

export function searchStocks(query: string): Promise<{ query: string; results: StockSearchResult[] }> {
  return request(`/api/stock-search?q=${encodeURIComponent(query)}`);
}

/** Starts tracking any US stock/ETF (fetched and scored immediately). Requires sign-in. */
export function addStock(ticker: string): Promise<{ added: boolean; stock: Stock }> {
  return request('/api/stock-add', { method: 'POST', body: JSON.stringify({ ticker }) });
}
