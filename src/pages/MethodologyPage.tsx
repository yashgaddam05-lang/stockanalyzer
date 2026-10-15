import { Card } from '@/components/ui/card';

export default function MethodologyPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Methodology</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The 3x Opportunity Score is a 0-100 heuristic that combines revenue growth, momentum, innovation (R&amp;D
          intensity and pipeline), and financial health (debt, cash runway, volatility). Higher scores indicate a
          stronger fit for the model, not a guaranteed outcome.
        </p>
      </div>

      <section id="disclaimer" className="scroll-mt-24">
        <Card className="space-y-3 p-6">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Disclaimer</h2>
          <p className="text-sm text-neutral-700">
            Educational research tool. Not investment advice. Scores are model outputs and may be wrong.
          </p>
          <p className="text-sm text-muted-foreground">
            Market data comes from Yahoo Finance unofficial endpoints and is refreshed on demand. Rows marked Seed are
            approximate placeholders. Always do your own research before making any investment decision.
          </p>
        </Card>
      </section>
    </div>
  );
}
