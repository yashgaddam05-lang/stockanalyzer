import { DIMENSIONS } from '@/lib/scoring';

export function DimensionTable() {
  const total = DIMENSIONS.reduce((a, d) => a + d.weight, 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-[12px] uppercase tracking-wide text-neutral-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Dimension</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Weight</th>
            <th scope="col" className="px-4 py-3 font-medium">Inputs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {DIMENSIONS.map((d) => (
            <tr key={d.key} data-dimension={d.key}>
              <td className="px-4 py-3 font-medium text-neutral-900">
                {d.label}
                {d.inputs.length === 0 && (
                  <span className="ml-2 rounded border border-neutral-200 bg-neutral-50 px-1.5 text-[10px] font-medium text-neutral-600">
                    Unavailable
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{d.weight}%</td>
              <td className="px-4 py-3 text-[13px] text-muted-foreground">
                {d.inputs.length ? (
                  <span className="font-mono text-[12px]">{d.inputs.join(', ')}</span>
                ) : (
                  'Not scored yet (requires macro data); weight re-normalized across the other dimensions'
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border bg-neutral-50">
          <tr>
            <th scope="row" className="px-4 py-3 font-medium text-neutral-900">Total</th>
            <td className="px-4 py-3 text-right font-medium tabular-nums text-neutral-900">{total}%</td>
            <td className="px-4 py-3 text-[13px] text-muted-foreground">{DIMENSIONS.length} dimensions</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
