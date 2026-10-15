import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import DashboardPage from '@/pages/DashboardPage';
import ExplorePage from '@/pages/ExplorePage';
import StockDetailPage from '@/pages/StockDetailPage';
import WatchlistsPage from '@/pages/WatchlistsPage';
import MethodologyPage from '@/pages/MethodologyPage';
import NotFoundPage from '@/pages/NotFoundPage';

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
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/stock/:ticker" element={<StockDetailPage />} />
        <Route path="/watchlists" element={<WatchlistsPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
