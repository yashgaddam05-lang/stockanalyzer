import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DataProvider } from '@/lib/store';
import { Layout } from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Explore from '@/pages/Explore';

const StockDetail = lazy(() => import('@/pages/StockDetail'));
const Watchlists = lazy(() => import('@/pages/Watchlists'));
const Methodology = lazy(() => import('@/pages/Methodology'));
const NotFound = lazy(() => import('@/pages/NotFound'));

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="explore" element={<Explore />} />
              <Route path="stock/:ticker" element={<StockDetail />} />
              <Route path="watchlists" element={<Watchlists />} />
              <Route path="methodology" element={<Methodology />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </DataProvider>
    </BrowserRouter>
  );
}
