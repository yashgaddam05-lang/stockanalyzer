import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell, PageFallback } from '@/components/layout/AppShell';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { StocksProvider } from '@/components/data/StocksProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { MarketingLayout } from '@/components/marketing/MarketingLayout';
import LandingPage from '@/pages/marketing/LandingPage';
import NotFoundPage from '@/pages/NotFoundPage';

// Public pages (the landing page is eager for first paint).
const PricingPage = lazy(() => import('@/pages/marketing/PricingPage'));
const LegalPage = lazy(() => import('@/pages/marketing/LegalPage'));
const MethodologyPage = lazy(() => import('@/pages/MethodologyPage'));

// Auth pages.
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));

// Signed-in app: kept out of the marketing bundle.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ExplorePage = lazy(() => import('@/pages/ExplorePage'));
const StockDetailPage = lazy(() => import('@/pages/StockDetailPage'));
const WatchlistsPage = lazy(() => import('@/pages/WatchlistsPage'));
const CatalystsPage = lazy(() => import('@/pages/CatalystsPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));

/** Suspense boundary per lazy public page, so the marketing layout stays on screen while it loads. */
function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <PageFallback />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function CatalystsRoute() {
  const { user } = useAuth();
  return <CatalystsPage canEdit={!!user} currentUserId={user?.id ?? null} />;
}

/** Redirects a legacy top-level path to its /app equivalent, keeping the query string and hash. */
function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

function LegacyStockRedirect() {
  const { ticker = '' } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`/app/stock/${encodeURIComponent(ticker)}${search}${hash}`} replace />;
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
    <>
      <ScrollToTop />
      <Routes>
        {/* Public marketing site */}
        <Route element={<MarketingLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="pricing" element={<Lazy><PricingPage /></Lazy>} />
          <Route path="methodology" element={<Lazy><MethodologyPage /></Lazy>} />
          <Route path="legal/disclaimer" element={<Lazy><LegalPage doc="disclaimer" /></Lazy>} />
          <Route path="legal/terms" element={<Lazy><LegalPage doc="terms" /></Lazy>} />
          <Route path="legal/privacy" element={<Lazy><LegalPage doc="privacy" /></Lazy>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Auth */}
        <Route element={<AuthLayout />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
        </Route>

        {/* Signed-in app */}
        <Route element={<RequireAuth />}>
          <Route
            path="app"
            element={
              <StocksProvider>
                <AppShell />
              </StocksProvider>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="stock/:ticker" element={<StockDetailPage />} />
            <Route path="watchlists" element={<WatchlistsPage />} />
            <Route path="catalysts" element={<CatalystsRoute />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="*" element={<NotFoundPage homeHref="/app" homeLabel="Back to dashboard" />} />
          </Route>
        </Route>

        {/* Legacy paths: keep old links and bookmarks working */}
        <Route path="dashboard" element={<LegacyRedirect to="/app" />} />
        <Route path="explore" element={<LegacyRedirect to="/app/explore" />} />
        <Route path="stock/:ticker" element={<LegacyStockRedirect />} />
        <Route path="watchlists" element={<LegacyRedirect to="/app/watchlists" />} />
        <Route path="catalysts" element={<LegacyRedirect to="/app/catalysts" />} />
      </Routes>
    </>
  );
}
