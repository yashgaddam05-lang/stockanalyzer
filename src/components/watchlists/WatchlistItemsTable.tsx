import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { StockListItem, WatchlistItem } from '@/lib/supabase';
import type { AnalysisResult } from '@/lib/analysis';
import { getRiskColor, getScoreColor } from '@/lib/analysis';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { NotesEditor } from '@/components/watchlists/NotesEditor';
import { TagEditor } from '@/components/watchlists/TagEditor';

export interface WatchlistRow {
  item: WatchlistItem;
  stock: StockListItem | undefined;
  analysis: AnalysisResult | undefined;
}

type SortKey = 'score' | 'risk' | 'change' | 'ticker' | 'added';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'score', label: '3x score' },
  { key: 'risk', label: 'Risk score' },
  { key: 'change', label: 'Score change' },
  { key: 'ticker', label: 'Ticker' },
  { key: 'added', label: 'Date added' },
];

function sortValue(row: WatchlistRow, key: SortKey): number | string | null {
  switch (key) {
    case 'score':
      return row.analysis?.totalScore ?? null;
    case 'risk':
      return row.analysis?.riskScore ?? null;
    case 'change':
      return row.stock?.score_change ?? null;
    case 'ticker':
      return row.item.ticker.toUpperCase();
    case 'added':
      return row.item.added_at;
  }
}

function ScoreChangeChip({ change }: { change: number | null | undefined }) {
  if (change === null || change === undefined) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }
  const up = change > 0;
  const down = change < 0;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        up && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        down && 'border-red-200 bg-red-50 text-red-700',
        !up && !down && 'border-neutral-200 bg-neutral-50 text-neutral-600'
      )}
    >
      {up ? '+' : ''}
      {change.toFixed(change % 1 === 0 ? 0 : 1)}
    </span>
  );
}

interface WatchlistItemsTableProps {
  rows: WatchlistRow[];
  legacy: boolean;
  onRemove: (item: WatchlistItem) => Promise<void>;
  onUpdate: (item: WatchlistItem, patch: { notes?: string; tags?: string[] }) => Promise<void>;
}

export function WatchlistItemsTable({ rows, legacy, onRemove, onUpdate }: WatchlistItemsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [desc, setDesc] = useState(true);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = rows.slice();
    copy.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      // Missing values always sink to the bottom.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return desc ? -cmp : cmp;
    });
    return copy;
  }, [rows, sortKey, desc]);

  const remove = async (item: WatchlistItem) => {
    setRemoveError(null);
    try {
      await onRemove(item);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : `Could not remove ${item.ticker}.`);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Sort by</span>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-40" aria-label="Sort watchlist by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          aria-label={desc ? 'Sort descending, switch to ascending' : 'Sort ascending, switch to descending'}
          onClick={() => setDesc((d) => !d)}
        >
          {desc ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>

      {removeError && (
        <p role="alert" className="text-xs text-red-600">
          {removeError}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Ticker</th>
              <th scope="col" className="px-3 py-2 font-medium">3x score</th>
              <th scope="col" className="px-3 py-2 font-medium">Change</th>
              <th scope="col" className="px-3 py-2 font-medium">Risk</th>
              <th scope="col" className="px-3 py-2 font-medium">Sector</th>
              <th scope="col" className="w-64 px-3 py-2 font-medium">Notes</th>
              <th scope="col" className="w-56 px-3 py-2 font-medium">Tags</th>
              <th scope="col" className="px-3 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map(({ item, stock, analysis }) => (
              <tr key={item.id} className="align-top">
                <td className="px-3 py-3">
                  <Link
                    to={`/stock/${encodeURIComponent(item.ticker)}`}
                    className="font-semibold text-neutral-900 underline-offset-2 hover:underline"
                  >
                    {item.ticker}
                  </Link>
                  <p className="max-w-[12rem] truncate text-xs text-muted-foreground">
                    {stock?.company_name ?? 'Not in universe'}
                  </p>
                </td>
                <td className="px-3 py-3">
                  {analysis ? (
                    <span className={cn('font-bold tabular-nums', getScoreColor(analysis.totalScore))}>
                      {analysis.totalScore}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <ScoreChangeChip change={stock?.score_change} />
                </td>
                <td className="px-3 py-3">
                  {analysis ? (
                    <div className="flex items-center gap-1.5">
                      <span className="tabular-nums text-neutral-800">{analysis.riskScore}</span>
                      <span
                        className={cn(
                          'rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize',
                          getRiskColor(analysis.riskLabel)
                        )}
                      >
                        {analysis.riskLabel}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-neutral-700">{stock?.sector ?? '-'}</td>
                <td className="px-3 py-3">
                  <NotesEditor
                    notes={item.notes}
                    ticker={item.ticker}
                    disabled={legacy}
                    onSave={(notes) => onUpdate(item, { notes })}
                  />
                </td>
                <td className="px-3 py-3">
                  <TagEditor
                    tags={item.tags}
                    ticker={item.ticker}
                    disabled={legacy}
                    onChange={(tags) => onUpdate(item, { tags })}
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-neutral-500 hover:text-red-600"
                    aria-label={`Remove ${item.ticker} from watchlist`}
                    onClick={() => void remove(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
