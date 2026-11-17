import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Link2, Loader2, RefreshCw, ShieldCheck, Unlink } from 'lucide-react';
import { ApiError, connectBrokerage, disconnectBrokerage, getBrokerageStatus, syncBrokerage } from '@/lib/api';
import type { BrokerageStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const AUTO_SYNC_AFTER_MS = 15 * 60 * 1000;

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString();
}

/**
 * Read-only brokerage connection (Robinhood, Schwab, Fidelity, Webull and more via SnapTrade).
 * Syncs on return from the connection portal, when the page opens with a stale sync, and on demand.
 * Calls onSynced so the page reloads portfolios after holdings change.
 */
export function BrokerageConnect({ onSynced }: { onSynced: () => void }) {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<BrokerageStatus | null>(null);
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoSynced = useRef(false);

  const sync = useCallback(
    async (quiet = false) => {
      setBusy('sync');
      setError(null);
      try {
        const r = await syncBrokerage();
        if (!quiet && typeof r.positions === 'number') {
          setMessage(`Synced ${r.positions} holding${r.positions === 1 ? '' : 's'} from ${r.accounts} account${r.accounts === 1 ? '' : 's'}.`);
        }
        setStatus(await getBrokerageStatus());
        onSynced();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Sync failed. Please try again.');
      } finally {
        setBusy(null);
      }
    },
    [onSynced]
  );

  useEffect(() => {
    let active = true;
    getBrokerageStatus()
      .then((s) => {
        if (!active) return;
        setStatus(s);
        const returning = params.get('brokerage') === 'connected';
        const stale = !s.lastSyncedAt || Date.now() - Date.parse(s.lastSyncedAt) > AUTO_SYNC_AFTER_MS;
        if (s.available && (returning || (s.connected && stale)) && !autoSynced.current) {
          autoSynced.current = true;
          if (returning) setParams({}, { replace: true });
          void sync(!returning);
        }
      })
      .catch(() => active && setStatus(null));
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setBusy('connect');
    setError(null);
    try {
      const { url } = await connectBrokerage();
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open the connection. Please try again.');
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect your brokerage? Synced portfolios will be removed from 3x Hunter. Nothing changes at your broker.')) return;
    setBusy('disconnect');
    setError(null);
    try {
      await disconnectBrokerage();
      setStatus(await getBrokerageStatus());
      setMessage('Disconnected. Your synced portfolios were removed.');
      onSynced();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not disconnect. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (!status || !status.available) return null;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white" aria-hidden="true">
          <Link2 className="h-4 w-4" />
        </span>
        <div className="space-y-0.5">
          <p className="text-[14px] font-semibold text-neutral-900">
            {status.connected ? 'Brokerage connected' : 'Connect your brokerage'}
          </p>
          {status.connected ? (
            <p className="text-[12px] text-neutral-600">
              Live, read-only sync. Last synced {ago(status.lastSyncedAt)}; updates when you open this page and daily.
            </p>
          ) : (
            <p className="flex items-center gap-1 text-[12px] text-neutral-600">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              Robinhood, Schwab, Fidelity, Webull and more. Read-only: we never see your password and can never trade.
            </p>
          )}
          {status.lastError && <p className="text-[12px] text-amber-700">{status.lastError}</p>}
          {message && <p className="text-[12px] text-emerald-700">{message}</p>}
          {error && (
            <p className="text-[12px] text-red-700">
              {error}{' '}
              {/Pro\b/.test(error) && (
                <Link to="/app/billing" className="font-semibold underline underline-offset-2">
                  See Pro
                </Link>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {status.connected ? (
          <>
            <Button size="sm" variant="outline" onClick={() => void sync()} disabled={busy !== null} className="gap-1.5">
              {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync now
            </Button>
            <Button size="sm" variant="outline" onClick={() => void connect()} disabled={busy !== null}>
              Add account
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void disconnect()} disabled={busy !== null} className="gap-1.5 text-neutral-600">
              {busy === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => void connect()} disabled={busy !== null} className="gap-1.5">
            {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {status.allowed ? 'Connect brokerage' : 'Connect brokerage (Pro)'}
          </Button>
        )}
      </div>
    </Card>
  );
}
