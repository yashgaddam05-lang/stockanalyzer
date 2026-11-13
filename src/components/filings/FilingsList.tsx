import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import type { SecFiling } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { describeForm, formatDate, formLabel, isDilutionForm } from '@/components/filings/filings-format';

// Banks and big issuers file dozens of 424B note prospectuses a week. Three or more
// in a row collapse into one expandable row so 10-K/10-Q/8-K/Form 4 stay visible.
const GROUP_MIN = 3;
const isNote = (form: string) => form.trim().toUpperCase().startsWith('424B');

type Item = { kind: 'one'; filing: SecFiling } | { kind: 'notes'; filings: SecFiling[] };

function groupFilings(filings: SecFiling[]): Item[] {
  const items: Item[] = [];
  let run: SecFiling[] = [];
  const flush = () => {
    if (run.length >= GROUP_MIN) items.push({ kind: 'notes', filings: run });
    else for (const f of run) items.push({ kind: 'one', filing: f });
    run = [];
  };
  for (const f of filings) {
    if (isNote(f.form)) run.push(f);
    else {
      flush();
      items.push({ kind: 'one', filing: f });
    }
  }
  flush();
  return items;
}

function FilingRow({ f, nested = false }: { f: SecFiling; nested?: boolean }) {
  const label = formLabel(f.form);
  const dilution = isDilutionForm(f.form);
  return (
    <li className={cn('flex items-center gap-3 py-2', nested && 'pl-4')}>
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
}

function NotesGroup({ filings }: { filings: SecFiling[] }) {
  const [open, setOpen] = useState(false);
  const newest = filings[0]?.filed_at ?? null;
  const oldest = filings[filings.length - 1]?.filed_at ?? null;
  const range = newest === oldest ? formatDate(newest) : `${formatDate(oldest)} – ${formatDate(newest)}`;
  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Badge variant="outline" className="min-w-[4rem] shrink-0 justify-center whitespace-nowrap border-amber-300 bg-amber-50 font-mono text-amber-800">
          424B ×{filings.length}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">{filings.length} securities offerings</p>
          <p className="truncate text-[12px] text-muted-foreground">
            Note and debt prospectuses; routine for large issuers. {open ? 'Hide' : 'Show all'}
          </p>
        </div>
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{range}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul className="mt-1 divide-y divide-border border-t border-border">
          {filings.map((f) => (
            <FilingRow key={f.id} f={f} nested />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FilingsList({ filings }: { filings: SecFiling[] }) {
  return (
    <ul className="divide-y divide-border">
      {groupFilings(filings).map((item) =>
        item.kind === 'one' ? (
          <FilingRow key={item.filing.id} f={item.filing} />
        ) : (
          <NotesGroup key={`notes-${item.filings[0].id}`} filings={item.filings} />
        ),
      )}
    </ul>
  );
}
