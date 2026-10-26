import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, Maximize2, MessageCircle, Minimize2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { ApiError, streamAssistant } from '@/lib/api';
import type { AssistantTurn } from '@/lib/api';
import { useOptionalStocks } from '@/components/data/StocksProvider';
import { useAssistant } from '@/components/assistant/AssistantProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { offlineAnswer } from '@/components/assistant/offlineHelp';
import { ChatChart } from '@/components/assistant/ChatChart';
import type { HelpLink } from '@/components/assistant/offlineHelp';

type ChatTurn = AssistantTurn & { links?: HelpLink[] };

const HELP_STARTERS = [
  'How does the 3x score work?',
  'How do I import my holdings from my brokerage?',
  'What do the 3x Bots do?',
  'Which preset screen should I start with?',
];

const GUEST_STARTERS = [
  'What can 3x Hunter do for me?',
  'How does the 3x score work?',
  'Can it analyze my portfolio?',
  'Is it free?',
];

/** Starters built from the signed-in user's own stocks and the page they are on. */
function useStarters(viewing: string | undefined): string[] {
  const data = useOptionalStocks();
  const followed = data
    ? data.stocks
        .filter((s) => data.watchlist.has(s.ticker))
        .sort((a, b) => (b.three_x_score ?? 0) - (a.three_x_score ?? 0))
        .map((s) => s.ticker)
    : [];
  const out = [
    viewing ? `Give me the full analysis of ${viewing}: short and long term, and how it fits my portfolio.` : null,
    'Review my portfolio: every holding, the risks, and the top 3 moves you would make.',
    followed[0] && followed[0] !== viewing ? `Deep dive on ${followed[0]}: strong or weak right now, and why?` : null,
    followed.length > 1 ? 'Which of my stocks looks weakest right now, and what would you do about it?' : 'Find stocks that fit my profile and explain why.',
    'What events are coming up for my stocks in the next 90 days?',
  ].filter((x): x is string => !!x);
  return out.slice(0, 4);
}

const SAFE_HREF = /^(\/(?!\/)|https?:\/\/)/;

/** Inline markdown: **bold**, *italic* and [links](url); internal links route in-app, external open a new tab. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link && SAFE_HREF.test(link[2])) {
      const cls = 'font-medium text-neutral-900 underline underline-offset-2';
      return link[2].startsWith('/') ? (
        <Link key={i} to={link[2]} className={cls}>{link[1]}</Link>
      ) : (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className={cls}>{link[1]}</a>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Markdown subset for replies: headings, paragraphs, bullet and numbered lists, tables, bold, italics, links. */
function Reply({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s*```\s*([\w-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      const closed = i < lines.length;
      i++;
      if (fence[1] === 'chart') {
        blocks.push(
          closed ? (
            <ChatChart key={blocks.length} raw={body.join('\n')} />
          ) : (
            <p key={blocks.length} className="inline-flex items-center gap-1.5 text-[12px] text-neutral-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Drawing chart...
            </p>
          )
        );
      } else {
        blocks.push(
          <pre key={blocks.length} className="overflow-x-auto rounded-lg bg-neutral-900 p-2 text-[11px] text-neutral-100">
            {body.join('\n')}
          </pre>
        );
      }
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      const [head, ...rest] = body.map(cells);
      blocks.push(
        <div key={blocks.length} className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>{head?.map((c, j) => <th key={j} className="border-b border-neutral-300 px-1.5 py-1 text-left font-semibold">{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rest.map((r, k) => (
                <tr key={k} className="border-b border-neutral-200 last:border-0">
                  {r.map((c, j) => <td key={j} className="px-1.5 py-1 align-top">{inline(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<p key={blocks.length} className="pt-1 text-[14px] font-semibold text-neutral-900">{inline(heading[1])}</p>);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag key={blocks.length} className={cn('space-y-1 pl-4', ordered ? 'list-decimal' : 'list-disc')}>
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ListTag>
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(\||#{1,6}\s|[-*]\s|\d+\.\s|```)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    blocks.push(
      <p key={blocks.length}>
        {para.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l)}
          </Fragment>
        ))}
      </p>
    );
  }
  return <div className="space-y-2">{blocks}</div>;
}

/** Describes what the user is looking at so answers can refer to it. */
function useScreenContext() {
  const { pathname } = useLocation();
  const data = useOptionalStocks();
  const stocks = data?.stocks ?? [];
  const analyses = data?.analyses ?? {};
  const ticker = /^\/app\/stock\/([^/]+)/.exec(pathname)?.[1]?.toUpperCase();
  const stock = ticker ? stocks.find((x) => x.ticker.toUpperCase() === ticker) : undefined;
  const analysis = ticker ? analyses[stock?.ticker ?? ticker] : undefined;
  const text = useCallback(() => {
    const lines = [`Page: ${pathname}`];
    if (ticker) {
      const s = stock;
      const a = analysis;
      if (s) {
        lines.push(`Viewing ${s.ticker} (${s.company_name}), sector ${s.sector ?? 'unknown'}, price ${s.current_price ?? 'n/a'}.`);
      }
      if (a) {
        lines.push(
          `3x score ${Math.round(a.totalScore)} (${a.rating}, confidence ${a.confidence}), risk score ${Math.round(a.riskScore)} (${a.riskLabel}).`
        );
        lines.push(
          `Dimensions: ${a.dimensions.map((d) => `${d.label} ${d.score == null ? 'unscored' : Math.round(d.score)}`).join('; ')}.`
        );
        if (a.riskDrivers.length) lines.push(`Risk drivers: ${a.riskDrivers.slice(0, 4).join('; ')}.`);
      }
    }
    return lines.join('\n');
  }, [pathname, ticker, stock, analysis]);
  return { pathname, stock, analysis, text };
}

export function AssistantWidget() {
  const assistant = useAssistant();
  const userId = useAuth().user?.id ?? null;
  const guest = !userId;
  const screen = useScreenContext();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  /** Set once the AI is unavailable; from then on answers come from the built-in guide. */
  const [offline, setOffline] = useState(false);
  /** Full reports need room: signed-in chats open wide on larger screens. */
  const [wide, setWide] = useState(true);
  const starters = useStarters(screen.stock?.ticker);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Server-side chat session; past sessions are summarized into this account, never shared with another. */
  const sessionRef = useRef<string | null>(null);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    sessionRef.current = null;
    setTurns([]);
    setError(null);
  }, []);

  // A different account signing in starts from a clean slate in this tab.
  useEffect(() => {
    newChat();
    setRemaining(null);
  }, [userId, newChat]);

  const open = assistant?.open ?? false;

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const history: AssistantTurn[] = [...turns.map(({ role, content }) => ({ role, content })), { role: 'user', content: q }];
      setTurns((cur) => [...cur, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
      setDraft('');
      setError(null);
      setBusy(true);
      const answerLocally = () => {
        const a = offlineAnswer(q, screen);
        const note = '*Live analysis is unavailable right now, so this is a quick answer from the built-in guide. Try again in a few minutes for a full answer.*';
        setTurns((cur) => [...cur.slice(0, -1), { role: 'assistant', content: `${note}\n\n${a.text}`, links: a.links }]);
      };
      if (offline) {
        setTimeout(() => {
          answerLocally();
          setBusy(false);
        }, 250);
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 290_000);
      try {
        const result = await streamAssistant(
          { messages: history, context: screen.text(), session_id: sessionRef.current },
          (text) =>
            setTurns((cur) => {
              const next = [...cur];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + text };
              return next;
            }),
          controller.signal
        );
        if (result.remaining !== null) setRemaining(result.remaining);
        if (result.sessionId) sessionRef.current = result.sessionId;
      } catch (err) {
        if (controller.signal.aborted && !timedOut) return;
        if (err instanceof ApiError && err.status === 429) {
          setError(err.message);
          setTurns((cur) => (cur[cur.length - 1]?.content ? cur : cur.slice(0, -1)));
        } else if (err instanceof ApiError && err.status === 503) {
          // AI not configured or down: fall back to the built-in guide for the rest of the session.
          setOffline(true);
          setTurns((cur) => (cur[cur.length - 1]?.content ? cur : cur.slice(0, -1)));
          setTurns((cur) => [...cur, { role: 'assistant', content: '' }]);
          answerLocally();
        } else {
          // One failed or cut-off answer (timeout, network, model error): keep what arrived and stay live.
          setError(timedOut ? 'That answer took too long and was cut off. Ask again, or narrow the question.' : err instanceof Error ? err.message : 'The assistant could not answer. Please try again.');
          setTurns((cur) => (cur[cur.length - 1]?.content ? cur : cur.slice(0, -1)));
        }
      } finally {
        clearTimeout(timer);
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, turns, screen, offline]
  );

  // Questions queued from info icons elsewhere in the app.
  useEffect(() => {
    if (!open || !assistant?.pending || busy) return;
    const q = assistant.takePending();
    if (q) void send(q);
  }, [open, assistant, busy, send]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!assistant) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => assistant.setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-[13px] font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
          aria-label="Ask the 3x Hunter assistant"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Ask a question
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="3x Hunter assistant"
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col border border-border bg-background shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:max-h-[calc(100vh-40px)] sm:rounded-2xl',
            wide && !guest ? 'sm:h-[calc(100vh-40px)] sm:w-[min(760px,calc(100vw-40px))]' : 'sm:h-[600px] sm:w-[400px]'
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white" aria-hidden="true">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-neutral-900">3x Hunter assistant</p>
                <p className="text-[11px] text-neutral-500">{offline ? 'Quick help from the 3x Hunter guide' : guest ? 'Ask what 3x Hunter can do' : 'Stocks, your portfolio and the app'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!guest && (
                <button
                  type="button"
                  onClick={() => setWide((w) => !w)}
                  className="hidden h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 sm:flex"
                  aria-label={wide ? 'Make the chat smaller' : 'Make the chat wider'}
                  title={wide ? 'Smaller' : 'Wider'}
                >
                  {wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              )}
              {turns.length > 0 && !offline && (
                <button
                  type="button"
                  onClick={newChat}
                  disabled={busy}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40"
                  aria-label="Start a new chat"
                  title="New chat"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => assistant.setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-neutral-600">
                  {guest
                    ? 'Hi! I can show you what 3x Hunter does, how the scores work and what every page is for. Create a free account and I can analyze any stock against your own portfolio.'
                    : 'Hi! I know your portfolio and what we talked about before. Ask me about any stock, your holdings, or how the app works.'}
                </p>
                <div className="flex flex-col gap-2">
                  {(guest ? GUEST_STARTERS : offline ? HELP_STARTERS : starters).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-lg border border-border px-3 py-2 text-left text-[13px] text-neutral-800 hover:border-neutral-400"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-neutral-900 px-3 py-2 text-[13px] text-white">
                  {t.content}
                </div>
              ) : (
                <div key={i} className="mr-4 rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-[13px] leading-relaxed text-neutral-900">
                  {t.content ? (
                    <>
                      <Reply text={t.content} />
                      {t.links && t.links.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {t.links.map((l) => (
                            <Link
                              key={l.to + l.label}
                              to={l.to}
                              onClick={() => {
                                if (window.matchMedia('(max-width: 639px)').matches) assistant.setOpen(false);
                              }}
                              className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[12px] font-medium text-neutral-900 hover:border-neutral-900"
                            >
                              {l.label} →
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-neutral-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Thinking...
                    </span>
                  )}
                </div>
              )
            )}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800">{error}</p>}
          </div>

          <form
            className="border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="Ask about a stock, your portfolio, the app..."
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-neutral-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white',
                  'disabled:opacity-40'
                )}
                aria-label="Send"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            {guest ? (
              <p className="mt-1.5 text-[11px] text-neutral-500">
                <Link to="/signup" className="font-semibold text-neutral-900 underline underline-offset-2">
                  Create a free account
                </Link>{' '}
                for full stock reports on your own portfolio. Educational research, not investment advice.
              </p>
            ) : (
              <p className="mt-1.5 text-[10px] text-neutral-400">
                Educational research, not investment advice.{!offline && remaining !== null ? ` ${remaining} messages left today.` : ''}
              </p>
            )}
          </form>
        </div>
      )}
    </>
  );
}
