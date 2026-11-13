// LLM access for the assistant, through OpenRouter so models can be switched (and later assigned per plan) without
// code changes. Plain fetch against the OpenAI-compatible chat completions endpoint; no SDK.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Who is asking. Plans (packages with their own models) come later; today every signed-in user is a member. */
export type AssistantTier = 'guest' | 'member';

const DEFAULT_MODEL = 'anthropic/claude-opus-5.5';
const DEFAULT_FALLBACK = 'anthropic/claude-sonnet-5.5';
// Strongest free reasoning models on OpenRouter (large context, reasoning, tools), tried in order. Used silently when the
// paid models cannot answer: credits used up, account rate limit, or provider outage. Override with ASSISTANT_FREE_MODELS.
const DEFAULT_FREE = ['nvidia/nemotron-3-ultra-550b-a55b:free', 'thinkingmachines/inkling:free', 'nvidia/nemotron-3.5-super-vl:free'];
const FREE_MAX_TOKENS = 32000;
const FREE_NOTE = `Live web search is not available for this answer. Use only the data in this prompt (portfolio, activity,
past sessions, product knowledge) and what the user said. For any live price, earnings figure, target or date you cannot
confirm from that data, say you couldn't confirm it live and use the app's last refreshed value where one exists,
labeled as such. Keep the same structure, depth, charts and disclaimer.`;

/** Model per tier, from env so it can change without a deploy of new code: ASSISTANT_MODEL, ASSISTANT_GUEST_MODEL. */
export function modelsFor(tier: AssistantTier): string[] {
  const primary = (tier === 'guest' ? process.env.ASSISTANT_GUEST_MODEL : undefined) || process.env.ASSISTANT_MODEL || DEFAULT_MODEL;
  const fallback = process.env.ASSISTANT_FALLBACK_MODEL || DEFAULT_FALLBACK;
  return primary === fallback ? [primary] : [primary, fallback];
}

function freeModels(): string[] {
  const list = (process.env.ASSISTANT_FREE_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_FREE;
}

/** Paid model unavailable for reasons the user should never see: try the free models instead. */
function shouldUseFree(error: unknown): boolean {
  if (!(error instanceof LlmError)) return false;
  return error.status === 402 || error.status === 429 || error.status >= 500 || /credit|no endpoints|unavailable|overloaded/i.test(error.message);
}

export function llmConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export class LlmError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Part = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | Part[] };

export type ChatRequest = {
  tier: AssistantTier;
  /** System blocks in order; `cache` marks the stable prefix for prompt caching. */
  system: { text: string; cache?: boolean }[];
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
  /** Live web results for this turn (OpenRouter web plugin). */
  webSearch?: { maxResults: number; context?: 'low' | 'medium' | 'high' };
  signal?: AbortSignal;
  /** Run on the free models (set internally on fallback, or by a caller continuing after a mid-answer failure). */
  free?: boolean;
  /** Models to try in order, overriding the tier default (answer sizes pick their own). */
  models?: string[];
  /** Real tokens and cost of this call, as reported by OpenRouter. */
  onUsage?: (usage: Usage) => void;
};

export type Usage = { model?: string; inputTokens?: number; outputTokens?: number; costUsd?: number };

type RawUsage = { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined;
const toUsage = (model: string | undefined, u: RawUsage): Usage => ({
  model,
  inputTokens: u?.prompt_tokens,
  outputTokens: u?.completion_tokens,
  costUsd: typeof u?.cost === 'number' ? u.cost : undefined,
});

function body(req: ChatRequest, stream: boolean) {
  const [model, ...fallbacks] = req.free ? freeModels() : req.models?.length ? req.models : modelsFor(req.tier);
  // Free models get no web plugin (it is billed) and a note so they stay grounded in the data they do have.
  const system = req.free ? [...req.system, { text: FREE_NOTE }] : req.system;
  return JSON.stringify({
    model,
    ...(fallbacks.length ? { models: [model, ...fallbacks] } : {}),
    stream,
    usage: { include: true },
    max_tokens: req.free ? Math.min(req.maxTokens, FREE_MAX_TOKENS) : req.maxTokens,
    reasoning: { effort: req.free && req.effort === 'high' ? 'medium' : req.effort, exclude: true },
    ...(req.webSearch && !req.free ? { plugins: [{ id: 'web', max_results: req.webSearch.maxResults }], web_search_options: { search_context_size: req.webSearch.context ?? 'high' } } : {}),
    messages: [
      {
        role: 'system',
        content: system.map((s): Part => ({ type: 'text', text: s.text, ...('cache' in s && s.cache ? { cache_control: { type: 'ephemeral' } } : {}) })),
      },
      ...req.messages,
    ] satisfies ChatMessage[],
  });
}

async function post(req: ChatRequest, stream: boolean, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stockanalyzer-bolot1.vercel.app',
      'X-Title': '3x Hunter',
    },
    body: body(req, stream),
    signal,
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      message = ((await response.json()) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // Non-JSON error body.
    }
    throw new LlmError(message, response.status);
  }
  return response;
}

export type Citation = { url: string; title: string };

export type StreamHandlers = {
  onText: (text: string) => void;
  /** Fires on OpenRouter keep-alives while the model searches or thinks, so the UI can show progress. */
  onWorking?: () => void;
  /** Web sources the search actually returned (from the API, not written by the model). */
  onCitation?: (citation: Citation) => void;
};

/**
 * Streams the reply. Resolves with the finish reason ("stop", "length", ...). If the paid models fail before any text
 * arrives (credits, rate limit, outage), the same request runs on the free models; the user sees the same answer flow.
 */
export async function streamChat(req: ChatRequest, handlers: StreamHandlers): Promise<string | null> {
  let started = false;
  const tracked: StreamHandlers = {
    ...handlers,
    onText: (text) => {
      started = true;
      handlers.onText(text);
    },
  };
  try {
    return await streamOnce(req, tracked);
  } catch (error) {
    if (req.free || started || !shouldUseFree(error)) throw error;
    console.warn('assistant paid model unavailable, using free models', (error as LlmError).status, (error as Error).message);
    return streamOnce({ ...req, free: true }, tracked);
  }
}

export { shouldUseFree };

async function streamOnce(req: ChatRequest, handlers: StreamHandlers): Promise<string | null> {
  const response = await post(req, true, req.signal);
  if (!response.body) throw new LlmError('Empty response', 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finish: string | null = null;
  let model: string | undefined;
  let usage: RawUsage;
  const report = () => req.onUsage?.(toUsage(model, usage));
  try {
    return await readStream();
  } finally {
    report();
  }
  async function readStream(): Promise<string | null> {
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (line.startsWith(':')) {
        // ": OPENROUTER PROCESSING" keep-alive while the model searches or reasons.
        handlers.onWorking?.();
        continue;
      }
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return finish;
      let chunk: {
        model?: string;
        usage?: RawUsage;
        error?: { message?: string; code?: number };
        choices?: {
          delta?: { content?: string | null; reasoning?: string | null; annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[] };
          finish_reason?: string | null;
        }[];
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.model) model = chunk.model;
      if (chunk.usage) usage = chunk.usage;
      if (chunk.error) throw new LlmError(chunk.error.message ?? 'Model error', chunk.error.code ?? 502);
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) handlers.onText(choice.delta.content);
      else if (choice?.delta?.reasoning) handlers.onWorking?.();
      for (const a of choice?.delta?.annotations ?? []) {
        const url = a.url_citation?.url;
        if (a.type === 'url_citation' && url && /^https?:\/\//.test(url)) handlers.onCitation?.({ url, title: a.url_citation?.title || new URL(url).hostname });
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
  }
  return finish;
  }
}

/** One-shot completion (summaries). */
export async function completeChat(req: ChatRequest): Promise<string> {
  let response: Response;
  try {
    response = await post(req, false);
  } catch (error) {
    if (req.free || !shouldUseFree(error)) throw error;
    response = await post({ ...req, free: true }, false);
  }
  const json = (await response.json()) as { model?: string; usage?: RawUsage; choices?: { message?: { content?: string | null } }[] };
  req.onUsage?.(toUsage(json.model, json.usage));
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}
