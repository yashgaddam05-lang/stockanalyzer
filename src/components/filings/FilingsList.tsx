import { ExternalLink } from 'lucide-react';
import type { SecFiling } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { describeForm, formatDate, formLabel, isDilutionForm } from '@/components/filings/filings-format';

export function FilingsList({ filings }: { filings: SecFiling[] }) {
  return (
    <ul className="divide-y divide-border">
      {filings.map((f) => {
        const label = formLabel(f.form);
        const dilution = isDilutionForm(f.form);
        return (
          <li key={f.id} className="flex items-center gap-3 py-2">
            <Badge
              variant="outline"
              className={cn('w-16 shrink-0 justify-center font-mono', dilution && 'border-amber-300 bg-amber-50 text-amber-800')}
            >
              {label}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">{describeForm(f.form)}</p>
              {f.description ? <p className="truncate text-[12px] text-muted-foreground">{f.description}</p> : null}
            </div>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{formatDate(f.filed_at)}</span>
            {f.primary_doc_url ? (
              <a
                href={f.primary_doc_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${label} filed ${formatDate(f.filed_at)} on SEC EDGAR`}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-neutral-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : (
              <span className="w-[22px] shrink-0" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ul>
  );
}
