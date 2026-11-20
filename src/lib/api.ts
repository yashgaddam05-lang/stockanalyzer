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
import type { SmartMoneyResponse } from '@/lib/smart-money';

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

type AuthRefresher = () => Promise<string | null>;
let authRefresher: AuthRefresher | null = null;

/** Registers (or clears) how to get a fresh token after the API rejects one with 401. */
export function setAuthRefresher(fn: AuthRefresher | null): void {
  authRefresher = fn;
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
  const send = (authHeader: Record<string, string>) =>
    fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeader,
        ...init?.headers,
      },
    });
  let response = await send(await getAuthHeader());
  // Expired or missing token: refresh once and retry.
  if (response.status === 401 && authRefresher) {
    const fresh = await authRefresher().catch(() => null);
    if (fresh) response = await send({ Authorization: `Bearer ${fresh}` });
  }

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

/**
 * Public stock universe. Sent without the auth header so the CDN can serve its cached copy;
 * `fresh` bypasses that cache (used right after a manual refresh).
 */
export async function getStocks(fresh = false): Promise<StockListItem[]> {
  const response = await fetch(fresh ? `/api/stocks?t=${Date.now()}` : '/api/stocks');
  if (!response.ok) throw new ApiError('Could not load stock data.', response.status);
  return response.json() as Promise<StockListItem[]>;
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

export interface ImportPositionsResult {
  imported: number;
  skipped: { row: number; ticker: string; reason: string }[];
  positions: Position[];
}

/** Bulk-adds simulated positions parsed from a brokerage export (see src/lib/portfolio-import). */
export function importPositions(
  portfolioId: string,
  positions: { ticker: string; shares: number; cost_basis: number; opened_at?: string }[]
): Promise<ImportPositionsResult> {
  return request<ImportPositionsResult>('/api/portfolio-import', {
    method: 'POST',
    body: JSON.stringify({ portfolio_id: portfolioId, positions }),
  });
}

export function deletePosition(id: string): Promise<void> {
  return request<void>(`/api/positions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getFilings(ticker: string): Promise<FilingsResponse> {
  const params = new URLSearchParams({ ticker });
  return request<FilingsResponse>(`/api/filings?${params.toString()}`);
}

export function getSmartMoney(ticker: string): Promise<SmartMoneyResponse> {
  const params = new URLSearchParams({ ticker });
  return request<SmartMoneyResponse>(`/api/smart-money?${params.toString()}`);
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
  temperament?: { score: number; bot: string; tolerance: number; answers: Record<string, number> } | null;
  weekly_email?: boolean;
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

// ---------- help assistant ----------

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantSource {
  url: string;
  title: string;
}

export interface AssistantStreamResult {
  remaining: number | null;
  sessionId: string | null;
  /** Web pages the live search actually returned for this answer. */
  sources: AssistantSource[];
  /** False when the stream ended without a "done" event (cut off by a timeout or the network). */
  completed: boolean;
  /** True when the answer hit the length limit even after the server continued it. */
  truncated: boolean;
  /** Answer size the server used (auto picks one) and its label. */
  size: string | null;
  label: string | null;
  /** AI credits left after this answer, and what it cost. */
  credits: { monthly_left: number; pack_left: number; charged: number } | null;
}

/**
 * Streams an assistant reply; calls onText for each chunk and onWorking while the model searches or thinks.
 * Resolves with the remaining daily message count, the chat session id to send with the next message (the server
 * summarizes the session into the account once it ends), the answer's sources and whether it finished.
 */
export async function streamAssistant(
  input: { messages: AssistantTurn[]; context?: string; session_id?: string | null; size?: string },
  onText: (text: string) => void,
  signal?: AbortSignal,
  onWorking?: (seconds: number, step?: string) => void
): Promise<AssistantStreamResult> {
  const response = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok || !response.body) {
    let message = 'The assistant could not answer. Please try again.';
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(message, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const result: AssistantStreamResult = { remaining: null, sessionId: null, sources: [], completed: false, truncated: false, size: null, label: null, credits: null };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data) as {
        text?: string;
        remaining?: number;
        session_id?: string | null;
        error?: string;
        seconds?: number;
        sources?: AssistantSource[];
        truncated?: boolean;
        step?: string;
        size?: string;
        label?: string;
        credits?: { monthly_left: number; pack_left: number; charged: number };
      };
      if (event === 'delta' && payload.text) onText(payload.text);
      else if (event === 'status') onWorking?.(payload.seconds ?? 0, payload.step);
      else if (event === 'sources' && Array.isArray(payload.sources)) result.sources = payload.sources.filter((x) => /^https?:\/\//.test(x?.url ?? ''));
      else if (event === 'meta') {
        if (typeof payload.remaining === 'number') result.remaining = payload.remaining;
        if (typeof payload.session_id === 'string') result.sessionId = payload.session_id;
        if (payload.size) result.size = payload.size;
        if (payload.label) result.label = payload.label;
        if (payload.credits) result.credits = payload.credits;
      } else if (event === 'done') {
        result.completed = true;
        result.truncated = Boolean(payload.truncated);
      } else if (event === 'error') throw new ApiError(payload.error ?? 'The assistant could not answer.', 502);
    }
  }
  return result;
}

// ---------- voice (ElevenLabs via /api/voice) ----------

async function voiceRequest(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const response = await fetch('/api/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    let message = 'Voice is not available right now.';
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(message, response.status);
  }
  return response;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Speech to text for the assistant's mic button. */
export async function transcribeSpeech(audio: Blob): Promise<string> {
  const response = await voiceRequest({ action: 'transcribe', audio: await blobToBase64(audio), mime: audio.type || 'audio/webm' });
  return ((await response.json()) as { text?: string }).text ?? '';
}

/** Spoken version of an assistant answer (long answers are condensed to a short briefing server side). */
export async function speakText(text: string, signal?: AbortSignal): Promise<Blob> {
  return (await voiceRequest({ action: 'speak', text }, signal)).blob();
}

// ---------- billing ----------

export type AnswerSize = 'quick' | 'standard' | 'researched' | 'deep' | 'report';
export type AiLevel = 'free' | 'pro' | 'pro_plus';

export interface AiState {
  credits: { monthly_left: number; pack_left: number; allowance: number; resets_at: string } | null;
  levels: Record<AiLevel, { credits: number; label: string }>;
  sizes: { size: AnswerSize; label: string; credits: number; minLevel: AiLevel; allowed: boolean }[];
  creditPack: { credits: number; label: string };
}

export interface BillingState {
  plan: 'free' | 'pro';
  /** free | pro | pro_plus | founding | admin */
  tier: string;
  level: AiLevel;
  status: string;
  interval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  isAdmin: boolean;
  billingAvailable: boolean;
  prices: { month: string; year: string };
  planPrices?: Record<'pro' | 'pro_plus', { month: string; year: string }>;
  ai?: AiState;
}

export function getBilling(): Promise<BillingState> {
  return request<BillingState>('/api/billing');
}

export function startCheckout(interval: 'month' | 'year', plan: 'pro' | 'pro_plus' = 'pro'): Promise<{ url: string }> {
  return request<{ url: string }>('/api/billing', { method: 'POST', body: JSON.stringify({ action: 'checkout', interval, plan }) });
}

export function changePlan(plan: 'pro' | 'pro_plus'): Promise<BillingState> {
  return request<BillingState>('/api/billing', { method: 'POST', body: JSON.stringify({ action: 'change_plan', plan }) });
}

export function buyCredits(): Promise<{ url: string }> {
  return request<{ url: string }>('/api/billing', { method: 'POST', body: JSON.stringify({ action: 'credits' }) });
}

export function confirmCheckout(sessionId: string): Promise<BillingState> {
  return request<BillingState>('/api/billing', { method: 'POST', body: JSON.stringify({ action: 'confirm', session_id: sessionId }) });
}

export function openBillingPortal(): Promise<{ url: string }> {
  return request<{ url: string }>('/api/billing', { method: 'POST', body: JSON.stringify({ action: 'portal' }) });
}

// ---------- status & admin ----------

export interface SiteStatus {
  maintenance: { enabled: boolean; message: string };
}

export async function getSiteStatus(): Promise<SiteStatus> {
  const r = await fetch('/api/status');
  if (!r.ok) throw new ApiError('Status unavailable.', r.status);
  return r.json() as Promise<SiteStatus>;
}

export interface AdminStats {
  users: number;
  new_7d: number;
  active_7d: number;
  active_30d: number;
  paying: number;
  paying_plus?: number;
  founding: number;
  mrr_usd: number;
  assistant_today: number;
  portfolios: number;
  watchlist_items: number;
  recent_users: { email: string; created_at: string; last_sign_in_at: string | null; plan: string }[];
  ai: AdminAiStats | null;
}

export interface AdminAiStats {
  cost_today: number;
  cost_month: number;
  research_cost_month: number;
  answers_today: number;
  credits_month: number;
  research_briefs_today: number;
  daily_limit_usd: number;
  slots: string[];
  coverage: number;
  by_size: { size: string; answers: number; avg_cost: number; cost: number; credits: number }[];
  by_kind: { kind: string; calls: number; cost: number }[];
}

export function runResearchNow(limit: number): Promise<{ result: { ran: boolean; written: number; costUsd: number; reason?: string } }> {
  return request('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'research', limit }) });
}

export function syncVoiceAgent(): Promise<{ configured: boolean; changed: boolean; assistant?: string; chars?: number; error?: string }> {
  return request('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'vapi-sync' }) });
}

export function sendTestEmail(): Promise<{ configured: boolean; sent: boolean; to: string | null }> {
  return request('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'test-email' }) });
}

export function getAdminStats(): Promise<AdminStats> {
  return request<AdminStats>('/api/admin');
}

export function setMaintenance(enabled: boolean, message: string): Promise<SiteStatus> {
  return request<SiteStatus>('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'maintenance', enabled, message }) });
}

// ---------- Paper accounts (virtual money) ----------

export interface PaperPoint { d: string; v: number }
export interface PaperAccount {
  id: string;
  code: string | null;
  name: string;
  mine: boolean;
  mix: { stocks: number; bonds: number; cash: number };
  sleeve: string;
  holdings: { symbol: string; weight: number }[];
  startValue: number;
  target: number;
  targetMultiple: number;
  horizonYears: number;
  assumptions: Record<string, string>;
  version: number;
  createdAt: string;
  inception: string | null;
  asOf: string | null;
  status: 'pending' | 'live';
  value?: number;
  gain?: number;
  totalReturn?: number;
  annualized?: number | null;
  maxDrawdown?: number;
  volatility?: number | null;
  benchmarkReturn?: number;
  vsBenchmark?: number;
  toTarget?: number;
  remainingRequired?: number | null;
  requiredAtStart?: number;
  drift?: { stocks: number; bonds: number; cash: number };
  daysTracked?: number;
  stale?: string[];
  series?: PaperPoint[];
  benchmarkSeries?: PaperPoint[];
}
export interface PaperResponse { accounts: PaperAccount[]; limit: number; plan: 'free' | 'pro' }
export interface NewPaperAccount {
  name: string;
  stocks: number;
  bonds: number;
  cash: number;
  sleeve: 'market' | 'mix' | 'picks';
  bot?: string;
  picks: string[];
  targetMultiple: number;
  horizonYears: number;
}

export function getPaperAccounts(): Promise<PaperResponse> {
  return request<PaperResponse>('/api/paper');
}

export function createPaperAccount(input: NewPaperAccount): Promise<{ id: string }> {
  return request<{ id: string }>('/api/paper', { method: 'POST', body: JSON.stringify(input) });
}

export function deletePaperAccount(id: string): Promise<void> {
  return request<void>(`/api/paper?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------- brokerage (read-only, SnapTrade) ----------

export interface BrokerageStatus {
  available: boolean;
  allowed: boolean;
  connected: boolean;
  status: 'none' | 'pending' | 'connected' | 'error';
  lastSyncedAt: string | null;
  lastError: string | null;
}

export function getBrokerageStatus(): Promise<BrokerageStatus> {
  return request<BrokerageStatus>('/api/brokerage');
}

export function connectBrokerage(): Promise<{ url: string }> {
  return request<{ url: string }>('/api/brokerage', { method: 'POST', body: JSON.stringify({ action: 'connect' }) });
}

export function syncBrokerage(): Promise<{ accounts?: number; positions?: number; skipped?: number | boolean; lastSyncedAt?: string }> {
  return request('/api/brokerage', { method: 'POST', body: JSON.stringify({ action: 'sync' }) });
}

export function disconnectBrokerage(): Promise<{ disconnected: boolean }> {
  return request<{ disconnected: boolean }>('/api/brokerage', { method: 'POST', body: JSON.stringify({ action: 'disconnect' }) });
}
