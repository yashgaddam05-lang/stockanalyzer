import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const MAX_NOTES = 2000;

interface NotesEditorProps {
  notes: string;
  ticker: string;
  disabled?: boolean;
  onSave: (notes: string) => Promise<void>;
}

export function NotesEditor({ notes, ticker, disabled = false, onSave }: NotesEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disabled) {
    return <p className="text-xs text-muted-foreground">{notes || '-'}</p>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(notes);
          setError(null);
          setEditing(true);
        }}
        aria-label={`Edit notes for ${ticker}`}
        className="group flex w-full items-start gap-1.5 rounded-md p-1 text-left text-xs text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400 group-hover:text-neutral-700" />
        <span className={notes ? 'line-clamp-3 whitespace-pre-wrap' : 'text-muted-foreground'}>{notes || 'Add notes'}</span>
      </button>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save notes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <textarea
        value={draft}
        maxLength={MAX_NOTES}
        rows={3}
        autoFocus
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
        }}
        aria-label={`Notes for ${ticker}`}
        className="w-full min-w-[12rem] resize-y rounded-md border border-input bg-transparent p-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {draft.length}/{MAX_NOTES}
        </span>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
