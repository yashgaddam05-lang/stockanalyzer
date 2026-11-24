import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavColumn } from './site-nav';

type Props = {
  label: string;
  columns: NavColumn[];
  tone: 'public' | 'private';
  intro?: { eyebrow: string; title: string; body: string; cta?: ReactNode };
  footer?: ReactNode;
  active?: boolean;
};

/** Full-width mega panel under the header. Private panels are racing green with a lock badge. */
export function MegaMenu({ label, columns, tone, intro, footer, active }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const { pathname, hash } = useLocation();

  useEffect(() => setOpen(false), [pathname, hash]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const priv = tone === 'private';

  return (
    <div ref={root} className="static">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn('nav-link inline-flex items-center gap-1.5', (open || active) && 'nav-link-active')}
      >
        {priv && <Lock className="h-3 w-3 text-[hsl(var(--bronze))]" aria-hidden="true" />}
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          className={cn(
            'mega-panel absolute inset-x-0 top-full z-40 border-t-2 shadow-2xl',
            priv ? 'mega-private border-[hsl(var(--bronze))]' : 'mega-public border-[hsl(var(--live))]',
          )}
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[1.1fr_3fr]">
            {intro && (
              <div className="space-y-3">
                <p className={cn('mega-eyebrow', priv ? 'text-[hsl(var(--bronze))]' : 'text-[hsl(var(--live))]')}>
                  {priv && <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />}
                  {intro.eyebrow}
                </p>
                <p className="font-display text-3xl font-semibold uppercase leading-none tracking-[0.03em]">{intro.title}</p>
                <p className="text-[13px] leading-relaxed opacity-75">{intro.body}</p>
                {intro.cta}
              </div>
            )}
            <div className={cn('grid gap-8', columns.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
              {columns.map((col) => (
                <div key={col.title}>
                  <p className="mega-eyebrow border-b pb-2 opacity-80">{col.title}</p>
                  <ul className="mt-3 space-y-1">
                    {col.items.map((item) => (
                      <li key={item.to}>
                        <Link to={item.to} className="mega-link group block py-1.5">
                          <span className="block text-[14px] font-semibold">{item.label}</span>
                          {item.desc && <span className="block text-[12px] opacity-60">{item.desc}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          {footer && <div className="mega-footer">{footer}</div>}
        </div>
      )}
    </div>
  );
}
