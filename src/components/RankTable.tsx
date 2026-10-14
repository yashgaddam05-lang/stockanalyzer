import { Link } from 'react-router-dom';
import { getScoreColor, RISK_BAND_VARIANT, type AnalyzedStock } from '@/lib/analysis';
import { ScoreDelta } from '@/components/ScoreDelta';
import { Badge } from '@/components/ui/badge';

export function RankTable({ rows, startRank = 1 }: { rows: AnalyzedStock[]; startRank?: number }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="text-left font-medium py-2 px-1 w-8">#</th>
            <th className="text-left font-medium py-2 px-1">Stock</th>
            <th className="text-right font-medium py-2 px-1">Score</th>
            <th className="text-right font-medium py-2 px-1 hidden sm:table-cell">Change</th>
            <th className="text-right font-medium py-2 px-1">Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.stock.ticker} className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
              <td className="py-2 px-1 text-muted-foreground tabular-nums">{startRank + i}</td>
              <td className="py-2 px-1">
                <Link to={`/stock/${r.stock.ticker}`} className="flex items-baseline gap-2 min-w-0">
                  <span className="font-semibold text-neutral-900">{r.stock.ticker}</span>
                  <span className="text-[12px] text-muted-foreground truncate max-w-[180px]">{r.stock.company_name}</span>
                </Link>
              </td>
              <td className={`py-2 px-1 text-right font-bold tabular-nums ${getScoreColor(r.analysis.totalScore)}`}>{r.analysis.totalScore}</td>
              <td className="py-2 px-1 text-right hidden sm:table-cell">
                {r.delta === null ? <span className="text-[11px] text-muted-foreground">new</span> : <ScoreDelta delta={r.delta} />}
              </td>
              <td className="py-2 px-1 text-right">
                <Badge variant={RISK_BAND_VARIANT[r.analysis.risk.band]}>{r.analysis.risk.score}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
