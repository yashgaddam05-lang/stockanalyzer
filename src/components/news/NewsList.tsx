import { ExternalLink } from 'lucide-react';
import type { NewsItem } from '@/lib/api';
import { timeAgo } from './news-format';

export function NewsRow({ item, showThumb = true }: { item: NewsItem; showThumb?: boolean }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="group flex gap-3 py-3 transition-colors hover:bg-neutral-50"
      >
        {showThumb && item.thumbnail && (
          <img src={item.thumbnail} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-sm object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            {item.source === 'sec' ? <span className="text-[hsl(var(--live))]">Official · </span> : null}
            {item.publisher} · {timeAgo(item.published_at)}
          </p>
          <p className="mt-0.5 text-[14px] font-semibold leading-snug text-neutral-900 group-hover:underline">
            {item.title}
            <ExternalLink className="ml-1 inline h-3 w-3 text-neutral-400" aria-hidden="true" />
          </p>
        </div>
      </a>
    </li>
  );
}

export function NewsList({ items, showThumb = true }: { items: NewsItem[]; showThumb?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((n) => (
        <NewsRow key={n.id} item={n} showThumb={showThumb} />
      ))}
    </ul>
  );
}
