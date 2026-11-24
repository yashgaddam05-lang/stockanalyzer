export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function money(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '-';
  const a = Math.abs(n);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K` : `$${a.toFixed(0)}`;
  return n < 0 ? `-${s}` : s;
}
