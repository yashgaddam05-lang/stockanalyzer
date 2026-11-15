import { Link } from 'react-router-dom';
import { BellOff, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AlertEvent } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { KIND_LABELS, relativeTime } from '@/components/alerts/alert-utils';

export interface NotificationsFeedProps {
  events: AlertEvent[];
  loading: boolean;
  unreadCount: number;
  busyIds: Set<string>;
  markingAll: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationsFeed({
  events,
  loading,
  unreadCount,
  busyIds,
  markingAll,
  onMarkRead,
  onMarkAllRead,
}: NotificationsFeedProps) {
  if (loading) {
    return (
      <Card className="divide-y divide-neutral-100" aria-busy="true" aria-label="Loading notifications">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <BellOff className="h-8 w-8 text-neutral-400" aria-hidden="true" />
        <p className="text-sm font-medium text-neutral-900">No notifications yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          When one of your alert rules triggers, it will show up here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={unreadCount === 0 || markingAll}
          onClick={onMarkAllRead}
        >
          <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
          Mark all read
        </Button>
      </div>
      <Card>
        <ul className="divide-y divide-neutral-100">
          {events.map((ev) => {
            const unread = ev.read_at === null;
            return (
              <li
                key={ev.id}
                className={cn('flex items-start gap-3 p-4', unread && 'bg-neutral-50')}
              >
                <span
                  aria-hidden="true"
                  className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-neutral-900' : 'bg-transparent')}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      to={ev.kind.startsWith('paper_') ? '/app/paper' : `/app/stock/${encodeURIComponent(ev.ticker)}`}
                      className="font-mono text-sm font-semibold text-neutral-900 hover:underline"
                    >
                      {ev.ticker}
                    </Link>
                    <span className="text-xs text-muted-foreground">{KIND_LABELS[ev.kind] ?? ev.kind}</span>
                    {unread && <span className="sr-only">Unread</span>}
                  </div>
                  <p className={cn('mt-1 text-sm', unread ? 'text-neutral-900' : 'text-neutral-600')}>{ev.message}</p>
                  <time dateTime={ev.triggered_at} className="mt-1 block text-xs text-muted-foreground">
                    {relativeTime(ev.triggered_at)}
                  </time>
                </div>
                {unread && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Mark ${ev.ticker} notification as read`}
                    disabled={busyIds.has(ev.id) || markingAll}
                    onClick={() => onMarkRead(ev.id)}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
