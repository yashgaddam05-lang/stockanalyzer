import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BellPlus, Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AlertRule, AlertRulePatch } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  KIND_LABELS,
  errorMessage,
  formatThreshold,
  inputStep,
  relativeTime,
  validateThreshold,
} from '@/components/alerts/alert-utils';

export interface AlertRulesTableProps {
  rules: AlertRule[];
  loading: boolean;
  onUpdate: (rule: AlertRule, patch: AlertRulePatch) => Promise<void>;
  onDelete: (rule: AlertRule) => Promise<void>;
  onCreate: () => void;
}

function ActiveToggle({ rule, onUpdate }: { rule: AlertRule; onUpdate: AlertRulesTableProps['onUpdate'] }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await onUpdate(rule, { is_active: !rule.is_active });
    } catch {
      // Parent surfaces the error.
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={rule.is_active}
      aria-label={`${rule.is_active ? 'Pause' : 'Activate'} ${rule.ticker} alert`}
      disabled={busy}
      onClick={() => void toggle()}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50',
        rule.is_active ? 'bg-neutral-900' : 'bg-neutral-300'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          rule.is_active ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

function ThresholdCell({ rule, onUpdate }: { rule: AlertRule; onUpdate: AlertRulesTableProps['onUpdate'] }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(rule.threshold));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = () => {
    setValue(String(rule.threshold));
    setError(null);
    setEditing(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const num = value.trim() === '' ? Number.NaN : Number(value);
    const invalid = validateThreshold(rule.kind, num);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (num === rule.threshold) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onUpdate(rule, { threshold: num });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not update threshold.'));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="tabular-nums text-neutral-900">{formatThreshold(rule.kind, rule.threshold)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Edit ${rule.ticker} threshold`}
          onClick={start}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-1" noValidate>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          inputMode="decimal"
          step={inputStep(rule.kind)}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="h-8 w-24"
          aria-label={`New threshold for ${rule.ticker}`}
          aria-invalid={error ? true : undefined}
          autoFocus
        />
        <Button type="submit" variant="ghost" size="icon" className="h-8 w-8" disabled={busy} aria-label="Save threshold">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={busy}
          aria-label="Cancel editing threshold"
          onClick={() => setEditing(false)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

export function AlertRulesTable({ rules, loading, onUpdate, onDelete, onCreate }: AlertRulesTableProps) {
  const [pendingDelete, setPendingDelete] = useState<AlertRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(pendingDelete);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(errorMessage(err, 'Could not delete alert.'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card className="space-y-3 p-4" aria-busy="true" aria-label="Loading alert rules">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </Card>
    );
  }

  if (rules.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <BellPlus className="h-8 w-8 text-neutral-400" aria-hidden="true" />
        <p className="text-sm font-medium text-neutral-900">No alert rules yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Create a rule to get notified in the app when a score, price or catalyst condition is met.
        </p>
        <Button type="button" size="sm" onClick={onCreate}>
          Create alert
        </Button>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <tr>
                <th scope="col" className="px-4 py-3">Ticker</th>
                <th scope="col" className="px-4 py-3">Condition</th>
                <th scope="col" className="px-4 py-3">Threshold</th>
                <th scope="col" className="px-4 py-3">Active</th>
                <th scope="col" className="px-4 py-3">Last triggered</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rules.map((rule) => (
                <tr key={rule.id} className={cn(!rule.is_active && 'text-neutral-500')}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/app/stock/${encodeURIComponent(rule.ticker)}`}
                      className="font-mono font-semibold text-neutral-900 hover:underline"
                    >
                      {rule.ticker}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{KIND_LABELS[rule.kind] ?? rule.kind}</td>
                  <td className="px-4 py-3">
                    <ThresholdCell rule={rule} onUpdate={onUpdate} />
                  </td>
                  <td className="px-4 py-3">
                    <ActiveToggle rule={rule} onUpdate={onUpdate} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {rule.last_triggered_at ? (
                      <time dateTime={rule.last_triggered_at}>{relativeTime(rule.last_triggered_at)}</time>
                    ) : (
                      'Never'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Delete ${rule.ticker} alert`}
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDelete(rule);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !deleting && !open && setPendingDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete alert?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${pendingDelete.ticker}: ${KIND_LABELS[pendingDelete.kind]} ${formatThreshold(pendingDelete.kind, pendingDelete.threshold)}. This cannot be undone.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <DialogBody>
              <p role="alert" className="text-sm text-red-600">
                {deleteError}
              </p>
            </DialogBody>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
