import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { NavBar } from '@/components/layout/NavBar';
import { Footer } from '@/components/layout/Footer';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingGate } from '@/components/auth/OnboardingGate';
import { AssistantProvider } from '@/components/assistant/AssistantProvider';

// Loaded after the page so chat code never delays first paint or sign-in.
const AssistantWidget = lazy(() => import('@/components/assistant/AssistantWidget').then((m) => ({ default: m.AssistantWidget })));

export function PageFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Signed-in app chrome. Used as a layout route (renders <Outlet/>) or with explicit children.
 * Must render inside <PreferencesProvider> (the onboarding gate reads preferences).
 */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <AssistantProvider>
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <NavBar />
      <main className="flex-1 w-full mx-auto max-w-6xl px-4 sm:px-8 py-8">
        <OnboardingGate fallback={<PageFallback />}>
          <Suspense fallback={<PageFallback />}>{children ?? <Outlet />}</Suspense>
        </OnboardingGate>
      </main>
      <Footer />
      <Suspense fallback={null}>
        <AssistantWidget />
      </Suspense>
    </div>
    </AssistantProvider>
  );
}
