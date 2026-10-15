import { ArrowUpDown, Search, Star, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CAP_OPTIONS, RISK_OPTIONS, SORT_OPTIONS, SOURCE_OPTIONS } from './filters';
import type { CapBucket, ExploreFilters, RiskFilter, SortKey, SourceFilter } from './filters';

export interface FilterBarProps {
  filters: ExploreFilters;
  onChange: (patch: Partial<ExploreFilters>) => void;
  sectors: string[];
  /** null when a preset's own ordering is in effect */
  sortKey: SortKey | null;
  onSortChange: (key: SortKey) => void;
  watchCount: number;
}

const triggerCls = 'h-9 w-full text-[13px] sm:w-[160px]';

export function FilterBar({ filters, onChange, sectors, sortKey, onSortChange, watchCount }: FilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Search ticker, company, or industry..."
            className="h-9 pl-10 pr-10 text-[13px]"
            aria-label="Search ticker, company, or industry"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => onChange({ query: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange({ watchOnly: !filters.watchOnly })}
          aria-pressed={filters.watchOnly}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-[13px] font-medium transition-colors',
            filters.watchOnly
              ? 'border-neutral-900 bg-neutral-900 text-white'
              : 'border-border bg-white text-neutral-700 hover:border-neutral-400'
          )}
        >
          <Star className={cn('h-3.5 w-3.5', filters.watchOnly && 'fill-white')} />
          Watchlist only
          <span className="text-xs opacity-70">{watchCount}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
        <Select value={filters.sector} onValueChange={(v) => onChange({ sector: v })}>
          <SelectTrigger className={triggerCls} aria-label="Sector">
            <SelectValue placeholder="All Sectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.risk} onValueChange={(v) => onChange({ risk: v as RiskFilter })}>
          <SelectTrigger className={triggerCls} aria-label="Risk level">
            <SelectValue placeholder="All Risk Levels" />
          </SelectTrigger>
          <SelectContent>
            {RISK_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.cap} onValueChange={(v) => onChange({ cap: v as CapBucket })}>
          <SelectTrigger className={triggerCls} aria-label="Market cap">
            <SelectValue placeholder="All Market Caps" />
          </SelectTrigger>
          <SelectContent>
            {CAP_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.source} onValueChange={(v) => onChange({ source: v as SourceFilter })}>
          <SelectTrigger className={triggerCls} aria-label="Data source">
            <SelectValue placeholder="All Data" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sort by">
        <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          <ArrowUpDown className="h-3 w-3" /> Sort
        </span>
        {SORT_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.key}
            onClick={() => onSortChange(opt.key)}
            aria-pressed={sortKey === opt.key}
            className={cn(
              'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
              sortKey === opt.key ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
