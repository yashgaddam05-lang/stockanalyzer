import { createHash } from 'node:crypto';
import type { ApiRequest } from './_supabase.js';

/** Signed-out visitor key for daily limits: salted SHA-256 of the client IP and the UTC day. Raw IPs are never stored. */
export function visitorHash(request: ApiRequest): string {
  const header = (name: string) => {
    const key = Object.keys(request.headers ?? {}).find((k) => k.toLowerCase() === name);
    const value = key ? request.headers?.[key] : undefined;
    return Array.isArray(value) ? value[0] : value;
  };
  const ip = header('x-forwarded-for')?.split(',')[0]?.trim() || header('x-real-ip') || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256').update(`${process.env.ASSISTANT_GUEST_SALT ?? '3x-hunter-guest'}|${day}|${ip}`).digest('hex');
}
