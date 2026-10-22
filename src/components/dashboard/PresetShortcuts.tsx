import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { StockListItem } from '@/lib/supabase';
import { PRESET_SCREENS, computeRiskScore, scoreStock } from '@/lib/scoring';
import type { ScoredStock } from '@/lib/scoring';
import { Card } from '@/components/ui/card';
import { withScope } from '@/components/dashboard/scope';
import type { DashboardScope } from '@/lib/supabase';
import { InfoTip } from '@/components/ui/info-tip';

export function PresetShortcuts({ stocks, scope }: { stocks: StockListItem[]; scope?: DashboardScope }) {
  const counts = useMemo(() => {
    const scored: ScoredStock[] = stocks.map((stock) => ({ stock, score: scoreStock(stock), risk: computeRiskScore(stock) }));
    return Object.fromEntries(PRESET_SCREENS.map((p) => [p.id, scored.filter(p.filter).length]));
  }, [stocks]);

  return (
    <section className="space-y-4" aria-labelledby="preset-shortcuts-heading">
      <h2 id="preset-shortcuts-heading" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-neutral-900">
        Preset screens
        <InfoTip topic="presets" />
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESET_SCREENS.map((p) => (
          <Link
            key={p.id}
            to={withScope(`/app/explore?preset=${encodeURIComponent(p.id)}`, scope)}
            className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            <Card className="flex h-full flex-col p-4 transition-colors group-hover:border-neutral-400">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-neutral-900">{p.label}</span>
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-neutral-700">
                  {counts[p.id] ?? 0}
                </span>
              </div>
              <p className="mt-1 flex-1 text-[12px] text-muted-foreground">{p.description}</p>
              <span className="mt-3 flex items-center gap-1 text-[12px] text-neutral-600 group-hover:text-neutral-900">
                Open screen <ArrowRight className="h-3 w-3" />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
