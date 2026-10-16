import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AlertCircle, Check, Menu, RefreshCw, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { useStocks } from '@/components/data/StocksProvider';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/explore', label: 'Explore', end: false },
  { to: '/app/watchlists', label: 'Watchlists', end: false },
  { to: '/app/catalysts', label: 'Catalysts', end: false },
  // Public page, outside the app shell.
  { to: '/methodology', label: 'Methodology', end: false },
];

type RefreshMsg = { type: 'success' | 'error'; text: string };

export function NavBar() {
  const { refresh, refreshing, lastRefreshed } = useStocks();
  const [menuOpen, setMenuOpen] = useState(false);
  const [msg, setMsg] = useState<RefreshMsg | null>(null);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  const handleRefresh = async () => {
    setMsg(null);
    try {
      const data = await refresh();
      const updated = data.updated ?? 0;
      const total = data.total ?? 0;
      if (updated === 0 && total > 0) {
        setMsg({ type: 'error', text: 'Yahoo Finance did not return any data. Try again later.' });
      } else {
        setMsg({ type: 'success', text: `Updated ${updated} of ${total} stocks with live market data.` });
      }
    } catch {
      setMsg({ type: 'error', text: 'Could not reach the refresh service. Please try again.' });
    }
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
      isActive ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
    );

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link to="/app" className="flex items-center gap-2" aria-label="3x Hunter dashboard">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900">
            <TrendingUp className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[15px] font-semibold tracking-tight">3x Hunter</p>
            <p className="-mt-0.5 hidden text-[11px] text-muted-foreground sm:block">Opportunity Scanner</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground lg:inline">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 gap-2 text-[13px]"
            aria-label="Refresh market data"
            title="Pull live prices, momentum, and volatility from Yahoo Finance"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
          <AccountMenu />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <nav id="mobile-nav" className="border-t border-border px-4 py-2 md:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      {msg && (
        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-8" role="status">
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px]',
              msg.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            )}
          >
            {msg.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {msg.text}
          </div>
        </div>
      )}
    </header>
  );
}
