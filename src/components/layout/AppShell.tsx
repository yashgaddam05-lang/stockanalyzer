import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { NavBar } from '@/components/layout/NavBar';
import { Footer } from '@/components/layout/Footer';
import { Skeleton } from '@/components/ui/skeleton';

export function PageFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Signed-in app chrome. Used as a layout route (renders <Outlet/>) or with explicit children. */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <NavBar />
      <main className="flex-1 w-full mx-auto max-w-6xl px-4 sm:px-8 py-8">
        <Suspense fallback={<PageFallback />}>{children ?? <Outlet />}</Suspense>
      </main>
      <Footer />
    </div>
  );
}
