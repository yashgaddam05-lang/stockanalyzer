import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function CaveatsList({ caveats }: { caveats: string[] }) {
  return (
    <Card className="p-6" aria-labelledby="backtest-caveats-heading">
      <h2 id="backtest-caveats-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
        Caveats
      </h2>
      {caveats.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No caveats were returned.</p>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-neutral-700">
          {caveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
