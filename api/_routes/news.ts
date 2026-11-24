import { gdeltNews, searchNews, type NewsItem } from '../_yahoo.js';
import {
  getQueryValue,
  normalizeTicker,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  supabase,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';

// GET /api/news                -> market headlines
// GET /api/news?ticker=NVDA    -> company headlines + its latest 8-K filings
// GET /api/news?person=Name    -> headlines that mention an executive
const PERSON_RE = /^[A-Za-z][A-Za-z .'-]{1,59}$/;
const MARKET_QUERIES = ['stock market today', 'S&P 500', 'Federal Reserve', 'earnings'];

function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((n) => {
    const key = n.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const newest = (a: NewsItem, b: NewsItem) => b.published_at.localeCompare(a.published_at);

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }
  const rawTicker = getQueryValue(request, 'ticker');
  const person = getQueryValue(request, 'person');
  try {
    if (person !== null) {
      const name = person.replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').trim();
      if (!PERSON_RE.test(name)) {
        sendBadRequest(response, 'A valid name is required.');
        return;
      }
      // Last name + company catches nicknames ("Jensen" vs filed "Jen-Hsun").
      const company = getQueryValue(request, 'company');
      const parts = name.split(/\s+/).filter((t) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(t));
      const last = parts[parts.length - 1].replace(/[^A-Za-z'-]/g, '');
      const firm = company && PERSON_RE.test(company) ? company.split(/\s+/)[0] : null;
      const q = firm && last.length > 2 ? `"${last}" ${firm}` : `"${name}"`;
      const items = dedupe(await gdeltNews(q, 10)).sort(newest);
      response.setHeader?.('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
      response.status(200).json({ person: name, items });
      return;
    }

    if (rawTicker !== null) {
      const ticker = normalizeTicker(rawTicker);
      if (!ticker) {
        sendBadRequest(response, 'A valid ticker is required.');
        return;
      }
      const [news, filings] = await Promise.all([
        searchNews(ticker, 14),
        supabase
          .from('sec_filings')
          .select('accession_no, form, filed_at, primary_doc_url, description')
          .eq('ticker', ticker)
          .in('form', ['8-K', '8-K/A'])
          .order('filed_at', { ascending: false })
          .limit(6),
      ]);
      // Keep stories that are tagged to this ticker, or untagged ones Yahoo matched on.
      const company = news.filter((n) => n.tickers.length === 0 || n.tickers.includes(ticker));
      const official: NewsItem[] = ((filings.data ?? []) as Record<string, string | null>[])
        .filter((f) => f.primary_doc_url)
        .map((f) => ({
          id: String(f.accession_no),
          title: f.description ? `8-K: ${f.description}` : 'Form 8-K current report',
          publisher: 'SEC EDGAR',
          url: String(f.primary_doc_url),
          published_at: new Date(`${f.filed_at}T12:00:00Z`).toISOString(),
          thumbnail: null,
          tickers: [ticker],
          source: 'sec' as const,
        }));
      response.setHeader?.('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
      response.status(200).json({ ticker, items: dedupe(company).sort(newest), filings: official });
      return;
    }

    const batches = await Promise.all(MARKET_QUERIES.map((q) => searchNews(q, 10)));
    const items = dedupe(batches.flat()).sort(newest).slice(0, 30);
    response.setHeader?.('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
    response.status(200).json({ items });
  } catch {
    sendServerError(response);
  }
}
