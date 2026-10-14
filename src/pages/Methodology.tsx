import { DIMENSIONS, PRESET_SCREENS, SECTOR_REGIME_FIT } from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function Methodology() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2 pt-2">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Methodology and disclosures</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          3x Hunter ranks a curated universe of stocks by a transparent 0-100 3x Opportunity Score. Every input is visible on the stock page,
          and every weight is listed below. It is a screening and research tool, not a recommendation engine.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold text-neutral-900">3x Opportunity Score</h3>
        <Card className="border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-neutral-50">
                <th className="text-left font-medium px-4 py-2">Dimension</th>
                <th className="text-right font-medium px-4 py-2">Weight</th>
                <th className="text-left font-medium px-4 py-2 hidden sm:table-cell">Inputs</th>
              </tr>
            </thead>
            <tbody>
              {DIMENSIONS.map((d) => (
                <tr key={d.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-neutral-900">{d.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{d.weight}%</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{d.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Each dimension is normalized to 0-1 and multiplied by its weight. Catalyst Strength, Market Position, and Market Regime Fit currently rely on
          proxy signals (pipeline counts, scale, sector assumptions) and are labeled "proxy" on stock pages. Valuation Upside uses analyst targets and
          growth-adjusted multiples when available, and falls back to size headroom otherwise.
        </p>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          The "heuristic 3x odds" figure is a scaled transformation of the score, capped at 75%. It is not a statistical probability and has not been backtested.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold text-neutral-900">Risk score</h3>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          An independent 0-100 score (higher is riskier): volatility 30, beta 15, leverage 15, cash runway 15, small size 15, unprofitability 10.
          Bands: Low under 30, Moderate 30-49, High 50-69, Extreme 70+.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold text-neutral-900">Scenarios</h3>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Bull case is a 3x by definition. Base case compounds a blended expected return from revenue growth, valuation, and momentum over the stated horizon.
          Bear case applies a drawdown scaled to the risk score. These are mechanical illustrations, not forecasts.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold text-neutral-900">Market regime assumptions</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SECTOR_REGIME_FIT).sort((a, b) => b[1] - a[1]).map(([s, v]) => (
            <span key={s} className="text-[12px] px-2 py-1 rounded-md border border-border text-neutral-700">
              {s} <span className="text-muted-foreground tabular-nums">{Math.round(v * 100)}</span>
            </span>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">Editorial sector tailwind ratings, reviewed manually. Not derived from macro data yet.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold text-neutral-900">Preset screens</h3>
        <ul className="space-y-1.5">
          {PRESET_SCREENS.map((p) => (
            <li key={p.id} className="text-[13px] text-muted-foreground"><span className="font-medium text-neutral-900">{p.label}:</span> {p.description}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-[15px] font-semibold text-neutral-900">Data sources</h3>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Prices, market cap, beta, growth rates, forward P/E, price/sales, and mean analyst targets come from Yahoo Finance public endpoints when you press
          Refresh. Momentum and volatility are calculated from 3 months of daily closes. Pipeline counts, R&D intensity, cash runway, theses, and sector labels
          are curated seed data. Data may be delayed, incomplete, or wrong. Yahoo Finance is not affiliated with and does not endorse this tool.
        </p>
      </section>

      <Separator />

      <section className="space-y-2">
        <h3 className="text-[15px] font-semibold text-neutral-900">Important disclosures</h3>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          3x Hunter is an educational research and screening tool. It does not provide personalized investment advice, is not a registered investment adviser,
          and does not recommend buying or selling any security. Scores, scenarios, and probabilities describe model outputs, not expected returns. Investing in
          small-cap, pre-revenue, and highly volatile stocks can result in the loss of your entire investment. Past performance does not guarantee future results.
          Do your own research and consider consulting a licensed financial professional.
        </p>
      </section>
    </div>
  );
}
