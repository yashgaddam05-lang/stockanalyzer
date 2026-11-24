import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AlertCircle, Check, ChevronDown, Menu, RefreshCw, Search, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { NotificationBell } from '@/components/alerts/NotificationBell';
import { useStocks } from '@/components/data/StocksProvider';
import { StockSearch } from '@/components/search/StockSearch';
import type { StockSearchHandle } from '@/components/search/StockSearch';
import { cn } from '@/lib/utils';
import { InstallAppButton } from '@/components/app-install/InstallApp';
import { TickerBar } from '@/components/layout/TickerBar';

type NavItem = { to: string; label: string; end: boolean };

// Shown inline on desktop.
const PRIMARY_ITEMS: NavItem[] = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/explore', label: 'Explore', end: false },
  { to: '/app/news', label: 'News', end: false },
  { to: '/app/watchlists', label: 'Watchlists', end: false },
  { to: '/app/portfolios', label: 'Portfolios', end: false },
  { to: '/app/alerts', label: 'Alerts', end: false },
];

// Grouped under "More" on desktop to avoid overflow.
const MORE_ITEMS: NavItem[] = [
  { to: '/app/catalysts', label: 'Catalysts', end: false },
  { to: '/app/market', label: 'Market', end: false },
  { to: '/app/goal', label: '3x Goal Planner', end: false },
  { to: '/app/paper', label: 'Paper accounts', end: false },
  { to: '/app/temperament', label: 'Investor temperament', end: false },
  { to: '/app/bots', label: '3x Bots', end: false },
  { to: '/app/track-record', label: 'Track record', end: false },
  { to: '/app/backtest', label: 'Backtest', end: false },
  { to: '/app/data-health', label: 'Data health', end: false },
  // Public page, outside the app shell.
  { to: '/methodology', label: 'Methodology', end: false },
];

const NAV_ITEMS: NavItem[] = [...PRIMARY_ITEMS, ...MORE_ITEMS];

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const active = MORE_ITEMS.some((item) => location.pathname.startsWith(item.to));

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        className={cn(
          'nav-link inline-flex items-center gap-1',
          active && 'nav-link-active'
        )}
      >
        More
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <ul
          id={menuId}
          className="absolute right-0 top-full z-40 mt-1 min-w-[180px] rounded-lg border border-border bg-background p-1 shadow-lg"
        >
          {MORE_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'block rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                    isActive ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                  )
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type RefreshMsg = { type: 'success' | 'error'; text: string };

export function NavBar() {
  const { refresh, refreshing, lastRefreshed } = useStocks();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [msg, setMsg] = useState<RefreshMsg | null>(null);
  const location = useLocation();
  const desktopSearchRef = useRef<StockSearchHandle>(null);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  // "/" focuses the search box from anywhere (unless the user is typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      if (window.matchMedia('(min-width: 1280px)').matches) desktopSearchRef.current?.focus();
      else setSearchOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
      'nav-link',
      isActive && 'nav-link-active'
    );

  return (
    <header className="nav-dark sticky top-0 z-30 border-b border-black bg-neutral-950 text-white">
      <TickerBar />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link to="/app" className="flex shrink-0 items-center gap-2" aria-label="3x Hunter dashboard">
          <div className="flex h-8 w-8 items-center justify-center border border-white/80">
            <TrendingUp className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="whitespace-nowrap font-display text-[19px] font-semibold uppercase leading-none tracking-[0.2em]">3x Hunter</p>
            <p className="mt-0.5 hidden whitespace-nowrap text-[9px] uppercase tracking-[0.3em] text-neutral-400 xl:block">Opportunity Scanner</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {PRIMARY_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
          <MoreMenu />
        </nav>

        <div className="nav-controls flex items-center gap-2">
          <StockSearch
            ref={desktopSearchRef}
            compact
            placeholder="Search stocks"
            className="nav-search hidden w-48 xl:block"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 xl:hidden"
            onClick={() => {
              setSearchOpen((v) => !v);
              setMenuOpen(false);
            }}
            aria-label={searchOpen ? 'Close search' : 'Search stocks'}
            aria-expanded={searchOpen}
            aria-controls="mobile-search"
          >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 gap-2 text-[13px]"
            aria-label="Refresh market data"
            title={`Pull live prices, momentum, and volatility from Yahoo Finance${lastRefreshed ? ` (updated ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}`}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline xl:hidden">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
          <InstallAppButton className="hidden lg:inline-flex" />
          <NotificationBell />
          <AccountMenu />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 lg:hidden"
            onClick={() => {
              setMenuOpen((v) => !v);
              setSearchOpen(false);
            }}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {searchOpen && (
        <div id="mobile-search" className="nav-search border-t border-white/10 px-4 py-3 sm:px-8 xl:hidden">
          <div className="mx-auto max-w-6xl">
            <StockSearch autoFocus placeholder="Search any US stock or ETF" onDismiss={() => setSearchOpen(false)} />
          </div>
        </div>
      )}

      {menuOpen && (
        <nav id="mobile-nav" className="border-t border-white/10 px-4 py-2 lg:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
            <InstallAppButton variant="ghost" label="Install the app" className="justify-start px-3" />
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
