import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import DashboardPage from '@/pages/DashboardPage';
import ExplorePage from '@/pages/ExplorePage';
import StockDetailPage from '@/pages/StockDetailPage';
import WatchlistsPage from '@/pages/WatchlistsPage';
import MethodologyPage from '@/pages/MethodologyPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { useAuth } from '@/components/auth/AuthProvider';
import { Skeleton } from '@/components/ui/skeleton';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const CatalystsPage = lazy(() => import('@/pages/CatalystsPage'));

function PageFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function CatalystsRoute() {
  const { user } = useAuth();
  return <CatalystsPage canEdit={!!user} currentUserId={user?.id ?? null} />;
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <AppShell>
      <ScrollToTop />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/stock/:ticker" element={<StockDetailPage />} />
          <Route path="/watchlists" element={<WatchlistsPage />} />
          <Route path="/catalysts" element={<CatalystsRoute />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
