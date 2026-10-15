import type {
  ScoreHistoryResponse,
  StockListItem,
  Watchlist,
  WatchlistEntry,
  WatchlistItem,
  WatchlistsResponse,
} from '@/lib/supabase';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
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
    throw new Error(message);
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
