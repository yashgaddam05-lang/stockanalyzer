import { sendMethodNotAllowed, sendServerError, supabase, type ApiRequest, type ApiResponse } from './_supabase.js';
import { runStockRefresh } from './_refresh-core.js';

// Anyone can call this (the scheduler and the in-app Refresh button), so runs are throttled:
// at most one rescoring every MIN_GAP_MS, which caps what a spammer can make us spend.
const MIN_GAP_MS = 10 * 60 * 1000;

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(response, ['POST']);
    return;
  }

  try {
    const { data: last } = await supabase
      .from('refresh_runs')
      .select('started_at')
      .like('job', 'rescore:%')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastAt = last?.started_at ? Date.parse(last.started_at as string) : 0;
    if (Date.now() - lastAt < MIN_GAP_MS) {
      response.status(200).json({ skipped: true, reason: 'A refresh ran recently; data is up to date.', last_run_at: last?.started_at });
      return;
    }

    const result = await runStockRefresh('manual');
    if (result.ok) {
      response.status(200).json(result.data);
      return;
    }
    response.status(result.status).json({ error: result.error });
  } catch {
    sendServerError(response);
  }
}
