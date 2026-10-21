import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { getCatalysts } from '@/lib/api';
import { useLoad } from '@/components/dashboard/useLoad';
import { CardEmpty, CardError, CardSkeleton, PersonalCard } from '@/components/dashboard/PersonalCard';

const WINDOW_DAYS = 14;
const LIMIT = 6;

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface UpcomingCatalystsCardProps {
  /** Tickers the user follows. When empty, falls back to `fallbackTickers`. */
  myTickers: Set<string>;
  /** Tickers in the active dashboard scope. */
  fallbackTickers: Set<string>;
  fallbackLabel: string;
}

export function UpcomingCatalystsCard({ myTickers, fallbackTickers, fallbackLabel }: UpcomingCatalystsCardProps) {
  const range = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + WINDOW_DAYS);
    return { from: ymd(now), to: ymd(end) };
  }, []);
  const [state, retry] = useLoad(() => getCatalysts({ from: range.from, to: range.to, limit: 500 }), [range.from, range.to]);

  const usingMine = myTickers.size > 0;
  const tickers = usingMine ? myTickers : fallbackTickers;

  const events = useMemo(() => {
    if (state.status !== 'ready' || !state.data?.available) return [];
    return (state.data.catalysts ?? [])
      .filter((c) => tickers.has(c.ticker.toUpperCase()) && c.event_date >= range.from && c.event_date <= range.to)
      .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.ticker.localeCompare(b.ticker));
  }, [state, tickers, range]);

  return (
    <PersonalCard
      icon={<CalendarClock className="h-4 w-4 text-neutral-500" aria-hidden="true" />}
      title="Upcoming catalysts"
      href="/app/catalysts"
      linkLabel="View all catalysts"
    >
      {state.status === 'loading' ? (
        <CardSkeleton />
      ) : state.status === 'error' ? (
        <CardError what="catalysts" onRetry={retry} />
      ) : events.length === 0 ? (
        <CardEmpty
          message={`No catalysts in the next ${WINDOW_DAYS} days for ${usingMine ? 'your stocks' : fallbackLabel}.`}
          ctaLabel="Open catalyst calendar"
          ctaHref="/app/catalysts"
        />
      ) : (
        <div className="space-y-2" data-testid="upcoming-catalysts">
          <ul className="divide-y divide-border">
            {events.slice(0, LIMIT).map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span className="w-12 shrink-0 text-[11px] font-medium tabular-nums text-neutral-700">{fmtDay(c.event_date)}</span>
                <div className="min-w-0 flex-1">
                  <Link to={`/app/stock/${encodeURIComponent(c.ticker)}`} className="text-[13px] font-semibold text-neutral-900 hover:underline">
                    {c.ticker}
                  </Link>
                  <p className="truncate text-[12px] text-muted-foreground" title={c.title}>
                    {c.title}
                    {c.date_status === 'estimated' && ' (est.)'}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-neutral-600">
                  {c.event_type}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Next {WINDOW_DAYS} days · {usingMine ? 'your stocks' : fallbackLabel}
            {events.length > LIMIT && ` · ${events.length - LIMIT} more`}
          </p>
        </div>
      )}
    </PersonalCard>
  );
}
