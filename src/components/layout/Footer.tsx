import { Link } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';

export function Footer() {
  return (
    <footer className="w-full mx-auto max-w-6xl px-4 sm:px-8 pt-8 pb-16">
      <Separator className="mb-6" />
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <p className="text-[12px] font-medium text-neutral-700">Educational research tool. Not investment advice. Scores are model outputs and may be wrong.</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Market data: Yahoo Finance (unofficial endpoints), refreshed on demand. Rows marked Seed are approximate
            placeholders.
          </p>
          <Link
            to="/methodology#disclaimer"
            className="inline-block text-[11px] text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
          >
            Read the full disclaimer
          </Link>
        </div>
        <span className="text-[11px] text-muted-foreground/60 font-medium">3x Hunter</span>
      </div>
    </footer>
  );
}
