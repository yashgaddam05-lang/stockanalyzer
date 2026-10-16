import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { getAlertEvents, markAlertEventsRead } from '@/lib/api';
import type { AlertEvent } from '@/lib/supabase';
import { relativeTime } from '@/components/alerts/alert-utils';

const POLL_MS = 5 * 60 * 1000;

export function NotificationBell() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [available, setAvailable] = useState(true);
  const [marking, setMarking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getAlertEvents({ unreadOnly: true, limit: 10 });
      setAvailable(data.available);
      setEvents(data.events);
      setUnread(data.unread_count);
    } catch {
      // 401 / network errors: keep the bell quiet.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const markAll = async () => {
    setMarking(true);
    try {
      await markAlertEventsRead('all');
      setEvents([]);
      setUnread(0);
    } catch {
      // Silent: the next poll reconciles.
    } finally {
      setMarking(false);
    }
  };

  const badge = unread > 9 ? '9+' : String(unread);
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-semibold leading-none text-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Unread notifications"
          className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">Notifications</p>
            {events.length > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                disabled={marking}
                className="text-xs font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {!available ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                Alerts will be available after the next database update
              </li>
            ) : events.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">No unread notifications</li>
            ) : (
              events.map((ev) => (
                <li key={ev.id} className="border-b border-neutral-100 last:border-0">
                  <Link
                    to={`/app/stock/${encodeURIComponent(ev.ticker)}`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-neutral-900">{ev.ticker}</span>
                      <time dateTime={ev.triggered_at} className="text-[11px] text-muted-foreground">
                        {relativeTime(ev.triggered_at)}
                      </time>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-neutral-700">{ev.message}</p>
                  </Link>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-neutral-100 px-4 py-2.5 text-center">
            <Link
              to="/app/alerts"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-neutral-900 hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
