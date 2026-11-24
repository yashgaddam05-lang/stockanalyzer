// Shared Yahoo Finance helpers for the news and leadership routes. Free endpoints, no key.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const TIMEOUT_MS = 8000;

export async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type Crumb = { crumb: string; cookie: string };
let crumbCache: { value: Crumb; at: number } | null = null;

/** quoteSummary needs a cookie + crumb pair. Cached per warm instance for 30 minutes. */
export async function getCrumb(): Promise<Crumb | null> {
  if (crumbCache && Date.now() - crumbCache.at < 30 * 60_000) return crumbCache.value;
  try {
    const r1 = await fetch('https://fc.yahoo.com', { redirect: 'manual', headers: { 'User-Agent': UA } });
    const raw = typeof r1.headers.getSetCookie === 'function' ? r1.headers.getSetCookie() : [r1.headers.get('set-cookie') ?? ''];
    const cookie = raw.flatMap((c) => c.split(/,(?=\s*[A-Za-z0-9_-]+=)/)).map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
    if (!cookie) return null;
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { Cookie: cookie, 'User-Agent': UA } });
    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.includes('<') || crumb.length > 64) return null;
    crumbCache = { value: { crumb, cookie }, at: Date.now() };
    return crumbCache.value;
  } catch {
    return null;
  }
}

export type NewsItem = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  thumbnail: string | null;
  tickers: string[];
  source: 'yahoo' | 'sec';
};

type YahooNews = {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  thumbnail?: { resolutions?: { url?: string; width?: number; tag?: string }[] };
  relatedTickers?: string[];
};

export async function searchNews(query: string, count = 12): Promise<NewsItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0&enableFuzzyQuery=false`;
  const json = (await fetchJson(url)) as { news?: YahooNews[] } | null;
  const out: NewsItem[] = [];
  for (const n of json?.news ?? []) {
    if (!n.title || !n.link || !n.providerPublishTime) continue;
    if (!/^https:\/\//.test(n.link)) continue;
    const res = n.thumbnail?.resolutions ?? [];
    const thumb = res.find((r) => r.tag === '140x140')?.url ?? res[res.length - 1]?.url ?? null;
    out.push({
      id: n.uuid ?? n.link,
      title: n.title,
      publisher: n.publisher ?? 'News',
      url: n.link,
      published_at: new Date(n.providerPublishTime * 1000).toISOString(),
      thumbnail: thumb && /^https:\/\//.test(thumb) ? thumb : null,
      tickers: Array.isArray(n.relatedTickers) ? n.relatedTickers.slice(0, 6) : [],
      source: 'yahoo',
    });
  }
  return out;
}

export type Officer = { name: string; title: string; age: number | null; year_born: number | null; total_pay: number | null };
export type Governance = { audit: number | null; board: number | null; compensation: number | null; shareholder_rights: number | null; overall: number | null };

type RawValue = number | { raw?: number } | null | undefined;
const rawNum = (v: RawValue): number | null => {
  const n = typeof v === 'number' ? v : v?.raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export async function getProfile(ticker: string): Promise<{ officers: Officer[]; governance: Governance; website: string | null; employees: number | null } | null> {
  const c = await getCrumb();
  const crumb = c ? `&crumb=${encodeURIComponent(c.crumb)}` : '';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile,insiderHolders${crumb}`;
  const json = (await fetchJson(url, c ? { Cookie: c.cookie } : {})) as
    | { quoteSummary?: { result?: { assetProfile?: Record<string, unknown>; insiderHolders?: { holders?: Record<string, unknown>[] } }[] } }
    | null;
  const result = json?.quoteSummary?.result?.[0];
  const ap = result?.assetProfile;
  if (!ap) return null;
  let officers = ((ap.companyOfficers as Record<string, unknown>[] | undefined) ?? [])
    .filter((o) => typeof o.name === 'string')
    .slice(0, 10)
    .map((o) => ({
      name: String(o.name),
      title: typeof o.title === 'string' ? o.title : '',
      age: rawNum(o.age as RawValue),
      year_born: rawNum(o.yearBorn as RawValue),
      total_pay: rawNum(o.totalPay as RawValue),
    }));
  // Some issuers (e.g. NVDA) publish no officer list; fall back to Yahoo's insider holders,
  // officers first, then directors.
  if (officers.length === 0) {
    const titleCase = (n: string) => n.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
    const rank = (r: string) => (/chief executive|ceo|president/i.test(r) ? 0 : /chief|officer|cfo|coo|cto/i.test(r) ? 1 : /director/i.test(r) ? 3 : 2);
    officers = (result?.insiderHolders?.holders ?? [])
      .filter((h) => typeof h.name === 'string')
      .map((h) => ({ name: titleCase(String(h.name)), title: typeof h.relation === 'string' ? h.relation : 'Insider', age: null, year_born: null, total_pay: null }))
      .sort((a, b) => rank(a.title) - rank(b.title))
      .slice(0, 10);
  }
  return {
    officers,
    governance: {
      audit: rawNum(ap.auditRisk as RawValue),
      board: rawNum(ap.boardRisk as RawValue),
      compensation: rawNum(ap.compensationRisk as RawValue),
      shareholder_rights: rawNum(ap.shareHolderRightsRisk as RawValue),
      overall: rawNum(ap.overallRisk as RawValue),
    },
    website: typeof ap.website === 'string' ? ap.website : null,
    employees: rawNum(ap.fullTimeEmployees as RawValue),
  };
}
