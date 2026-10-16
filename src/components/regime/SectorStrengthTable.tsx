import { useMemo } from 'react';
import type { SectorStrength } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { fmtSigned, isFiniteNumber, signClass } from '@/components/regime/regime-format';

const ETF_NAMES: Record<string, string> = {
  QQQ: 'Nasdaq 100',
  IWM: 'Russell 2000',
  XLK: 'Technology',
  XLV: 'Health care',
  XBI: 'Biotech',
  XLF: 'Financials',
  XLE: 'Energy',
  XLI: 'Industrials',
  XLY: 'Consumer discretionary',
  XLP: 'Consumer staples',
  XLU: 'Utilities',
  XLB: 'Materials',
  XLRE: 'Real estate',
  XLC: 'Communication',
  SMH: 'Semiconductors',
  IGV: 'Software',
  ITA: 'Aerospace and defense',
  ICLN: 'Clean energy',
  TAN: 'Solar',
  ARKK: 'Innovation',
};

export function SectorStrengthTable({ strength }: { strength: Record<string, SectorStrength> | null | undefined }) {
  const rows = useMemo(() => {
    const list = Object.entries(strength ?? {}).map(([key, s]) => ({
      etf: s?.etf || key,
      return_63d: s?.return_63d ?? null,
      relative_63d: s?.relative_63d ?? null,
    }));
    return list.sort((a, b) => {
      const av = isFiniteNumber(a.relative_63d) ? a.relative_63d : -Infinity;
      const bv = isFiniteNumber(b.relative_63d) ? b.relative_63d : -Infinity;
      return bv - av || a.etf.localeCompare(b.etf);
    });
  }, [strength]);

  if (rows.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No sector data in this snapshot.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="py-1.5 font-medium">ETF</th>
            <th scope="col" className="py-1.5 text-right font-medium">3m return</th>
            <th scope="col" className="py-1.5 text-right font-medium">vs SPY</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((r) => (
            <tr key={r.etf}>
              <td className="py-1.5">
                <span className="font-medium text-neutral-900">{r.etf}</span>
                {ETF_NAMES[r.etf] && <span className="ml-2 text-muted-foreground">{ETF_NAMES[r.etf]}</span>}
              </td>
              <td className={cn('py-1.5 text-right tabular-nums', signClass(r.return_63d))}>{fmtSigned(r.return_63d, 1, '%')}</td>
              <td className={cn('py-1.5 text-right font-medium tabular-nums', signClass(r.relative_63d))}>
                {fmtSigned(r.relative_63d, 1, ' pts')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
