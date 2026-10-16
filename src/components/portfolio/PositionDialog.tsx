import { useEffect, useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import { ApiError, addPosition, createPortfolio, getPortfolios, updatePosition } from '@/lib/api';
import { useStocks } from '@/components/data/StocksProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PortfolioDisclaimer } from '@/components/portfolio/PortfolioDisclaimer';
import {
  DEFAULT_PORTFOLIO_NAME,
  NOTES_MAX,
  todayIso,
  validatePositionForm,
} from '@/components/portfolio/portfolio-format';
import type {
  PortfolioPosition,
  PortfolioWithPositions,
  PositionFormErrors,
  PositionFormValues,
} from '@/components/portfolio/portfolio-format';

export interface PositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'add' creates a new position; 'edit' patches `position`. */
  mode: 'add' | 'edit';
  position?: PortfolioPosition | null;
  defaultTicker?: string;
  defaultCostBasis?: number | null;
  defaultPortfolioId?: string | null;
  onSaved?: (position: PortfolioPosition) => void;
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[13px] font-medium text-neutral-800">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[12px] text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function initialValues(props: PositionDialogProps): PositionFormValues {
  if (props.mode === 'edit' && props.position) {
    const p = props.position;
    return {
      ticker: p.ticker,
      shares: String(p.shares),
      cost_basis: String(p.cost_basis),
      opened_at: p.opened_at ? p.opened_at.slice(0, 10) : '',
      notes: p.notes ?? '',
    };
  }
  const cost = props.defaultCostBasis;
  return {
    ticker: props.defaultTicker?.toUpperCase() ?? '',
    shares: '',
    cost_basis: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? String(Math.round(cost * 100) / 100) : '',
    opened_at: todayIso(),
    notes: '',
  };
}

type Load =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; portfolios: PortfolioWithPositions[] }
  | { state: 'unavailable' }
  | { state: 'error'; message: string };

export function PositionDialog(props: PositionDialogProps) {
  const { open, onOpenChange, mode, position, defaultTicker, defaultPortfolioId, onSaved } = props;
  const baseId = useId();
  const { getStock } = useStocks();
  const [values, setValues] = useState<PositionFormValues>(() => initialValues(props));
  const [errors, setErrors] = useState<PositionFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'idle' });
  const [portfolioId, setPortfolioId] = useState<string>('');

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setValues(initialValues(props));
    setErrors({});
    setSubmitError(null);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, position?.id, defaultTicker, props.defaultCostBasis]);

  // In add mode, load the user's portfolios to choose a destination.
  useEffect(() => {
    if (!open || mode !== 'add') return;
    let cancelled = false;
    setLoad({ state: 'loading' });
    getPortfolios()
      .then((data) => {
        if (cancelled) return;
        if (!data.available) {
          setLoad({ state: 'unavailable' });
          return;
        }
        setLoad({ state: 'ready', portfolios: data.portfolios });
        const preferred = data.portfolios.find((p) => p.id === defaultPortfolioId) ?? data.portfolios[0];
        setPortfolioId(preferred?.id ?? '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError && err.status === 401
            ? 'Your session has expired. Please sign in again.'
            : err instanceof Error
              ? err.message
              : 'Could not load portfolios.';
        setLoad({ state: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, defaultPortfolioId]);

  const set = <K extends keyof PositionFormValues>(key: K, value: PositionFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const fieldId = (name: string) => `${baseId}-${name}`;
  const describedBy = (name: keyof PositionFormErrors) => (errors[name] ? `${fieldId(name)}-error` : undefined);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validatePositionForm(values);
    setErrors(found);
    setSubmitError(null);
    if (Object.values(found).some(Boolean)) return;

    const shares = Number(values.shares);
    const cost_basis = Number(values.cost_basis);
    const notes = values.notes.trim();

    setBusy(true);
    try {
      let saved: PortfolioPosition;
      if (mode === 'edit') {
        if (!position) throw new Error('No position selected.');
        saved = await updatePosition(position.id, {
          shares,
          cost_basis,
          notes,
          ...(values.opened_at ? { opened_at: values.opened_at } : {}),
        });
      } else {
        if (load.state !== 'ready') throw new Error('Portfolios are not loaded yet.');
        let targetId = portfolioId;
        if (!targetId || !load.portfolios.some((p) => p.id === targetId)) {
          if (load.portfolios.length > 0) {
            setErrors({ portfolio: 'Choose a portfolio.' });
            return;
          }
          const created = await createPortfolio(DEFAULT_PORTFOLIO_NAME);
          targetId = created.id;
          setLoad({ state: 'ready', portfolios: [{ ...created, positions: [] }] });
          setPortfolioId(created.id);
        }
        saved = await addPosition({
          portfolio_id: targetId,
          ticker: values.ticker.trim().toUpperCase(),
          shares,
          cost_basis,
          ...(values.opened_at ? { opened_at: values.opened_at } : {}),
          ...(notes ? { notes } : {}),
        });
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSubmitError('Your session has expired. Please sign in again.');
      else setSubmitError(err instanceof Error ? err.message : 'Could not save the position.');
    } finally {
      setBusy(false);
    }
  };

  const ticker = values.ticker.trim().toUpperCase();
  const inUniverse = ticker ? Boolean(getStock(ticker)) : true;
  const tickerLocked = mode === 'edit' || Boolean(defaultTicker);
  const blocked = mode === 'add' && (load.state === 'loading' || load.state === 'unavailable' || load.state === 'error');

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="relative pr-12">
          <DialogTitle>{mode === 'edit' ? `Edit ${position?.ticker ?? 'position'}` : 'Add simulated position'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Update shares, cost basis, open date or notes.'
              : 'Record a hypothetical position to track against last refreshed prices.'}
          </DialogDescription>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute right-4 top-4 h-8 w-8" aria-label="Close dialog">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DialogClose>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <DialogBody className="space-y-4">
            <PortfolioDisclaimer compact />

            {mode === 'add' && (
              <>
                {load.state === 'loading' || load.state === 'idle' ? (
                  <Skeleton className="h-10 w-full" />
                ) : load.state === 'unavailable' ? (
                  <p role="status" className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-700">
                    Simulated portfolios activate after the database upgrade.
                  </p>
                ) : load.state === 'error' ? (
                  <p role="alert" className="text-[13px] text-red-700">
                    {load.message}
                  </p>
                ) : load.portfolios.length === 0 ? (
                  <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-700">
                    You have no portfolios yet. &ldquo;{DEFAULT_PORTFOLIO_NAME}&rdquo; will be created for this position.
                  </p>
                ) : (
                  <Field id={fieldId('portfolio')} label="Portfolio" error={errors.portfolio}>
                    <Select value={portfolioId || undefined} onValueChange={setPortfolioId}>
                      <SelectTrigger id={fieldId('portfolio')} aria-describedby={describedBy('portfolio')}>
                        <SelectValue placeholder="Choose portfolio" />
                      </SelectTrigger>
                      <SelectContent>
                        {load.portfolios.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.positions.length})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </>
            )}

            <Field
              id={fieldId('ticker')}
              label="Ticker"
              error={errors.ticker}
              hint={!inUniverse ? 'Not in the tracked universe: it will show as unpriced.' : undefined}
            >
              <Input
                id={fieldId('ticker')}
                value={values.ticker}
                onChange={(e) => set('ticker', e.target.value.toUpperCase())}
                readOnly={tickerLocked}
                disabled={tickerLocked}
                placeholder="e.g. NVDA"
                autoComplete="off"
                maxLength={10}
                aria-invalid={Boolean(errors.ticker)}
                aria-describedby={describedBy('ticker')}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id={fieldId('shares')} label="Shares" error={errors.shares}>
                <Input
                  id={fieldId('shares')}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={values.shares}
                  onChange={(e) => set('shares', e.target.value)}
                  placeholder="e.g. 10"
                  aria-invalid={Boolean(errors.shares)}
                  aria-describedby={describedBy('shares')}
                />
              </Field>
              <Field id={fieldId('cost_basis')} label="Cost basis per share (USD)" error={errors.cost_basis}>
                <Input
                  id={fieldId('cost_basis')}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={values.cost_basis}
                  onChange={(e) => set('cost_basis', e.target.value)}
                  placeholder="e.g. 42.50"
                  aria-invalid={Boolean(errors.cost_basis)}
                  aria-describedby={describedBy('cost_basis')}
                />
              </Field>
            </div>

            <Field id={fieldId('opened_at')} label="Open date" error={errors.opened_at}>
              <Input
                id={fieldId('opened_at')}
                type="date"
                max={todayIso()}
                value={values.opened_at}
                onChange={(e) => set('opened_at', e.target.value)}
                aria-invalid={Boolean(errors.opened_at)}
                aria-describedby={describedBy('opened_at')}
              />
            </Field>

            <Field id={fieldId('notes')} label="Notes (optional)" error={errors.notes}>
              <textarea
                id={fieldId('notes')}
                value={values.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={2}
                maxLength={NOTES_MAX}
                className="flex w-full rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={describedBy('notes')}
              />
            </Field>

            {submitError && (
              <p className="text-[13px] text-red-700" role="alert">
                {submitError}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || blocked}>
              {busy ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Add position'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
