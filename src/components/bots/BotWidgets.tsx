import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Loader2 } from 'lucide-react';
import type { BotDef } from '@/lib/bots';
import { ApiError, createPortfolio, importPositions } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { Proj } from '@/components/bots/bots-data';
import { usd } from '@/components/bots/bots-data';


export function RangeBar({ label, p, max, color }: { label: string; p: Proj; max: number; color: string }) {
  const x = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-neutral-900">{label}</span>
        <span className="tabular-nums text-neutral-600">
          <strong className="text-neutral-900">{usd(p.mid)}</strong> likely · {usd(p.low)} to {usd(p.high)}
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-neutral-100">
        <div className="absolute inset-y-0 rounded-full opacity-30" style={{ left: x(p.low), width: `calc(${x(p.high)} - ${x(p.low)})`, background: color }} />
        <div className="absolute inset-y-[-2px] w-1 rounded-full" style={{ left: x(p.mid), background: color }} />
        <div className="absolute inset-y-0 w-px bg-neutral-400" style={{ left: x(10000) }} title="$10,000 starting value" />
      </div>
      <p className="text-[11px] text-neutral-500">{p.lossOdds}% of simulated paths ended below $10,000</p>
    </div>
  );
}

export function CopyToPortfolio({ bot, picks }: { bot: BotDef; picks: { ticker: string; price: number }[] }) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('10000');
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount.replace(/[$,]/g, ''));
  const valid = Number.isFinite(value) && value >= 100 && value <= 10_000_000 && picks.length > 0;

  async function copy() {
    setState('saving');
    setError(null);
    try {
      const portfolio = await createPortfolio(`${bot.name} bot`);
      const each = value / picks.length;
      await importPositions(
        portfolio.id,
        picks.map((p) => ({ ticker: p.ticker, shares: Math.round((each / p.price) * 10000) / 10000, cost_basis: Math.round(p.price * 100) / 100 }))
      );
      setState('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the portfolio. Please try again.');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-[13px] text-emerald-800">
          <Check className="h-4 w-4" aria-hidden="true" /> Created a simulated &ldquo;{bot.name} bot&rdquo; portfolio with {picks.length} positions.
        </p>
        <Button size="sm" onClick={() => navigate('/app/portfolios')}>
          Open portfolio
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-border bg-neutral-50 p-4">
      <p className="text-[13px] font-semibold text-neutral-900">Follow this bot in a simulated portfolio</p>
      <p className="text-[12px] text-neutral-600">
        Splits a pretend amount equally across today&apos;s picks at current prices so you can track how the bot does from here. No real money,
        no brokerage, no orders.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-[13px] text-neutral-700">
          Amount
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="w-32 rounded-md border border-border bg-background px-2 py-1.5 text-[13px] tabular-nums"
            aria-label="Simulated amount in dollars"
          />
        </label>
        <Button size="sm" onClick={() => void copy()} disabled={!valid || state === 'saving'} className="gap-1.5">
          {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          Copy {picks.length} picks to a new portfolio
        </Button>
      </div>
      {error && <p className="text-[12px] text-red-700">{error}</p>}
    </div>
  );
}

