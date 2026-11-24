import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AlertCircle, Check, Globe, Lock, Menu, RefreshCw, Search, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { NotificationBell } from '@/components/alerts/NotificationBell';
import { useStocks } from '@/components/data/StocksProvider';
import { StockSearch } from '@/components/search/StockSearch';
import type { StockSearchHandle } from '@/components/search/StockSearch';
import { cn } from '@/lib/utils';
import { InstallAppButton } from '@/components/app-install/InstallApp';
import { TickerBar } from '@/components/layout/TickerBar';
import { MegaMenu } from '@/components/layout/MegaMenu';
import { ALL_PRIVATE, PRIVATE_COLUMNS, PRIVATE_TOP, PUBLIC_MARKETS } from '@/components/layout/site-nav';

const NAV_ITEMS = ALL_PRIVATE;

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
      if (window.matchMedia('(min-width: 1536px)').matches) desktopSearchRef.current?.focus();
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
    <header className="nav-dark sticky top-0 z-30 border-b border-[hsl(var(--bronze)/0.35)] bg-[hsl(var(--ink))] text-white">
      <TickerBar />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link to="/app" className="flex shrink-0 items-center gap-2" aria-label="3x Hunter dashboard">
          <div className="flex h-8 w-8 items-center justify-center border border-white/80">
            <TrendingUp className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="whitespace-nowrap font-display text-[19px] font-semibold uppercase leading-none tracking-[0.2em]">3x Hunter</p>
            <p className="mt-0.5 hidden whitespace-nowrap text-[9px] uppercase tracking-[0.3em] text-neutral-400 xl:block">Opportunity Scanner</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Your account">
          {PRIVATE_TOP.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
          <MegaMenu
            label="My tools"
            tone="private"
            active={PRIVATE_COLUMNS.some((c) => c.items.some((i) => i.to !== '/app' && location.pathname.startsWith(i.to))) && !PRIVATE_TOP.some((t) => t.to !== '/app' && location.pathname.startsWith(t.to))}
            columns={PRIVATE_COLUMNS}
            intro={{ eyebrow: 'Your account · private', title: 'Your 3x Hunter', body: 'Everything here is tied to your login: lists, portfolios, bots, alerts and billing. Only you can see it.' }}
          />
          <MegaMenu
            label="Public site"
            tone="public"
            columns={PUBLIC_MARKETS}
            intro={{ eyebrow: 'Open to everyone', title: 'The public site', body: 'News, methodology, track record and pricing. No login needed, safe to share.' }}
          />
        </nav>

        <div className="nav-controls flex items-center gap-2">
          <StockSearch
            ref={desktopSearchRef}
            compact
            placeholder="Search stocks"
            className="nav-search hidden w-44 2xl:block"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 2xl:hidden"
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
          <InstallAppButton className="hidden 2xl:inline-flex" />
          <NotificationBell />
          <AccountMenu />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 xl:hidden"
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
        <div id="mobile-search" className="nav-search border-t border-white/10 px-4 py-3 sm:px-8 2xl:hidden">
          <div className="mx-auto max-w-6xl">
            <StockSearch autoFocus placeholder="Search any US stock or ETF" onDismiss={() => setSearchOpen(false)} />
          </div>
        </div>
      )}

      {menuOpen && (
        <nav id="mobile-nav" className="border-t border-white/10 px-4 py-2 xl:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            <p className="mega-eyebrow px-3 pt-2 text-[hsl(var(--bronze))]"><Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />Your account</p>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
            <p className="mega-eyebrow mt-2 border-t border-white/10 px-3 pt-3 text-[hsl(var(--live))]"><Globe className="mr-1 inline h-3 w-3" aria-hidden="true" />Public site</p>
            {PUBLIC_MARKETS.flatMap((c) => c.items).filter((i) => !i.to.startsWith('/#')).map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
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
