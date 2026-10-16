import type { RefreshRun } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/data-health/StatusBadge';
import { RelativeTime } from '@/components/data-health/RelativeTime';
import { RUN_LABELS, formatDuration, keyStats, runTone } from '@/components/data-health/format';

interface RunsTableProps {
  runs: RefreshRun[];
  now: number;
}

export function RunsTable({ runs, now }: RunsTableProps) {
  if (runs.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">No refresh runs recorded yet.</Card>;
  }
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="runs-table">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-3 sm:px-6">Job</th>
            <th scope="col" className="px-4 py-3">Started</th>
            <th scope="col" className="px-4 py-3">Duration</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="hidden px-4 py-3 sm:table-cell sm:pr-6">Key stats</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const stats = keyStats(run.stats);
            return (
              <tr key={run.id} className="border-b border-neutral-100 align-top last:border-0" data-testid="run-row">
                <td className="px-4 py-3 font-medium text-neutral-900 sm:px-6">{run.job}</td>
                <td className="px-4 py-3 text-neutral-700">
                  <RelativeTime value={run.started_at} now={now} />
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-700">{formatDuration(run)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={runTone(run.status)} label={RUN_LABELS[run.status] ?? run.status} />
                </td>
                <td className="hidden px-4 py-3 sm:table-cell sm:pr-6">
                  {stats.length === 0 ? (
                    <span className="text-[13px] text-neutral-400">—</span>
                  ) : (
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                      {stats.map((s) => (
                        <div key={s.key} className="flex gap-1">
                          <dt className="text-muted-foreground">{s.label}</dt>
                          <dd className="tabular-nums text-neutral-800">{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
