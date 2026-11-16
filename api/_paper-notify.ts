// Paper-account notifications: Pro alerts after each daily valuation, and a weekly progress digest
// (in-app inbox for everyone with an experiment; email too once RESEND_API_KEY and EMAIL_FROM are set).
import { supabaseAdmin } from './_supabase.js';
import { getPlan } from './_plan.js';
import { loadPrices, valueAccounts, type PaperRow } from './_paper.js';

const COLUMNS = 'id, user_id, code, name, stocks, bonds, cash, sleeve, holdings, benchmark, start_value, target_multiple, horizon_years, assumptions, version, created_at, alert_state';
const COOLDOWN_DAYS = 30;
const SITE = 'https://www.3xhunter.com';

type Row = PaperRow & { alert_state: Record<string, string> | null };
type Valued = ReturnType<typeof valueAccounts>[number];

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

async function loadAll(): Promise<{ rows: Row[]; valued: Valued[]; standard: Valued[] }> {
  const { data } = await supabaseAdmin.from('paper_accounts').select(COLUMNS);
  const rows = (data ?? []) as Row[];
  const symbols = [...new Set(rows.flatMap((r) => [...r.holdings, ...r.benchmark].map((h) => h.symbol)).concat('VTI'))];
  const prices = await loadPrices(symbols);
  const valued = valueAccounts(rows, prices);
  return { rows, valued, standard: valued.filter((v) => !v.mine) };
}

/** The checks behind each alert. Triggers start a review; they never change the account. */
export function checks(v: Valued): { kind: string; message: string }[] {
  if (v.status !== 'live' || (v.daysTracked ?? 0) < 5) return [];
  const out: { kind: string; message: string }[] = [];
  const d = v.drift!;
  const off = Math.max(Math.abs(d.stocks - v.mix.stocks), Math.abs(d.bonds - v.mix.bonds), Math.abs(d.cash - v.mix.cash));
  if (off >= 5) {
    out.push({ kind: 'paper_drift', message: `${v.name} has drifted ${off.toFixed(0)} points from its mix (now ${d.stocks.toFixed(0)}% stocks vs ${v.mix.stocks}% planned).` });
  }
  if (v.remainingRequired != null && v.requiredAtStart != null && v.remainingRequired - v.requiredAtStart >= 0.015) {
    out.push({ kind: 'paper_behind', message: `${v.name} is behind plan: it now needs ${pct(v.remainingRequired)} a year to reach ${usd(v.target)}, up from ${pct(v.requiredAtStart)} at the start.` });
  }
  if (v.vsBenchmark != null && v.vsBenchmark <= -0.03) {
    out.push({ kind: 'paper_benchmark', message: `${v.name} trails its plain index benchmark by ${pct(-v.vsBenchmark)}. Worth checking which holdings are dragging.` });
  }
  return out;
}

const proCache = new Map<string, boolean>();
async function isPro(userId: string): Promise<boolean> {
  if (!proCache.has(userId)) {
    const plan = await getPlan(userId, supabaseAdmin).catch(() => null);
    proCache.set(userId, plan?.plan === 'pro');
  }
  return proCache.get(userId)!;
}

/** Fires drift / behind-plan / benchmark alerts for Pro members' experiments, at most once per kind per 30 days. */
export async function runPaperAlerts(): Promise<{ checked: number; fired: number }> {
  proCache.clear();
  const { rows, valued } = await loadAll();
  const byId = new Map(rows.map((r) => [r.id, r]));
  let fired = 0;
  let checked = 0;
  const now = Date.now();
  for (const v of valued) {
    const row = byId.get(v.id)!;
    if (!row.user_id) continue;
    checked++;
    const due = checks(v).filter((c) => {
      const last = row.alert_state?.[c.kind];
      return !last || now - Date.parse(last) > COOLDOWN_DAYS * 864e5;
    });
    if (!due.length || !(await isPro(row.user_id))) continue;
    const { error } = await supabaseAdmin.from('alert_events').insert(
      due.map((c) => ({ owner_id: row.user_id, ticker: 'PAPER', kind: c.kind, message: c.message, payload: { account: v.id } }))
    );
    if (error) continue;
    const state = { ...(row.alert_state ?? {}) };
    for (const c of due) state[c.kind] = new Date(now).toISOString();
    await supabaseAdmin.from('paper_accounts').update({ alert_state: state }).eq('id', v.id);
    fired += due.length;
  }
  return { checked, fired };
}

function line(v: Valued): string {
  if (v.status !== 'live') return `${v.name}: starts at the next market close.`;
  return `${v.name}: ${usd(v.value!)} (${signed(v.totalReturn!)}, ${signed(v.vsBenchmark!)} vs benchmark). Needs ${v.remainingRequired == null ? '–' : pct(v.remainingRequired)} a year from here.`;
}

function emailHtml(name: string, mine: Valued[], leader: Valued | undefined): string {
  const rows = mine
    .map((v) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee"><strong>${escapeHtml(v.name)}</strong><br><span style="color:#666;font-size:13px">${escapeHtml(line(v).replace(`${v.name}: `, ''))}</span></td></tr>`)
    .join('');
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 4px">Your weekly 3x progress</h2>
<p style="color:#666;margin:0 0 16px">Hi ${escapeHtml(name)}, here is where your virtual $100,000 experiments stand.</p>
<table style="width:100%;border-collapse:collapse">${rows}</table>
${leader?.status === 'live' ? `<p style="font-size:13px;color:#444">Standard account leading so far: ${escapeHtml(line(leader))}</p>` : ''}
<p><a href="${SITE}/app/paper" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open your paper accounts</a></p>
<p style="font-size:11px;color:#888">Virtual portfolios: simulated money, no real funds invested. Educational only, not investment advice.
Turn these emails off on the <a href="${SITE}/app/paper" style="color:#888">paper accounts page</a>.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return Boolean(res?.ok);
}

/** Weekly digest for every user with at least one experiment. */
export async function runWeeklyDigest(): Promise<{ users: number; emailed: number; emailConfigured: boolean }> {
  const { valued, rows, standard } = await loadAll();
  const owner = new Map(rows.map((r) => [r.id, r.user_id]));
  const byUser = new Map<string, Valued[]>();
  for (const v of valued) {
    const u = owner.get(v.id);
    if (u) byUser.set(u, [...(byUser.get(u) ?? []), v]);
  }
  const leader = [...standard].filter((v) => v.status === 'live').sort((a, b) => (b.totalReturn ?? 0) - (a.totalReturn ?? 0))[0];
  const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  let emailed = 0;
  const { data: prefs } = await supabaseAdmin.from('user_preferences').select('owner_id, weekly_email').in('owner_id', [...byUser.keys()]);
  const optedOut = new Set(((prefs ?? []) as { owner_id: string; weekly_email: boolean }[]).filter((p) => p.weekly_email === false).map((p) => p.owner_id));
  for (const [userId, mine] of byUser) {
    const summary = mine.map(line).join(' ');
    await supabaseAdmin.from('alert_events').insert({
      owner_id: userId,
      ticker: 'PAPER',
      kind: 'paper_weekly',
      message: `Weekly progress. ${summary}`.slice(0, 500),
      payload: { accounts: mine.map((v) => v.id) },
    });
    if (!emailConfigured || optedOut.has(userId)) continue;
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const user = data?.user;
    if (!user?.email || user.user_metadata?.qa) continue;
    const name = (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? 'there';
    const lead = mine.find((v) => v.status === 'live');
    const subject = lead ? `${lead.name}: ${signed(lead.totalReturn!)} so far, ${lead.remainingRequired == null ? '' : `needs ${pct(lead.remainingRequired)}/yr`}`.trim() : 'Your 3x experiments this week';
    if (await sendEmail(user.email, subject, emailHtml(name, mine, leader))) emailed++;
  }
  return { users: byUser.size, emailed, emailConfigured };
}

/** Admin check of the email setup: sends a sample digest (standard accounts) to the caller only. */
export async function sendTestDigest(userId: string): Promise<{ configured: boolean; sent: boolean; to: string | null }> {
  const configured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = data?.user?.email ?? null;
  const masked = email ? email.replace(/^(.).*(@.*)$/, '$1***$2') : null;
  if (!configured || !email) return { configured, sent: false, to: masked };
  const { standard } = await loadAll();
  const sample = standard.filter((v) => ['V04', 'V06', 'V08'].includes(v.code ?? ''));
  const sent = await sendEmail(email, 'Test: your weekly 3x progress', emailHtml('there', sample, sample.at(-1)));
  return { configured, sent, to: masked };
}
