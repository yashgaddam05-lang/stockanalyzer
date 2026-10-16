import { Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Loader2, TrendingUp } from 'lucide-react';

function AuthFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Loading
    </div>
  );
}

/** Centered, distraction-free frame for auth pages and auth-related errors. No app nav. */
export function AuthLayoutFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-foreground">
      <header className="px-4 py-6 sm:px-8">
        <Link to="/" className="mx-auto flex w-fit items-center gap-2" aria-label="3x Hunter home">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900">
            <TrendingUp className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-neutral-900">3x Hunter</span>
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:pt-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>
      <footer className="px-4 pb-8 text-center text-[11px] text-muted-foreground">
        <p>Educational research tool. Not investment advice.</p>
        <nav className="mt-2 flex justify-center gap-4" aria-label="Legal">
          <Link to="/legal/terms" className="hover:text-neutral-900 hover:underline">
            Terms
          </Link>
          <Link to="/legal/privacy" className="hover:text-neutral-900 hover:underline">
            Privacy
          </Link>
          <Link to="/legal/disclaimer" className="hover:text-neutral-900 hover:underline">
            Disclaimer
          </Link>
        </nav>
      </footer>
    </div>
  );
}

/** Layout route for /login, /signup, /forgot-password, /reset-password. */
export function AuthLayout() {
  return (
    <AuthLayoutFrame>
      <Suspense fallback={<AuthFallback />}>
        <Outlet />
      </Suspense>
    </AuthLayoutFrame>
  );
}

/** Sets document.title for the lifetime of a page. */
// eslint-disable-next-line react-refresh/only-export-components
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · 3x Hunter`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
