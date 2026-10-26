import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, MessageCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { ApiError, streamAssistant } from '@/lib/api';
import type { AssistantTurn } from '@/lib/api';
import { useStocks } from '@/components/data/StocksProvider';
import { useAssistant } from '@/components/assistant/AssistantProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { offlineAnswer } from '@/components/assistant/offlineHelp';
import type { HelpLink } from '@/components/assistant/offlineHelp';

type ChatTurn = AssistantTurn & { links?: HelpLink[] };

const STARTERS = [
  'Review my portfolio',
  'Tell me about NVDA. Would you buy it at this price?',
  'I have $500. Is TSLA strong or weak right now?',
  'How does the 3x score work?',
];

/** Minimal formatting for replies: paragraphs, "- " bullets and **bold**. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
  );
}

function Reply({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter(Boolean);
        if (lines.length && lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-4">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#+\s*/, ''))}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Describes what the user is looking at so answers can refer to it. */
function useScreenContext() {
  const { pathname } = useLocation();
  const { stocks, analyses } = useStocks();
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
  const screen = useScreenContext();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  /** Set once the AI is unavailable; from then on answers come from the built-in guide. */
  const [offline, setOffline] = useState(false);
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
        setTurns((cur) => [...cur.slice(0, -1), { role: 'assistant', content: a.text, links: a.links }]);
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
      }, 180_000);
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
        } else {
          // AI unavailable (no key, outage, network): fall back to the built-in guide for the rest of the session.
          setOffline(true);
          setTurns((cur) => (cur[cur.length - 1]?.content ? cur : cur.slice(0, -1)));
          setTurns((cur) => [...cur, { role: 'assistant', content: '' }]);
          answerLocally();
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
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col border border-border bg-background shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100vh-40px)] sm:w-[400px] sm:rounded-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white" aria-hidden="true">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-neutral-900">3x Hunter assistant</p>
                <p className="text-[11px] text-neutral-500">{offline ? 'Quick help from the 3x Hunter guide' : 'Stocks, your portfolio and the app'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
                  Hi! I know your portfolio and what we talked about before. Ask me about any stock, your holdings, or how the app works.
                </p>
                <div className="flex flex-col gap-2">
                  {STARTERS.map((s) => (
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
            <p className="mt-1.5 text-[10px] text-neutral-400">
              Educational research, not investment advice.{!offline && remaining !== null ? ` ${remaining} messages left today.` : ''}
            </p>
          </form>
        </div>
      )}
    </>
  );
}
