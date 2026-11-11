import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE = 'https://3xhunter.com';
const DEFAULT_DESCRIPTION =
  '3x Hunter ranks US stocks with a transparent 0-100 3x Opportunity Score and an independent risk score. Portfolio reports, rule-based bots and a 10-year track record. Free to start.';

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Sets document.title for the lifetime of the calling page, plus the description, canonical URL and
 * social titles crawlers read. Pages under /app are marked noindex (they are private and signed-in).
 */
export function useDocumentTitle(title: string, description: string = DEFAULT_DESCRIPTION) {
  const { pathname } = useLocation();
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    const url = `${SITE}${pathname === '/' ? '/' : pathname.replace(/\/$/, '')}`;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    setMeta('meta[name="robots"]', 'name', 'robots', pathname.startsWith('/app') ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
    return () => {
      document.title = prev;
    };
  }, [title, description, pathname]);
}
