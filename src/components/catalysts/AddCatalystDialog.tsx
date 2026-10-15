import { useEffect, useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { ApiError, createCatalyst } from '@/lib/api';
import type { Catalyst, CatalystType } from '@/lib/supabase';
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
import {
  CATALYST_TYPES,
  CATALYST_TYPE_LABELS,
  NOTES_MAX,
  TITLE_MAX,
  validateCatalystForm,
} from '@/components/catalysts/catalyst-format';
import type { CatalystFormErrors, CatalystFormValues } from '@/components/catalysts/catalyst-format';

interface AddCatalystDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When given, the ticker is prefilled and locked. */
  ticker?: string;
  onCreated?: (catalyst: Catalyst) => void;
}

function emptyValues(ticker?: string): CatalystFormValues {
  return {
    ticker: ticker?.toUpperCase() ?? '',
    event_type: 'earnings',
    title: '',
    event_date: '',
    date_status: 'confirmed',
    source_url: '',
    notes: '',
  };
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[13px] font-medium text-neutral-800">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-[12px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function AddCatalystDialog({ open, onOpenChange, ticker, onCreated }: AddCatalystDialogProps) {
  const baseId = useId();
  const location = useLocation();
  const [values, setValues] = useState<CatalystFormValues>(() => emptyValues(ticker));
  const [errors, setErrors] = useState<CatalystFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(emptyValues(ticker));
      setErrors({});
      setSubmitError(null);
      setNeedsSignIn(false);
      setBusy(false);
    }
  }, [open, ticker]);

  const set = <K extends keyof CatalystFormValues>(key: K, value: CatalystFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const fieldId = (name: string) => `${baseId}-${name}`;
  const describedBy = (name: keyof CatalystFormValues) => (errors[name] ? `${fieldId(name)}-error` : undefined);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateCatalystForm(values);
    setErrors(found);
    setSubmitError(null);
    setNeedsSignIn(false);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const url = values.source_url.trim();
      const created = await createCatalyst({
        ticker: values.ticker.trim().toUpperCase(),
        event_type: values.event_type as CatalystType,
        title: values.title.trim(),
        event_date: values.event_date,
        date_status: values.date_status as 'confirmed' | 'estimated',
        source_url: url ? url : null,
        notes: values.notes.trim(),
      });
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setNeedsSignIn(true);
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Could not add catalyst.');
      }
    } finally {
      setBusy(false);
    }
  };

  const next = `${location.pathname}${location.search}`;
  const tickerLocked = Boolean(ticker);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="relative pr-12">
          <DialogTitle>Add catalyst</DialogTitle>
          <DialogDescription>Log a dated event that could move the stock.</DialogDescription>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute right-4 top-4 h-8 w-8" aria-label="Close dialog">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DialogClose>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <DialogBody className="space-y-4">
            <Field id={fieldId('ticker')} label="Ticker" error={errors.ticker}>
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
              <Field id={fieldId('event_type')} label="Event type" error={errors.event_type}>
                <Select value={values.event_type} onValueChange={(v) => set('event_type', v)}>
                  <SelectTrigger id={fieldId('event_type')} aria-describedby={describedBy('event_type')}>
                    <SelectValue placeholder="Choose type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATALYST_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {CATALYST_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id={fieldId('date_status')} label="Date status" error={errors.date_status}>
                <Select value={values.date_status} onValueChange={(v) => set('date_status', v)}>
                  <SelectTrigger id={fieldId('date_status')} aria-describedby={describedBy('date_status')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="estimated">Estimated</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field id={fieldId('title')} label="Title" error={errors.title}>
              <Input
                id={fieldId('title')}
                value={values.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Q3 earnings call"
                maxLength={TITLE_MAX + 50}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={describedBy('title')}
              />
            </Field>

            <Field id={fieldId('event_date')} label="Date" error={errors.event_date}>
              <Input
                id={fieldId('event_date')}
                type="date"
                value={values.event_date}
                onChange={(e) => set('event_date', e.target.value)}
                aria-invalid={Boolean(errors.event_date)}
                aria-describedby={describedBy('event_date')}
              />
            </Field>

            <Field id={fieldId('source_url')} label="Source URL (optional)" error={errors.source_url}>
              <Input
                id={fieldId('source_url')}
                type="url"
                value={values.source_url}
                onChange={(e) => set('source_url', e.target.value)}
                placeholder="https://"
                aria-invalid={Boolean(errors.source_url)}
                aria-describedby={describedBy('source_url')}
              />
            </Field>

            <Field id={fieldId('notes')} label="Notes (optional)" error={errors.notes}>
              <textarea
                id={fieldId('notes')}
                value={values.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                className="flex w-full rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={describedBy('notes')}
              />
              <p className="text-right text-[11px] text-muted-foreground tabular-nums">
                {values.notes.length}/{NOTES_MAX}
              </p>
            </Field>

            {needsSignIn && (
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-700" role="alert">
                Sign in to add catalysts.{' '}
                <Link to={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-neutral-900 underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            )}
            {submitError && (
              <p className="text-[13px] text-red-700" role="alert">
                {submitError}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? 'Adding...' : 'Add catalyst'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
