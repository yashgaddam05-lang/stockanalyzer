import { CalendarClock, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DIMENSIONS, MODEL_VERSION } from '@/lib/scoring';

/** Hardcoded illustrative dimension scores for a fictional company. Never fetched, never real. */
const EXAMPLE_SCORES: Record<string, number> = {
  growth: 88,
  valuation: 71,
  momentum: 79,
  quality: 58,
  catalyst: 82,
  position: 52,
  risk: 41,
  regime: 64,
};

const rows = DIMENSIONS.map((d) => ({ key: d.key, label: d.label, weight: d.weight, score: EXAMPLE_SCORES[d.key] ?? 50 }));
const totalWeight = rows.reduce((a, r) => a + r.weight, 0);
const overall = Math.round(rows.reduce((a, r) => a + r.score * r.weight, 0) / totalWeight);

function barTone(score: number) {
  if (score >= 75) return 'bg-neutral-900';
  if (score >= 60) return 'bg-neutral-700';
  if (score >= 45) return 'bg-neutral-500';
  return 'bg-neutral-300';
}

export function ScorePreviewCard() {
  return (
    <Card className="overflow-hidden" aria-label="Illustrative example of a 3x Hunter score card">
      <div className="flex items-center justify-between border-b border-border bg-neutral-50 px-5 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Illustrative example</span>
        <span className="text-[11px] text-neutral-500">Model {MODEL_VERSION}</span>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-neutral-900">EXMPL</span>
              <Badge variant="secondary">Healthcare</Badge>
            </div>
            <p className="mt-1 truncate text-[13px] text-neutral-500">Example Therapeutics Inc. (fictional)</p>
          </div>
          <div className="text-right">
            <p className="text-[36px] font-semibold leading-none tracking-tight tabular-nums text-neutral-900">{overall}</p>
            <p className="mt-1 text-[11px] text-neutral-500">3x Opportunity Score</p>
          </div>
        </div>

        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="truncate text-[12px] text-neutral-700">
                {r.label}
                <span className="ml-1.5 text-neutral-400">{r.weight}%</span>
              </span>
              <span className="text-right text-[12px] font-medium tabular-nums text-neutral-900">{r.score}</span>
              <Progress
                value={r.score}
                className="col-span-2 h-1.5"
                indicatorClassName={barTone(r.score)}
                aria-label={`${r.label}: ${r.score} of 100`}
              />
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-medium text-neutral-900">Risk 62</p>
              <p className="text-[11px] text-neutral-500">Scored separately</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-medium text-neutral-900">Phase 3 readout</p>
              <p className="text-[11px] text-neutral-500">Next catalyst</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
