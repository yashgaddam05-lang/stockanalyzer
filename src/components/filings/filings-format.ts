/** Plain-language labels for SEC form types and Form 4 transaction codes. */

export function describeForm(form: string): string {
  const f = form.trim().toUpperCase();
  if (f.startsWith('424B') || f === 'S-3' || f === 'S-3/A' || f === 'S-3ASR' || f === 'S-1' || f === 'S-1/A') {
    return 'Securities offering (possible dilution)';
  }
  if (f === '8-K' || f === '8-K/A') return 'Current report';
  if (f === '10-Q' || f === '10-Q/A') return 'Quarterly report';
  if (f === '10-K' || f === '10-K/A') return 'Annual report';
  if (f === '4' || f === '4/A' || f === 'FORM 4') return 'Insider transaction';
  if (f === '3' || f === '3/A') return 'Initial insider ownership';
  if (f === '5' || f === '5/A') return 'Annual insider ownership';
  if (f === '144') return 'Proposed insider sale';
  if (f.startsWith('SC 13D')) return 'Activist ownership stake (5%+)';
  if (f.startsWith('SC 13G')) return 'Passive ownership stake (5%+)';
  if (f === 'DEF 14A') return 'Proxy statement';
  if (f === '6-K') return 'Foreign issuer report';
  if (f === '20-F') return 'Foreign issuer annual report';
  return 'Other filing';
}

export function formLabel(form: string): string {
  const f = form.trim();
  return f === '4' || f === '4/A' ? `Form ${f}` : f;
}

export function isDilutionForm(form: string): boolean {
  return describeForm(form).startsWith('Securities offering');
}

const CODE_LABELS: Record<string, string> = {
  P: 'Purchase',
  S: 'Sale',
  A: 'Award',
  M: 'Option exercise',
  F: 'Tax withholding',
  G: 'Gift',
};

export function describeCode(code: string | null): string {
  if (!code) return 'Other';
  return CODE_LABELS[code.trim().toUpperCase()] ?? 'Other';
}

export function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value: string | null): string {
  if (!value) return 'never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const priceFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export function formatShares(n: number | null): string {
  return n == null ? '-' : intFmt.format(n);
}

export function formatSignedShares(n: number): string {
  return `${n > 0 ? '+' : ''}${intFmt.format(n)}`;
}

export function formatPrice(n: number | null): string {
  return n == null ? '-' : priceFmt.format(n);
}

export function formatValue(n: number | null): string {
  return n == null ? '-' : compactUsd.format(n);
}

export function formatSignedValue(n: number): string {
  return `${n > 0 ? '+' : ''}${compactUsd.format(n)}`;
}
