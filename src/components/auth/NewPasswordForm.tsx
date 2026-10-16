import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { FieldHint, FormError, MIN_PASSWORD, errorMessage } from '@/components/auth/auth-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Errors {
  current?: string;
  password?: string;
  confirm?: string;
}

interface NewPasswordFormProps {
  /** Ask for the current password too (account page). */
  requireCurrent?: boolean;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: { current: string; password: string }) => Promise<void>;
  /** Called after a successful submit; the form resets itself. */
  onSuccess?: () => void;
}

export function NewPasswordForm({ requireCurrent, submitLabel, submittingLabel, onSubmit, onSuccess }: NewPasswordFormProps) {
  const uid = useId();
  const ids = {
    current: `${uid}-current`,
    password: `${uid}-password`,
    passwordHint: `${uid}-password-hint`,
    confirm: `${uid}-confirm`,
    confirmError: `${uid}-confirm-error`,
    currentError: `${uid}-current-error`,
  };
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Errors = {};
    if (requireCurrent && !current) errs.current = 'Enter your current password.';
    if (password.length < MIN_PASSWORD) errs.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (!confirm) errs.confirm = 'Confirm your new password.';
    else if (confirm !== password) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit({ current, password });
      setCurrent('');
      setPassword('');
      setConfirm('');
      setSubmitting(false);
      onSuccess?.();
    } catch (err) {
      setError(errorMessage(err, 'Could not update your password.'));
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate aria-busy={submitting}>
      {requireCurrent && (
        <div className="space-y-2">
          <label htmlFor={ids.current} className="text-sm font-medium text-neutral-900">
            Current password
          </label>
          <Input
            id={ids.current}
            name="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={submitting}
            required
            aria-invalid={Boolean(errors.current)}
            aria-describedby={errors.current ? ids.currentError : undefined}
          />
          {errors.current && (
            <FieldHint id={ids.currentError} error>
              {errors.current}
            </FieldHint>
          )}
        </div>
      )}
      <div className="space-y-2">
        <label htmlFor={ids.password} className="text-sm font-medium text-neutral-900">
          New password
        </label>
        <Input
          id={ids.password}
          name="new-password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          required
          aria-invalid={Boolean(errors.password)}
          aria-describedby={ids.passwordHint}
        />
        <FieldHint id={ids.passwordHint} error={Boolean(errors.password)}>
          {errors.password ?? `At least ${MIN_PASSWORD} characters.`}
        </FieldHint>
      </div>
      <div className="space-y-2">
        <label htmlFor={ids.confirm} className="text-sm font-medium text-neutral-900">
          Confirm new password
        </label>
        <Input
          id={ids.confirm}
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={submitting}
          required
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={errors.confirm ? ids.confirmError : undefined}
        />
        {errors.confirm && (
          <FieldHint id={ids.confirmError} error>
            {errors.confirm}
          </FieldHint>
        )}
      </div>

      {error && <FormError>{error}</FormError>}

      <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  );
}
