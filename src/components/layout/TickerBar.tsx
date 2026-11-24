import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMarketNews, type NewsItem } from '@/lib/api';
import { useStocks } from '@/components/data/StocksProvider';

/** Scrolling "bottom line" strip: top-scored stocks, then the latest headlines. */
export function TickerBar() {
  const { stocks } = useStocks();
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    getMarketNews().then((r) => setNews(r.items.slice(0, 8))).catch(() => setNews([]));
  }, []);

  const leaders = useMemo(
    () => [...stocks].sort((a, b) => b.three_x_score - a.three_x_score).slice(0, 12),
    [stocks],
  );

  if (!leaders.length && !news.length) return null;

  const strip = (
    <>
      {leaders.map((s) => (
        <Link key={`s-${s.ticker}`} to={`/app/stock/${s.ticker}`} className="ticker-item">
          <span className="font-bold text-white">{s.ticker}</span>
          <span className="text-neutral-400">${s.current_price.toFixed(2)}</span>
          <span className="font-bold text-[hsl(var(--bronze))]">{Math.round(s.three_x_score)}</span>
        </Link>
      ))}
      {news.map((n) => (
        <a key={`n-${n.id}`} href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="ticker-item">
          <span className="font-bold text-[hsl(var(--live))]">NEWS</span>
          <span className="text-neutral-200">{n.title}</span>
        </a>
      ))}
    </>
  );

  return (
    <div className="ticker-bar" aria-label="Top scores and headlines">
      <span className="ticker-label">
        <span className="live-dot" aria-hidden="true" />
        Bottom line
      </span>
      <div className="ticker-viewport">
        <div className="ticker-track">
          {strip}
          <span aria-hidden="true" className="contents">{strip}</span>
        </div>
      </div>
    </div>
  );
}
