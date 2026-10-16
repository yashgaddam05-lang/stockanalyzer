export const DEFAULT_NEXT = '/app';

/** Auth pages are never a valid post-login destination (avoids redirect loops). */
const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

/**
 * Sanitizes a `?next=` redirect target. Only same-origin relative paths are allowed: must start
 * with a single '/' (no '//' or '/\'), no control characters, and must not point at an auth page.
 */
export function safeNext(raw: string | null, fallback: string = DEFAULT_NEXT): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.charCodeAt(i) < 0x20) return fallback;
  }
  try {
    const resolved = new URL(raw, window.location.origin);
    if (resolved.origin !== window.location.origin) return fallback;
    if (AUTH_PATHS.some((p) => resolved.pathname === p || resolved.pathname.startsWith(`${p}/`))) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
