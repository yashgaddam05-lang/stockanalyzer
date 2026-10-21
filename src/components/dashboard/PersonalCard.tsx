import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Shared shell for the small personal dashboard cards (portfolio, alerts, catalysts). */
export function PersonalCard({
  icon,
  title,
  href,
  linkLabel,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  href: string;
  linkLabel: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          {badge}
        </div>
        <Link
          to={href}
          className="flex items-center gap-1 text-[12px] text-neutral-600 hover:text-neutral-900"
          aria-label={linkLabel}
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </Card>
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function CardError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
      <p className="text-[12px] text-muted-foreground">Could not load {what}.</p>
      <Button variant="ghost" size="sm" className="mt-1 h-8 text-[12px]" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function CardEmpty({ message, ctaLabel, ctaHref }: { message: string; ctaLabel: string; ctaHref: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
      <p className="text-[12px] text-muted-foreground">{message}</p>
      <Button asChild variant="outline" size="sm" className="mt-3 h-8 text-[12px]">
        <Link to={ctaHref}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}
