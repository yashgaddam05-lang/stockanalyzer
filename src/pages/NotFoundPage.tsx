import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface NotFoundPageProps {
  /** Where the primary button goes: the public home by default, the dashboard inside the app. */
  homeHref?: string;
  homeLabel?: string;
}

export default function NotFoundPage({ homeHref = '/', homeLabel = 'Back to home' }: NotFoundPageProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">The page you are looking for does not exist.</p>
      <Button asChild className="mt-6" size="sm">
        <Link to={homeHref}>{homeLabel}</Link>
      </Button>
    </div>
  );
}
