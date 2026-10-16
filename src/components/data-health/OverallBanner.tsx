import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { CheckStatus, DataQualityCheck } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { TONE_STYLES } from '@/components/data-health/format';
import { RelativeTime } from '@/components/data-health/RelativeTime';

interface OverallBannerProps {
  overall: CheckStatus;
  checks: DataQualityCheck[];
  generatedAt: string;
  now: number;
}

const HEADLINES: Record<CheckStatus, string> = {
  ok: 'All checks passing',
  warn: 'Some checks need attention',
  fail: 'Data quality checks failing',
};

const ICONS = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle } as const;

export function OverallBanner({ overall, checks, generatedAt, now }: OverallBannerProps) {
  const Icon = ICONS[overall];
  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const c of checks) counts[c.status] += 1;
  return (
    <div
      role="status"
      data-testid="overall-banner"
      data-status={overall}
      className={cn('flex flex-col gap-2 rounded-xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6', TONE_STYLES[overall].banner)}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', TONE_STYLES[overall].text)} aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{HEADLINES[overall]}</p>
          <p className="text-[13px] opacity-80">
            {counts.ok} passing, {counts.warn} {counts.warn === 1 ? 'warning' : 'warnings'}, {counts.fail} failing
          </p>
        </div>
      </div>
      <p className="text-[12px] opacity-80 sm:text-right">
        Checked <RelativeTime value={generatedAt} now={now} />
      </p>
    </div>
  );
}
