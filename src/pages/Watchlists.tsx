import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '@/lib/store';
import { getScoreColor, RISK_BAND_VARIANT } from '@/lib/analysis';
import type { WatchlistItem } from '@/lib/supabase';
import { ScoreDelta } from '@/components/ScoreDelta';
import { StockCard } from '@/components/StockCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Check, X, Star, Database } from 'lucide-react';

type SortKey = 'score' | 'risk' | 'change' | 'added';

export default function Watchlists() {
  const {
    watchlistsReady, watchlists, items, activeListId, setActiveListId, bySymbol, analyzed,
    createList, renameList, deleteList, updateItem, removeItem, watchedTickers, toggleWatch, isWatched,
  } = useData();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');

  const active = watchlists.find((l) => l.id === activeListId);
  const rows = useMemo(() => {
    const r = items
      .filter((i) => i.watchlist_id === activeListId)
      .map((i) => ({ item: i, a: bySymbol.get(i.ticker) }))
      .filter((r): r is { item: WatchlistItem; a: NonNullable<typeof r.a> } => !!r.a);
    const val = {
      score: (x: (typeof r)[number]) => x.a.analysis.totalScore,
      risk: (x: (typeof r)[number]) => x.a.analysis.risk.score,
      change: (x: (typeof r)[number]) => x.a.delta ?? 0,
      added: (x: (typeof r)[number]) => new Date(x.item.added_at).getTime(),
    }[sortKey];
    return r.sort((p, q) => val(q) - val(p));
  }, [items, activeListId, bySymbol, sortKey]);

  const aggregate = useMemo(() => {
    if (rows.length === 0) return null;
    const avgScore = Math.round(rows.reduce((s, r) => s + r.a.analysis.totalScore, 0) / rows.length);
    const avgRisk = Math.round(rows.reduce((s, r) => s + r.a.analysis.risk.score, 0) / rows.length);
    const sectors = new Map<string, number>();
    rows.forEach((r) => sectors.set(r.a.stock.sector, (sectors.get(r.a.stock.sector) || 0) + 1));
    const exposure = Array.from(sectors.entries()).sort((a, b) => b[1] - a[1]);
    return { avgScore, avgRisk, exposure };
  }, [rows]);

  if (!watchlistsReady) {
    const legacy = analyzed.filter((a) => watchedTickers.has(a.stock.ticker));
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 pt-2">Watchlist</h2>
        <Card className="p-4 border-border flex items-start gap-3 bg-neutral-50">
          <Database className="w-4 h-4 text-neutral-500 mt-0.5" />
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Named watchlists with notes and tags are ready but the database migration has not been applied yet.
            Ask Bolt: "Apply the pending migrations in supabase/migrations." Until then, your single legacy watchlist is shown below.
          </p>
        </Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {legacy.map((item) => (
            <StockCard key={item.stock.id} item={item} isWatched={isWatched(item.stock.ticker)} onToggleWatch={() => toggleWatch(item.stock.ticker)} />
          ))}
        </div>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await createList(newName.trim());
    setNewName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap pt-2">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Watchlists</h2>
          <p className="text-sm text-muted-foreground">The star on any stock adds it to the active list.</p>
        </div>
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New list name" className="h-8 text-[13px] w-44" aria-label="New watchlist name" />
          <Button type="submit" size="sm" className="h-8 gap-1.5 text-[12px]" disabled={!newName.trim()}>
            <Plus className="w-3.5 h-3.5" /> Create
          </Button>
        </form>
      </div>

      {/* List switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {watchlists.map((l) => {
          const count = items.filter((i) => i.watchlist_id === l.id).length;
          const on = l.id === activeListId;
          return (
            <button
              key={l.id}
              onClick={() => { setActiveListId(l.id); setEditing(false); }}
              className={`text-[12px] px-3 py-1.5 rounded-md font-medium border transition-all ${
                on ? 'bg-neutral-900 text-white border-neutral-900' : 'text-neutral-600 border-border hover:border-neutral-400'
              }`}
            >
              {l.name} <span className="opacity-60 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="flex items-center gap-2 flex-wrap">
          {editing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={async (e) => { e.preventDefault(); if (editName.trim()) await renameList(active.id, editName.trim()); setEditing(false); }}
            >
              <Input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-[13px] w-48" aria-label="Watchlist name" />
              <Button type="submit" size="icon" variant="outline" className="h-8 w-8" aria-label="Save name"><Check className="w-3.5 h-3.5" /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(false)} aria-label="Cancel rename"><X className="w-3.5 h-3.5" /></Button>
            </form>
          ) : (
            <>
              <h3 className="text-[15px] font-semibold text-neutral-900">{active.name}</h3>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditName(active.name); setEditing(true); }} aria-label="Rename list">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              {watchlists.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Delete list"
                  onClick={() => { if (window.confirm(`Delete "${active.name}" and its notes?`)) deleteList(active.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </>
          )}
          <div className="ml-auto">
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-8 text-[12px] w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Sort: Score</SelectItem>
                <SelectItem value="risk">Sort: Risk</SelectItem>
                <SelectItem value="change">Sort: Score change</SelectItem>
                <SelectItem value="added">Sort: Recently added</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {aggregate && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4 border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg 3x score</p>
            <p className="text-2xl font-bold text-neutral-900 tabular-nums mt-1">{aggregate.avgScore}</p>
          </Card>
          <Card className="p-4 border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg risk score</p>
            <p className="text-2xl font-bold text-neutral-900 tabular-nums mt-1">{aggregate.avgRisk}</p>
          </Card>
          <Card className="p-4 border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Sector exposure</p>
            <div className="flex flex-wrap gap-1.5">
              {aggregate.exposure.map(([s, n]) => (
                <Badge key={s} variant="secondary">{s} {Math.round((n / rows.length) * 100)}%</Badge>
              ))}
            </div>
          </Card>
        </div>
      )}

      {rows.length === 0 ? (
        <Card className="p-16 flex flex-col items-center justify-center text-center border-border">
          <Star className="w-10 h-10 text-neutral-300 mb-3" />
          <p className="text-sm font-medium text-neutral-900">This list is empty</p>
          <p className="text-xs text-muted-foreground mt-1">
            Star stocks on <Link to="/explore" className="underline underline-offset-2">Explore</Link> to add them here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(({ item, a }) => (
            <WatchRow key={item.id} item={item} a={a} onUpdate={updateItem} onRemove={removeItem} />
          ))}
        </div>
      )}
    </div>
  );
}

function WatchRow({
  item, a, onUpdate, onRemove,
}: {
  item: WatchlistItem;
  a: NonNullable<ReturnType<ReturnType<typeof useData>['bySymbol']['get']>>;
  onUpdate: (id: string, patch: Partial<Pick<WatchlistItem, 'note' | 'tags'>>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [note, setNote] = useState(item.note);
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || item.tags.includes(t)) { setTagInput(''); return; }
    onUpdate(item.id, { tags: [...item.tags, t] });
    setTagInput('');
  };

  return (
    <Card className="p-4 border-border">
      <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
        <div className="w-full sm:w-48 flex-shrink-0">
          <Link to={`/stock/${a.stock.ticker}`} className="font-semibold text-neutral-900 hover:underline">{a.stock.ticker}</Link>
          <p className="text-[12px] text-muted-foreground truncate">{a.stock.company_name}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-lg font-bold tabular-nums ${getScoreColor(a.analysis.totalScore)}`}>{a.analysis.totalScore}</span>
            <ScoreDelta delta={a.delta} />
            <Badge variant={RISK_BAND_VARIANT[a.analysis.risk.band]}>Risk {a.analysis.risk.score}</Badge>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => { if (note !== item.note) onUpdate(item.id, { note }); }}
            placeholder="Add a note: entry idea, thesis check, catalyst date..."
            rows={2}
            className="w-full text-[13px] rounded-md border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            aria-label={`Note for ${a.stock.ticker}`}
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.tags.map((t) => (
              <button
                key={t}
                onClick={() => onUpdate(item.id, { tags: item.tags.filter((x) => x !== t) })}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-neutral-100 border border-border text-neutral-700 hover:bg-neutral-200"
                aria-label={`Remove tag ${t}`}
              >
                {t} <X className="w-3 h-3" />
              </button>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
              onBlur={addTag}
              placeholder="+ tag"
              className="text-[11px] w-20 px-2 py-0.5 rounded-md border border-dashed border-border bg-transparent focus:outline-none focus:border-neutral-400"
              aria-label={`Add tag to ${a.stock.ticker}`}
            />
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-400 hover:text-neutral-900" onClick={() => onRemove(item.id)} aria-label={`Remove ${a.stock.ticker} from list`}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}
