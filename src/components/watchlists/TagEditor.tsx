import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 24;
const TAG_RE = /^[a-z0-9][a-z0-9 -]*$/;

interface TagEditorProps {
  tags: string[];
  disabled?: boolean;
  ticker: string;
  onChange: (tags: string[]) => Promise<void>;
}

export function TagEditor({ tags, disabled = false, ticker, onChange }: TagEditorProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const commit = async (next: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update tags.');
    } finally {
      setBusy(false);
    }
  };

  const addTag = async () => {
    const tag = draft.trim().toLowerCase();
    if (!tag) return;
    if (tags.includes(tag)) {
      setDraft('');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setError(`Maximum ${MAX_TAGS} tags.`);
      return;
    }
    if (tag.length > MAX_TAG_LENGTH || !TAG_RE.test(tag)) {
      setError(`Tags are 1-${MAX_TAG_LENGTH} characters: a-z, 0-9, space, hyphen.`);
      return;
    }
    setDraft('');
    await commit([...tags, tag]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void addTag();
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 py-0.5 pl-2 pr-1 text-[11px] font-medium text-neutral-700"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove tag ${tag} from ${ticker}`}
                disabled={busy}
                onClick={() => void commit(tags.filter((t) => t !== tag))}
                className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            value={draft}
            maxLength={MAX_TAG_LENGTH}
            disabled={busy}
            onChange={(e) => {
              setDraft(e.target.value.toLowerCase());
              setError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={tags.length >= MAX_TAGS ? 'Tag limit reached' : 'Add tag'}
            aria-label={`Add tag to ${ticker}`}
            className={cn(
              'h-7 w-24 rounded-md border border-input bg-transparent px-2 text-xs text-foreground placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
            )}
          />
        )}
        {disabled && tags.length === 0 && <span className="text-xs text-muted-foreground">-</span>}
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
