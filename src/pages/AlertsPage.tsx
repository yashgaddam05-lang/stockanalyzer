import { useCallback, useEffect, useState } from 'react';
import { Database, Info, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateAlertDialog } from '@/components/alerts/CreateAlertDialog';
import { NotificationsFeed } from '@/components/alerts/NotificationsFeed';
import { AlertRulesTable } from '@/components/alerts/AlertRulesTable';
import { ALERTS_DISCLAIMER, ALERTS_UNAVAILABLE, errorMessage } from '@/components/alerts/alert-utils';
import { deleteAlert, getAlertEvents, getAlerts, markAlertEventsRead, updateAlert } from '@/lib/api';
import type { AlertEvent, AlertRule, AlertRulePatch } from '@/lib/supabase';

type TabId = 'notifications' | 'rules';

export default function AlertsPage() {
  const [tab, setTab] = useState<TabId>('notifications');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [ruleData, eventData] = await Promise.all([getAlerts(), getAlertEvents({ limit: 100 })]);
      setAvailable(ruleData.available && eventData.available);
      setRules(ruleData.rules);
      setEvents(eventData.events);
      setUnreadCount(eventData.unread_count);
    } catch (err) {
      setError(errorMessage(err, 'Could not load alerts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkRead = async (id: string) => {
    const target = events.find((e) => e.id === id);
    if (!target || target.read_at) return;
    const now = new Date().toISOString();
    setActionError(null);
    setBusyIds((prev) => new Set(prev).add(id));
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read_at: now } : e)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markAlertEventsRead([id]);
    } catch (err) {
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read_at: null } : e)));
      setUnreadCount((c) => c + 1);
      setActionError(errorMessage(err, 'Could not mark notification as read.'));
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleMarkAllRead = async () => {
    const before = events;
    const beforeCount = unreadCount;
    const now = new Date().toISOString();
    setActionError(null);
    setMarkingAll(true);
    setEvents((prev) => prev.map((e) => (e.read_at ? e : { ...e, read_at: now })));
    setUnreadCount(0);
    try {
      await markAlertEventsRead('all');
    } catch (err) {
      setEvents(before);
      setUnreadCount(beforeCount);
      setActionError(errorMessage(err, 'Could not mark notifications as read.'));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleUpdate = async (rule: AlertRule, patch: AlertRulePatch) => {
    setActionError(null);
    try {
      const updated = await updateAlert(rule.id, patch);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch (err) {
      if (patch.threshold === undefined) setActionError(errorMessage(err, 'Could not update alert.'));
      throw err;
    }
  };

  const handleDelete = async (rule: AlertRule) => {
    await deleteAlert(rule.id);
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">Alerts</h1>
          <p className="text-sm text-muted-foreground">{ALERTS_DISCLAIMER}</p>
        </div>
        {available && !error && (
          <Button type="button" onClick={() => setCreateOpen(true)} disabled={loading}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Create alert
          </Button>
        )}
      </div>

      {error ? (
        <Card role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Info className="h-8 w-8 text-neutral-400" aria-hidden="true" />
          <p className="text-sm text-neutral-900">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </Card>
      ) : !loading && !available ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Database className="h-8 w-8 text-neutral-400" aria-hidden="true" />
          <p className="text-sm font-medium text-neutral-900">{ALERTS_UNAVAILABLE}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your rules and notifications will appear here once the update lands.
          </p>
        </Card>
      ) : (
        <>
          {actionError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{actionError}</p>
            </div>
          )}
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="notifications" className="flex-1 sm:flex-none">
                Notifications{unreadCount > 0 ? ` (${unreadCount > 99 ? '99+' : unreadCount})` : ''}
              </TabsTrigger>
              <TabsTrigger value="rules" className="flex-1 sm:flex-none">
                Rules{rules.length > 0 ? ` (${rules.length})` : ''}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="notifications" className="mt-4">
              <NotificationsFeed
                events={events}
                loading={loading}
                unreadCount={unreadCount}
                busyIds={busyIds}
                markingAll={markingAll}
                onMarkRead={(id) => void handleMarkRead(id)}
                onMarkAllRead={() => void handleMarkAllRead()}
              />
            </TabsContent>
            <TabsContent value="rules" className="mt-4">
              <AlertRulesTable
                rules={rules}
                loading={loading}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onCreate={() => setCreateOpen(true)}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      <CreateAlertDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setTab('rules');
          void load(true);
        }}
      />
    </div>
  );
}
