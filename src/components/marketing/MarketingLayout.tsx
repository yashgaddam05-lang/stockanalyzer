import { VoiceCallButton } from '@/components/assistant/VoiceCallButton';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowRight, Menu, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { cn } from '@/lib/utils';
import { InstallAppButton } from '@/components/app-install/InstallApp';
import { AssistantProvider } from '@/components/assistant/AssistantProvider';
import { MegaMenu } from '@/components/layout/MegaMenu';
import { PUBLIC_MARKETS } from '@/components/layout/site-nav';

// Same chat as in the app; signed out it answers as a guide to 3x Hunter. Loaded after the page.
const AssistantWidget = lazy(() => import('@/components/assistant/AssistantWidget').then((m) => ({ default: m.AssistantWidget })));

const NAV_LINKS = [
  { to: '/news', label: 'News' },
  { to: '/methodology', label: 'Methodology' },
  { to: '/pricing', label: 'Pricing' },
];

function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="3x Hunter home">
      <span className={cn('flex h-8 w-8 items-center justify-center border', dark ? 'border-white/80' : 'border-neutral-900 bg-neutral-900')}>
        <TrendingUp className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className={cn('font-display text-[19px] font-semibold uppercase leading-none tracking-[0.22em]', dark ? 'text-white' : 'text-neutral-900')}>
        3x Hunter
      </span>
    </Link>
  );
}

function navLinkClass(active: boolean) {
  return cn('nav-link', active && 'nav-link-active');
}

function AuthActions({ stacked = false, dark = false }: { stacked?: boolean; dark?: boolean }) {
  const { user, loading } = useAuth();
  const wrap = cn('flex items-center gap-2', stacked && 'flex-col items-stretch');

  if (loading) {
    return <div className={cn(wrap, 'h-9', !stacked && 'w-[168px]')} aria-hidden="true" />;
  }

  const install = <InstallAppButton variant={stacked ? 'outline' : 'ghost'} className={stacked ? '' : cn('hidden md:inline-flex', dark && 'text-neutral-300 hover:bg-white/10 hover:text-white')} />;
  const solid = dark ? 'bg-white text-neutral-950 hover:bg-neutral-200' : '';

  if (user) {
    return (
      <div className={wrap}>
        {install}
        <Button asChild size="sm" className={cn("h-9 gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em]", solid)}>
          <Link to="/app">
            Dashboard
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={wrap}>
      {install}
      <Button asChild variant={stacked ? 'outline' : 'ghost'} size="sm" className={cn("h-9 text-[12px] font-semibold uppercase tracking-[0.12em]", dark && "text-neutral-200 hover:bg-white/10 hover:text-white")}>
        <Link to="/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" className={cn("h-9 text-[12px] font-semibold uppercase tracking-[0.12em]", solid)}>
        <Link to="/signup">Sign up</Link>
      </Button>
    </div>
  );
}

/** Public marketing shell: sticky blurred header, routed page, marketing footer. */
export function MarketingLayout() {
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, hash]);

  // Reset scroll on page change; hash targets are handled by the destination page.
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <AssistantProvider>
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-neutral-900 focus:px-3 focus:py-2 focus:text-[13px] focus:text-white"
      >
        Skip to content
      </a>

      <header className="nav-dark sticky top-0 z-30 border-b border-[hsl(var(--bronze)/0.35)] bg-[hsl(var(--ink))] text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Wordmark dark />

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
            <MegaMenu
              label="Explore"
              tone="public"
              columns={PUBLIC_MARKETS}
              intro={{ eyebrow: 'Open to everyone', title: 'Markets & research', body: 'Live news, the full methodology and a ten-year track record. No account needed.' }}
            />
            {NAV_LINKS.map((l) =>
              l.to.startsWith('/#') ? (
                <Link key={l.to} to={l.to} className={navLinkClass(false)}>
                  {l.label}
                </Link>
              ) : (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => navLinkClass(isActive)}>
                  {l.label}
                </NavLink>
              )
            )}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <AuthActions dark />
          </div>

          <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogPrimitive.Trigger asChild>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-white hover:bg-white/10 hover:text-white md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-in md:hidden" />
              <DialogPrimitive.Content
                className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background shadow-lg data-[state=open]:animate-fade-in md:hidden"
                aria-describedby={undefined}
              >
                <div className="flex h-16 items-center justify-between px-4">
                  <DialogPrimitive.Title className="sr-only">Site menu</DialogPrimitive.Title>
                  <Wordmark />
                  <DialogPrimitive.Close asChild>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label="Close menu">
                      <X className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </DialogPrimitive.Close>
                </div>
                <nav className="flex flex-col gap-1 px-4 pb-4" aria-label="Mobile">
                  {NAV_LINKS.map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      onClick={() => setMenuOpen(false)}
                      className="rounded-md px-3 py-3 text-[15px] font-medium text-neutral-800 hover:bg-neutral-100"
                    >
                      {l.label}
                    </Link>
                  ))}
                  <div className="mt-2 border-t border-border pt-4">
                    <AuthActions stacked />
                  </div>
                </nav>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <MarketingFooter />
      <Suspense fallback={null}>
        <AssistantWidget />
        <VoiceCallButton />
      </Suspense>
    </div>
    </AssistantProvider>
  );
}
