import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, SlidersHorizontal, User, CreditCard } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useSignOutToHome } from '@/components/auth/use-sign-out';
import { Button } from '@/components/ui/button';

export function AccountMenu() {
  const { enabled, loading, user } = useAuth();
  const signOutToHome = useSignOutToHome();
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
    // Defensive: the app routes are gated, so this only shows if the session vanished mid-render.
    const href = `/login?next=${encodeURIComponent(next)}`;
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
            to="/app/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Account
          </Link>
          <Link
            role="menuitem"
            to="/app/welcome"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Personalize
          </Link>
          <Link
            role="menuitem"
            to="/app/billing"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Plan & billing
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              void signOutToHome().catch(() => undefined);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
