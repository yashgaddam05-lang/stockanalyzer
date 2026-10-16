import { useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MAX_PORTFOLIOS, MAX_PORTFOLIO_NAME } from '@/components/portfolio/portfolio-format';
import type { PortfolioWithPositions } from '@/components/portfolio/portfolio-format';

interface PortfolioTabsProps {
  portfolios: PortfolioWithPositions[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type Mode = { kind: 'idle' } | { kind: 'create' } | { kind: 'rename'; id: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function PortfolioTabs({ portfolios, activeId, onSelect, onCreate, onRename, onDelete }: PortfolioTabsProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const active = portfolios.find((p) => p.id === activeId) ?? null;
  const atLimit = portfolios.length >= MAX_PORTFOLIOS;

  const startCreate = () => {
    if (atLimit) {
      setError(`You can have up to ${MAX_PORTFOLIOS} portfolios. Delete one to create another.`);
      return;
    }
    setName('');
    setError(null);
    setMode({ kind: 'create' });
  };

  const startRename = () => {
    if (!active) return;
    setName(active.name);
    setError(null);
    setMode({ kind: 'rename', id: active.id });
  };

  const cancel = () => {
    setMode({ kind: 'idle' });
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > MAX_PORTFOLIO_NAME) {
      setError(`Name must be 1-${MAX_PORTFOLIO_NAME} characters.`);
      return;
    }
    const clash = portfolios.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase() && (mode.kind !== 'rename' || p.id !== mode.id)
    );
    if (clash) {
      setError('A portfolio with that name already exists.');
      return;
    }
    if (mode.kind === 'create' && atLimit) {
      setError(`You can have up to ${MAX_PORTFOLIOS} portfolios.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode.kind === 'create') await onCreate(trimmed);
      else if (mode.kind === 'rename') await onRename(mode.id, trimmed);
      setMode({ kind: 'idle' });
    } catch (err) {
      setError(errorMessage(err, 'Could not save the portfolio.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!active) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await onDelete(active.id);
      setConfirmOpen(false);
    } catch (err) {
      setDeleteError(errorMessage(err, 'Could not delete the portfolio.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {portfolios.length > 0 && (
          <>
            <div className="sm:hidden">
              <Select value={activeId ?? undefined} onValueChange={onSelect}>
                <SelectTrigger aria-label="Select portfolio">
                  <SelectValue placeholder="Select a portfolio" />
                </SelectTrigger>
                <SelectContent>
                  {portfolios.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.positions.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs value={activeId ?? undefined} onValueChange={onSelect} className="hidden min-w-0 sm:block">
              <TabsList className="h-auto max-w-full flex-wrap justify-start">
                {portfolios.map((p) => (
                  <TabsTrigger key={p.id} value={p.id}>
                    {p.name}
                    <span className="ml-1.5 text-xs opacity-70">{p.positions.length}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </>
        )}

        {mode.kind === 'idle' && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startCreate}
              disabled={atLimit}
              title={atLimit ? `Limit of ${MAX_PORTFOLIOS} portfolios reached` : undefined}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              New portfolio
            </Button>
            {active && (
              <Button type="button" variant="ghost" size="sm" onClick={startRename}>
                <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                Rename
              </Button>
            )}
            {active && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label={`Delete portfolio ${active.name}`}
                onClick={() => {
                  setDeleteError(null);
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>

      {atLimit && mode.kind === 'idle' && (
        <p className="text-[12px] text-muted-foreground">
          {portfolios.length}/{MAX_PORTFOLIOS} portfolios used.
        </p>
      )}

      {mode.kind !== 'idle' && (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="w-full space-y-1 sm:w-72">
            <Input
              autoFocus
              value={name}
              maxLength={MAX_PORTFOLIO_NAME}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancel();
              }}
              placeholder={mode.kind === 'create' ? 'New portfolio name' : 'Portfolio name'}
              aria-label={mode.kind === 'create' ? 'New portfolio name' : 'Rename portfolio'}
            />
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {name.trim().length}/{MAX_PORTFOLIO_NAME}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {mode.kind === 'create' ? 'Create' : 'Save'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => !busy && setConfirmOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete portfolio</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{active?.name}&rdquo; and its {active?.positions.length ?? 0} simulated positions? This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <DialogBody className="pb-0">
              <p role="alert" className="text-sm text-red-600">
                {deleteError}
              </p>
            </DialogBody>
          )}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
