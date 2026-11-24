import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMarketNews, type NewsItem } from '@/lib/api';
import { useOptionalStocks } from '@/components/data/StocksProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { NewsList } from '@/components/news/NewsList';
import { timeAgo } from '@/components/news/news-format';

function LeadStory({ item }: { item: NewsItem }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="group relative block overflow-hidden bg-[hsl(var(--racing))] text-white">
      {(item.image ?? item.thumbnail) && (
        <img src={(item.image ?? item.thumbnail) as string} alt="" className="h-[340px] w-full object-cover opacity-70 transition-opacity group-hover:opacity-60 sm:h-[420px]" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[hsl(var(--ink))] via-[hsl(var(--ink)/0.75)] to-transparent p-6 pt-24">
        <span className="live-pill">Top story</span>
        <h2 className="mt-3 font-display text-3xl uppercase leading-[1.05] tracking-[0.02em] sm:text-4xl">{item.title}</h2>
        <p className="mt-2 text-[12px] uppercase tracking-[0.14em] text-neutral-300">
          {item.publisher} · {timeAgo(item.published_at)}
        </p>
      </div>
    </a>
  );
}

export default function NewsPage({ publicView = false }: { publicView?: boolean }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState(false);
  const stocks = useOptionalStocks()?.stocks;
  const covered = useMemo(() => new Set((stocks ?? []).map((s) => s.ticker)), [stocks]);

  useEffect(() => {
    getMarketNews().then((r) => setItems(r.items)).catch(() => setError(true));
  }, []);

  const lead = items?.find((n) => n.image) ?? items?.find((n) => n.thumbnail) ?? items?.[0];
  const rest = (items ?? []).filter((n) => n !== lead);
  const tagged = rest.filter((n) => n.tickers.some((t) => covered.has(t)));

  return (
    <div className="space-y-8">
      <header className="border-b-4 border-[hsl(var(--racing))] pb-3">
        <p className="eyebrow-label">Market desk</p>
        <h1 className="font-display text-4xl uppercase tracking-[0.04em] text-neutral-950 sm:text-5xl">Headlines</h1>
      </header>

      {error ? (
        <p className="text-[13px] text-muted-foreground">Headlines are unavailable right now. Try again in a minute.</p>
      ) : !items ? (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Skeleton className="h-[420px] w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            {lead && <LeadStory item={lead} />}
            <aside className="border-t-4 border-[hsl(var(--live))] bg-white">
              <p className="eyebrow-label px-1 pt-3">Top headlines</p>
              <NewsList items={rest.slice(0, 7)} showThumb={false} />
            </aside>
          </div>

          {tagged.length > 0 && (
            <section>
              <h2 className="section-rule">Stocks we score</h2>
              <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tagged.slice(0, 9).map((n) => (
                  <li key={n.id} className="border border-border bg-white p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {n.tickers.filter((t) => covered.has(t)).slice(0, 3).map((t) => (
                        <Link key={t} to={`/app/stock/${t}`} className="bg-[hsl(var(--racing))] px-2 py-0.5 text-[11px] font-bold tracking-wider text-bronze">
                          {t}
                        </Link>
                      ))}
                    </div>
                    <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 block text-[14px] font-semibold leading-snug text-neutral-900 hover:underline">
                      {n.title}
                    </a>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-neutral-500">{n.publisher} · {timeAgo(n.published_at)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="section-rule">More from the market</h2>
            <NewsList items={rest.slice(7)} />
          </section>
        </>
      )}
      {publicView && (
        <div className="flex flex-col items-start justify-between gap-4 border-t-4 border-[hsl(var(--live))] bg-[hsl(var(--racing))] p-6 text-white sm:flex-row sm:items-center">
          <div>
            <p className="mega-eyebrow text-[hsl(var(--bronze))]">Free account</p>
            <p className="font-display text-2xl font-semibold uppercase tracking-[0.03em]">Get the score behind every headline</p>
            <p className="text-[13px] text-white/70">Company news, leadership and insider connections on every stock page.</p>
          </div>
          <Link to="/signup" className="shrink-0 bg-[hsl(var(--bronze))] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--ink))]">Create free account</Link>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Headlines via Yahoo Finance. Educational research only, not investment advice.</p>
    </div>
  );
}
