import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { getAlertEvents } from '@/lib/api';
import { useLoad } from '@/components/dashboard/useLoad';
import { CardEmpty, CardError, CardSkeleton, PersonalCard } from '@/components/dashboard/PersonalCard';
import { cn } from '@/lib/utils';

const LIMIT = 5;

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function MyAlertsCard() {
  const [state, retry] = useLoad(() => getAlertEvents({ limit: 25 }));

  const { events, unread } = useMemo(() => {
    if (state.status !== 'ready' || !state.data?.available) return { events: [], unread: 0 };
    const list = [...(state.data.events ?? [])].sort(
      (a, b) => Number(a.read_at !== null) - Number(b.read_at !== null) || Date.parse(b.triggered_at) - Date.parse(a.triggered_at)
    );
    return { events: list.slice(0, LIMIT), unread: state.data.unread_count ?? list.filter((e) => !e.read_at).length };
  }, [state]);

  return (
    <PersonalCard
      icon={<Bell className="h-4 w-4 text-neutral-500" aria-hidden="true" />}
      title="Your alerts"
      href="/app/alerts"
      linkLabel="View all alerts"
      badge={
        unread > 0 ? (
          <span className="rounded-md bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
            {unread} new
          </span>
        ) : undefined
      }
    >
      {state.status === 'loading' ? (
        <CardSkeleton />
      ) : state.status === 'error' ? (
        <CardError what="alerts" onRetry={retry} />
      ) : events.length === 0 ? (
        <CardEmpty
          message="No alerts have triggered. Get notified when a score or price crosses your level."
          ctaLabel="Create an alert"
          ctaHref="/app/alerts"
        />
      ) : (
        <ul className="divide-y divide-border" data-testid="my-alerts">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2 py-2">
              <span
                className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', e.read_at ? 'bg-neutral-200' : 'bg-neutral-900')}
                aria-label={e.read_at ? 'Read' : 'Unread'}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <Link to={`/app/stock/${encodeURIComponent(e.ticker)}`} className="text-[13px] font-semibold text-neutral-900 hover:underline">
                    {e.ticker}
                  </Link>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(e.triggered_at)}</span>
                </div>
                <p className={cn('truncate text-[12px]', e.read_at ? 'text-muted-foreground' : 'text-neutral-700')} title={e.message}>
                  {e.message}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PersonalCard>
  );
}
