import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { ApiError, getAdminStats, getSiteStatus, setMaintenance } from '@/lib/api';
import type { AdminStats } from '@/lib/api';
import { usePlan } from '@/components/billing/usePlan';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '--');

export default function AdminPage() {
  useDocumentTitle('Admin · 3x Hunter');
  const { plan, loading: planLoading } = usePlan();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [maint, setMaint] = useState<{ enabled: boolean; message: string } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plan?.isAdmin) return;
    getAdminStats()
      .then(setStats)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load stats.'));
    getSiteStatus()
      .then((s) => {
        setMaint(s.maintenance);
        setMessage(s.maintenance.message);
      })
      .catch(() => undefined);
  }, [plan?.isAdmin]);

  if (planLoading) return <Skeleton className="h-40 w-full" />;
  if (!plan?.isAdmin) return <Card className="p-8 text-center text-sm text-muted-foreground">This page is for 3x Hunter admins.</Card>;

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const s = await setMaintenance(enabled, message);
      setMaint(s.maintenance);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change maintenance mode.');
    } finally {
      setBusy(false);
    }
  }

  const tiles: [string, string | number][] = stats
    ? [
        ['Accounts', stats.users],
        ['New in 7 days', stats.new_7d],
        ['Active in 7 days', stats.active_7d],
        ['Active in 30 days', stats.active_30d],
        ['Paying Pro', stats.paying],
        ['MRR', `$${Math.round(stats.mrr_usd)}`],
        ['Founding members', stats.founding],
        ['AI questions today', stats.assistant_today],
      ]
    : [];

  return (
    <div className="space-y-8">
      <div className="space-y-2 pt-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          Admin
        </h1>
        <p className="text-sm text-muted-foreground">Business numbers and site controls. Visible to admins only; enforced in the database.</p>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats
          ? tiles.map(([k, v]) => (
              <Card key={k} className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{k}</p>
                <p className="text-2xl font-bold tabular-nums text-neutral-900">{v}</p>
              </Card>
            ))
          : Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-neutral-900">
          <Wrench className="h-5 w-5" aria-hidden="true" />
          Maintenance page
        </h2>
        <p className="text-[13px] text-neutral-600">
          Shows &ldquo;We&apos;ll be back soon&rdquo; to everyone on production within a minute. Admins, the sign-in page and the staging site are
          not affected. Normal deploys do not need this: Vercel switches versions with zero downtime.
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={300}
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
          aria-label="Maintenance message"
        />
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-md px-2 py-1 text-[12px] font-semibold ${maint?.enabled ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}>
            {maint?.enabled ? 'Maintenance is ON' : 'Site is live'}
          </span>
          <Button size="sm" variant={maint?.enabled ? 'outline' : 'default'} disabled={busy} onClick={() => void toggle(!maint?.enabled)} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {maint?.enabled ? 'Turn maintenance off' : 'Turn maintenance on'}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <h2 className="p-5 text-lg font-semibold tracking-tight text-neutral-900">Recent accounts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-y border-border bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.recent_users ?? []).map((u) => (
                <tr key={u.email} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2 capitalize">{u.plan}</td>
                  <td className="px-4 py-2">{fmt(u.created_at)}</td>
                  <td className="px-4 py-2">{fmt(u.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
