import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Network } from 'lucide-react';
import { getLeadership, getPersonNews, type LeadershipResponse, type NewsItem, type OfficerRow } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { NewsList } from './NewsList';
import { money } from './news-format';

function cleanName(name: string) {
  return name.replace(/^(mr|mrs|ms|dr)\.?\s+/i, '');
}

function ConnectionChips({ list }: { list: { ticker: string; relationship: string | null }[] }) {
  if (!list.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.slice(0, 8).map((c) => (
        <Link
          key={c.ticker}
          to={`/app/stock/${c.ticker}`}
          title={c.relationship ?? undefined}
          className="inline-flex items-center gap-1 rounded-sm border border-neutral-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-800 hover:border-neutral-900"
        >
          <Network className="h-3 w-3" aria-hidden="true" />
          {c.ticker}
        </Link>
      ))}
    </div>
  );
}

function OfficerCard({ officer, company, lead }: { officer: OfficerRow; company: string; lead: boolean }) {
  const [open, setOpen] = useState(false);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const name = cleanName(officer.name);

  useEffect(() => {
    if (!open || news) return;
    getPersonNews(name, company).then((r) => setNews(r.items)).catch(() => setNews([]));
  }, [open, news, name, company]);

  return (
    <li className={cn('border-b border-border py-3 last:border-b-0', lead && 'pt-0')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('font-semibold text-neutral-900', lead ? 'text-[17px]' : 'text-[14px]')}>{name}</p>
          <p className="text-[12px] text-neutral-500">
            {officer.title}
            {officer.age ? ` · Age ${officer.age}` : ''}
            {officer.total_pay ? ` · Pay ${money(officer.total_pay)}` : ''}
          </p>
          <ConnectionChips list={officer.connections} />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-700 hover:text-neutral-950"
        >
          In the news
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-sm bg-neutral-50 px-3">
          {news === null ? (
            <Skeleton className="my-3 h-10 w-full" />
          ) : news.length ? (
            <NewsList items={news.slice(0, 4)} showThumb={false} />
          ) : (
            <p className="py-3 text-[12px] text-muted-foreground">No recent headlines mention {name}.</p>
          )}
        </div>
      )}
    </li>
  );
}

function RiskBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <div>
      <div className="flex justify-between text-[11px] uppercase tracking-wider text-neutral-500">
        <span>{label}</span>
        <span className="font-semibold text-neutral-900">{value}/10</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-neutral-200">
        <div className={cn('h-full', value >= 7 ? 'bg-[hsl(var(--live))]' : value >= 4 ? 'bg-amber-500' : 'bg-emerald-600')} style={{ width: `${value * 10}%` }} />
      </div>
    </div>
  );
}

export function LeadershipPanel({ ticker, company }: { ticker: string; company: string }) {
  const upper = ticker.toUpperCase();
  const [state, setState] = useState<{ ticker: string; data: LeadershipResponse | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    getLeadership(upper)
      .then((data) => !cancelled && setState({ ticker: upper, data }))
      .catch(() => !cancelled && setState({ ticker: upper, data: null }));
    return () => {
      cancelled = true;
    };
  }, [upper]);

  const data = state && state.ticker === upper ? state.data : undefined;
  const g = data?.governance;
  const otherInsiders = (data?.insiders ?? []).filter((i) => !data?.officers.some((o) => o.insider_name === i.name)).slice(0, 8);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-neutral-950 px-5 py-3 text-white">
        <h2 className="font-display text-lg uppercase tracking-[0.08em]">Leadership &amp; connections</h2>
        <p className="text-[11px] text-neutral-400">Who runs {upper}, what they earn, and where else they hold seats.</p>
      </div>
      {data === undefined ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : data === null ? (
        <p className="p-6 text-center text-[13px] text-muted-foreground">Leadership data is unavailable right now.</p>
      ) : (
        <div className="grid gap-6 p-5 md:grid-cols-[3fr_2fr]">
          <div>
            <p className="eyebrow-label">Executives</p>
            {data.officers.length ? (
              <ul className="mt-2">
                {data.officers.slice(0, 6).map((o, i) => (
                  <OfficerCard key={o.name} officer={o} company={company} lead={i === 0} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-muted-foreground">No officer list published.</p>
            )}
          </div>
          <div className="space-y-6">
            {g && g.overall !== null && (
              <div>
                <p className="eyebrow-label">Governance risk</p>
                <div className="mt-2 space-y-2.5">
                  <RiskBar label="Overall" value={g.overall} />
                  <RiskBar label="Board" value={g.board} />
                  <RiskBar label="Pay" value={g.compensation} />
                  <RiskBar label="Shareholder rights" value={g.shareholder_rights} />
                  <RiskBar label="Audit" value={g.audit} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">1 = low risk, 10 = high. ISS scores via Yahoo.</p>
              </div>
            )}
            <div>
              <p className="eyebrow-label">Directors &amp; insiders (Form 4)</p>
              {otherInsiders.length ? (
                <ul className="mt-2 space-y-2.5">
                  {otherInsiders.map((i) => (
                    <li key={i.name}>
                      <p className="text-[13px] font-semibold capitalize text-neutral-900">{i.name.toLowerCase()}</p>
                      <p className="text-[11px] text-neutral-500">
                        {i.relationship ?? 'Insider'}
                        {i.buys + i.sells > 0 ? ` · ${i.buys} buys / ${i.sells} sells · net ${money(i.net_value)}` : ''}
                      </p>
                      <ConnectionChips list={i.connections} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">No other Form 4 filers synced.</p>
              )}
            </div>
          </div>
        </div>
      )}
      <p className="border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
        Chips link to other covered companies where the same person files SEC Form 4. Officers via Yahoo Finance.
      </p>
    </Card>
  );
}
