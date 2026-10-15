import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { List, LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';

export function AccountMenu() {
  const { enabled, loading, user, signOut } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  // Close when navigating.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (!enabled || loading) return null;

  if (!user) {
    const next = `${location.pathname}${location.search}`;
    const href = location.pathname === '/login' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
    return (
      <Button asChild variant="outline" size="sm">
        <Link to={href}>Sign in</Link>
      </Button>
    );
  }

  const email = user.email ?? 'Signed in';
  const initial = (user.email?.trim()[0] ?? '?').toUpperCase();

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <div className="px-2 py-2">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate text-sm font-medium text-neutral-900" title={email}>
              {email}
            </p>
          </div>
          <div className="my-1 h-px bg-neutral-200" />
          <Link
            role="menuitem"
            to="/watchlists"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <List className="h-4 w-4" />
            My watchlists
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut().catch(() => undefined);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
