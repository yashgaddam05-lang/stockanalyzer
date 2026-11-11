// Thin wrapper over the GA4 gtag snippet in index.html. Never throws; no-ops when blocked.
type Gtag = (...args: unknown[]) => void;

export function track(event: string, params: Record<string, unknown> = {}): void {
  try {
    const g = (window as unknown as { gtag?: Gtag }).gtag;
    if (typeof g === 'function') g('event', event, params);
  } catch {
    // Analytics must never break the app.
  }
}
