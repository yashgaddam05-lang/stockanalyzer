import type { ReactNode } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import type { Catalyst } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CATALYST_TYPE_ICONS,
  CATALYST_TYPE_LABELS,
  formatCatalystDate,
  relativeLabel,
} from '@/components/catalysts/catalyst-format';

interface CatalystListProps<T extends Catalyst> {
  rows: T[];
  canDelete?: (row: T) => boolean;
  onDelete?: (row: T) => void;
  /** Optional extra content rendered before the title (e.g. ticker link on the calendar page). */
  renderLead?: (row: T) => ReactNode;
  deletingId?: string | null;
}

export function CatalystList<T extends Catalyst>({ rows, canDelete, onDelete, renderLead, deletingId }: CatalystListProps<T>) {
  return (
    <ul className="divide-y divide-neutral-200">
      {rows.map((row) => {
        const Icon = CATALYST_TYPE_ICONS[row.event_type] ?? CATALYST_TYPE_ICONS.other;
        const typeLabel = CATALYST_TYPE_LABELS[row.event_type] ?? 'Other';
        const deletable = Boolean(onDelete && canDelete?.(row));
        return (
          <li key={row.id} className="flex items-start gap-3 py-3" data-testid="catalyst-row">
            <div className="w-24 shrink-0 sm:w-28">
              <p className="text-[13px] font-medium text-neutral-900 tabular-nums">{formatCatalystDate(row.event_date)}</p>
              <p className="text-[12px] text-muted-foreground">{relativeLabel(row.event_date)}</p>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {renderLead?.(row)}
                <Badge variant="secondary" className="gap-1">
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {typeLabel}
                </Badge>
                {row.date_status === 'estimated' && <Badge variant="outline">Estimated</Badge>}
              </div>
              <p className="text-sm text-neutral-800 break-words">{row.title}</p>
              {row.notes && <p className="text-[12px] text-muted-foreground break-words">{row.notes}</p>}
              {row.source_url && (
                <a
                  href={row.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline"
                >
                  Source
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
            {deletable && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-neutral-500 hover:text-neutral-900"
                aria-label={`Delete catalyst: ${row.title}`}
                disabled={deletingId === row.id}
                onClick={() => onDelete?.(row)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
