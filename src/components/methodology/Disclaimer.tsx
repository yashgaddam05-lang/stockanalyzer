import { Card } from '@/components/ui/card';

export function Disclaimer() {
  return (
    <Card className="space-y-3 border-neutral-300 p-6">
      <p className="text-sm font-medium text-neutral-900">
        3x Hunter is an educational research tool. Nothing on this site is investment advice.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-700">
        <li>The content on this site is for informational and educational purposes only and is not investment advice.</li>
        <li>3x Hunter and its authors are not a registered investment adviser or broker-dealer.</li>
        <li>Nothing here is a recommendation to buy, sell or hold any security.</li>
        <li>
          Scores, risk ratings, cases and probabilities are hypothetical model outputs. They may be wrong and are not
          forecasts of any specific result.
        </li>
        <li>Market data may be delayed, inaccurate or incomplete.</li>
        <li>
          Past performance and back-of-envelope probabilities do not predict future results. Investing involves risk,
          including the loss of principal.
        </li>
        <li>Consult a licensed financial professional before making any investment decision.</li>
        <li>You use this site and its outputs at your own risk.</li>
      </ul>
    </Card>
  );
}
