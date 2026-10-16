import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createAlert } from '@/lib/api';
import type { AlertKind } from '@/lib/supabase';
import {
  ALERTS_DISCLAIMER,
  ALERT_KINDS,
  KIND_LABELS,
  KIND_UNITS,
  TICKER_PATTERN,
  errorMessage,
  inputStep,
  suggestThreshold,
  validateThreshold,
} from '@/components/alerts/alert-utils';

export interface CreateAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTicker?: string;
  currentPrice?: number | null;
  currentScore?: number | null;
  onCreated?: () => void;
}

export function CreateAlertDialog({
  open,
  onOpenChange,
  defaultTicker,
  currentPrice,
  currentScore,
  onCreated,
}: CreateAlertDialogProps) {
  const ids = useId();
  const [ticker, setTicker] = useState(defaultTicker ?? '');
  const [kind, setKind] = useState<AlertKind>('score_above');
  const [threshold, setThreshold] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTicker((defaultTicker ?? '').toUpperCase());
    setKind('score_above');
    setThreshold(suggestThreshold('score_above', currentPrice, currentScore));
    setFieldError(null);
    setApiError(null);
    setSubmitting(false);
  }, [open, defaultTicker, currentPrice, currentScore]);

  const handleKindChange = (value: string) => {
    const next = value as AlertKind;
    setKind(next);
    setThreshold(suggestThreshold(next, currentPrice, currentScore));
    setFieldError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!TICKER_PATTERN.test(symbol)) {
      setFieldError('Enter a valid ticker symbol.');
      return;
    }
    const value = threshold.trim() === '' ? Number.NaN : Number(threshold);
    const invalid = validateThreshold(kind, value);
    if (invalid) {
      setFieldError(invalid);
      return;
    }
    setFieldError(null);
    setApiError(null);
    setSubmitting(true);
    try {
      await createAlert({ ticker: symbol, kind, threshold: value });
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      setApiError(errorMessage(err, 'Could not create alert.'));
    } finally {
      setSubmitting(false);
    }
  };

  const tickerLocked = Boolean(defaultTicker);
  const context: string[] = [];
  if (typeof currentPrice === 'number') context.push(`Current price $${currentPrice.toFixed(2)}`);
  if (typeof currentScore === 'number') context.push(`Current score ${Math.round(currentScore)}`);

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <DialogHeader>
            <DialogTitle>Create alert</DialogTitle>
            <DialogDescription>{ALERTS_DISCLAIMER}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-ticker`} className="text-sm font-medium text-neutral-900">
                Ticker
              </label>
              <Input
                id={`${ids}-ticker`}
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                readOnly={tickerLocked}
                placeholder="e.g. NVDA"
                autoComplete="off"
                maxLength={10}
                aria-readonly={tickerLocked}
              />
              {context.length > 0 && <p className="text-xs text-muted-foreground">{context.join(' · ')}</p>}
            </div>

            <div className="space-y-1.5">
              <label id={`${ids}-kind-label`} className="text-sm font-medium text-neutral-900">
                Notify me when
              </label>
              <Select value={kind} onValueChange={handleKindChange}>
                <SelectTrigger aria-labelledby={`${ids}-kind-label`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALERT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${ids}-threshold`} className="text-sm font-medium text-neutral-900">
                Threshold <span className="font-normal text-muted-foreground">({KIND_UNITS[kind]})</span>
              </label>
              <Input
                id={`${ids}-threshold`}
                type="number"
                inputMode="decimal"
                step={inputStep(kind)}
                value={threshold}
                onChange={(e) => {
                  setThreshold(e.target.value);
                  setFieldError(null);
                }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? `${ids}-error` : undefined}
              />
            </div>

            {(fieldError || apiError) && (
              <p id={`${ids}-error`} role="alert" className="text-sm text-red-600">
                {fieldError ?? apiError}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Create alert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface CreateAlertButtonProps {
  ticker: string;
  currentPrice?: number | null;
  currentScore?: number | null;
}

export function CreateAlertButton({ ticker, currentPrice, currentScore }: CreateAlertButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
        Create alert
      </Button>
      <CreateAlertDialog
        open={open}
        onOpenChange={setOpen}
        defaultTicker={ticker}
        currentPrice={currentPrice}
        currentScore={currentScore}
      />
    </>
  );
}
