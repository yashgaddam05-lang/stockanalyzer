import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useData } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { TrendingUp, RefreshCw, Check, AlertCircle, LayoutDashboard, Compass, Star, BookOpen, Menu, X } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/explore', label: 'Explore', icon: Compass, end: false },
  { to: '/watchlists', label: 'Watchlists', icon: Star, end: false },
  { to: '/methodology', label: 'Methodology', icon: BookOpen, end: false },
];

export function Layout() {
  const { refresh, refreshing, lastRefreshed, watchedTickers } = useData();
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleRefresh = async () => {
    setMsg(null);
    const result = await refresh();
    setMsg(result);
    setTimeout(() => setMsg(null), 6000);
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
      isActive ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
    }`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto px-6 sm:px-8 py-3 flex items-center justify-between gap-4 max-w-6xl">
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight">3x Hunter</h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block -mt-0.5">Opportunity Scanner</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>
                <Icon className="w-3.5 h-3.5" />
                {label}
                {to === '/watchlists' && watchedTickers.size > 0 && (
                  <span className="text-[11px] opacity-70 tabular-nums">{watchedTickers.size}</span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {lastRefreshed && (
              <span className="text-[11px] text-muted-foreground/70 hidden lg:block whitespace-nowrap">
                Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2 h-8 text-[13px]">
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pull live prices, momentum, valuation, and analyst targets from Yahoo Finance</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="md:hidden border-t border-border px-6 py-2 flex flex-col gap-1 animate-fade-in" aria-label="Mobile">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClass} onClick={() => setMobileOpen(false)}>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {msg && (
        <div className="mx-auto px-6 sm:px-8 max-w-6xl pt-4">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] animate-fade-in bg-neutral-100 text-neutral-700 border border-neutral-200">
            {msg.type === 'success' ? <Check className="w-4 h-4 text-neutral-900" /> : <AlertCircle className="w-4 h-4 text-neutral-900" />}
            {msg.text}
          </div>
        </div>
      )}

      <main className="mx-auto px-6 sm:px-8 py-8 max-w-6xl">
        <Outlet />
      </main>

      <footer className="mx-auto px-6 sm:px-8 py-10 pb-16 max-w-6xl">
        <Separator className="mb-6" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl">
            Educational research and screening tool only. Not investment advice, not a recommendation to buy or sell any security,
            and no guarantee of returns. Market data from Yahoo Finance; may be delayed or incomplete.{' '}
            <Link to="/methodology" className="underline underline-offset-2 hover:text-neutral-900">Methodology and disclosures</Link>
          </p>
          <span className="text-[11px] text-muted-foreground/60 font-medium">3x Hunter</span>
        </div>
      </footer>
    </div>
  );
}
