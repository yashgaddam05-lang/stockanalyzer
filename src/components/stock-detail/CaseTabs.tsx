import type { AnalysisResult } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ORDER = [
  { key: 'bull', label: 'Bull' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'bear', label: 'Bear' },
] as const;

export function CaseTabs({ analysis }: { analysis: AnalysisResult }) {
  return (
    <Card className="p-6">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">Scenarios</h2>
      <Tabs defaultValue="neutral">
        <TabsList aria-label="Bull, neutral and bear cases">
          {ORDER.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="text-[13px]">
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {ORDER.map((c) => {
          const data = analysis.cases[c.key];
          return (
            <TabsContent key={c.key} value={c.key} className="pt-2">
              <h3 className="text-[13px] font-semibold text-neutral-900">{data.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-neutral-700">{data.summary}</p>
              {data.points.length > 0 && (
                <ul className="mt-3 space-y-1 text-[13px] text-neutral-700">
                  {data.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-neutral-400" aria-hidden="true" />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </Card>
  );
}
