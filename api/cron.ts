import { createHash, timingSafeEqual } from 'node:crypto';
import {
  getBearerToken,
  getQueryValue,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServerError,
  supabaseUrl,
  type ApiRequest,
  type ApiResponse,
} from './_supabase.js';
import { logRefreshRun, runStockRefresh } from './_refresh-core.js';
import { runScheduledResearch } from './_research.js';

const JOBS = ['market', 'stocks', 'filings', 'smart-money', 'research'] as const;
type CronJob = (typeof JOBS)[number];

const EDGE_FUNCTIONS: Record<Exclude<CronJob, 'stocks' | 'research'>, string> = {
  market: 'refresh-market',
  filings: 'refresh-filings',
  'smart-money': 'refresh-smart-money',
};

const EDGE_TIMEOUT_MS = 100_000;

function isCronJob(value: string | null): value is CronJob {
  return value !== null && (JOBS as readonly string[]).includes(value);
}

/** Constant-time comparison; hashing first equalizes lengths for timingSafeEqual. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function anonKey(): string | undefined {
  return process.env.SUPABASE_ANON_KEY
    ?? process.env.VITE_SUPABASE_ANON_KEY
    ?? process.env.DATABASE_ANON_KEY
    ?? process.env.database_anon_key;
}

type EdgeOutcome = { ok: boolean; result: unknown };

async function callEdgeFunction(job: Exclude<CronJob, 'stocks' | 'research'>): Promise<EdgeOutcome> {
  const startedAt = new Date();
  const name = EDGE_FUNCTIONS[job];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);
  let outcome: EdgeOutcome;
  try {
    const key = anonKey();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers,
      body: '{}',
      signal: controller.signal,
    });
    const payload: unknown = await res.json().catch(() => null);
    outcome = res.ok
      ? { ok: true, result: payload }
      : { ok: false, result: { error: `${name} returned HTTP ${res.status}.` } };
  } catch (error) {
    const timedOut = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    outcome = { ok: false, result: { error: timedOut ? `${name} timed out.` : `${name} is unavailable.` } };
  } finally {
    clearTimeout(timer);
  }
  if (!outcome.ok) await logRefreshRun(`cron:${job}`, startedAt, 'failed', outcome.result as Record<string, unknown>);
  return outcome;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    response.status(503).json({ error: 'Cron is not configured.' });
    return;
  }

  const token = getBearerToken(request);
  if (!token || !secretsMatch(token, secret)) {
    response.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  const job = getQueryValue(request, 'job');
  if (!isCronJob(job)) {
    sendBadRequest(response, `job must be one of ${JOBS.join(', ')}.`);
    return;
  }

  if (!supabaseUrl) {
    sendServerError(response);
    return;
  }

  try {
    if (job === 'stocks') {
      const result = await runStockRefresh('cron');
      response.status(200).json({
        job,
        ok: result.ok,
        result: result.ok ? result.data : { error: result.error },
      });
      return;
    }
    if (job === 'research') {
      // Shared research briefs; the slot only runs when the business is big enough for it (see activeSlots).
      const slot = getQueryValue(request, 'slot') ?? 'premarket';
      const result = await runScheduledResearch(slot, { deadlineMs: 270_000 });
      response.status(200).json({ job, ok: true, result });
      return;
    }
    const outcome = await callEdgeFunction(job);
    response.status(200).json({ job, ok: outcome.ok, result: outcome.result });
  } catch {
    sendServerError(response);
  }
}
