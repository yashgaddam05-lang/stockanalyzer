// LLM access for the assistant, through OpenRouter so models can be switched (and later assigned per plan) without
// code changes. Plain fetch against the OpenAI-compatible chat completions endpoint; no SDK.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Who is asking. Plans (packages with their own models) come later; today every signed-in user is a member. */
export type AssistantTier = 'guest' | 'member';

const DEFAULT_MODEL = 'anthropic/claude-opus-5.5';
const DEFAULT_FALLBACK = 'anthropic/claude-sonnet-5.5';

/** Model per tier, from env so it can change without a deploy of new code: ASSISTANT_MODEL, ASSISTANT_GUEST_MODEL. */
export function modelsFor(tier: AssistantTier): string[] {
  const primary = (tier === 'guest' ? process.env.ASSISTANT_GUEST_MODEL : undefined) || process.env.ASSISTANT_MODEL || DEFAULT_MODEL;
  const fallback = process.env.ASSISTANT_FALLBACK_MODEL || DEFAULT_FALLBACK;
  return primary === fallback ? [primary] : [primary, fallback];
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
  webSearch?: { maxResults: number };
};

function body(req: ChatRequest, stream: boolean) {
  const [model, ...fallbacks] = modelsFor(req.tier);
  return JSON.stringify({
    model,
    ...(fallbacks.length ? { models: [model, ...fallbacks] } : {}),
    stream,
    max_tokens: req.maxTokens,
    reasoning: { effort: req.effort, exclude: true },
    ...(req.webSearch ? { plugins: [{ id: 'web', max_results: req.webSearch.maxResults }], web_search_options: { search_context_size: 'high' } } : {}),
    messages: [
      {
        role: 'system',
        content: req.system.map((s): Part => ({ type: 'text', text: s.text, ...(s.cache ? { cache_control: { type: 'ephemeral' } } : {}) })),
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

/** Streams the reply, calling onText per chunk. Resolves with the finish reason. */
export async function streamChat(req: ChatRequest, onText: (text: string) => void): Promise<string | null> {
  const response = await post(req, true);
  if (!response.body) throw new LlmError('Empty response', 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finish: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      // Blank lines and ": OPENROUTER PROCESSING" keep-alive comments carry no data.
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return finish;
      let chunk: { error?: { message?: string; code?: number }; choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[] };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new LlmError(chunk.error.message ?? 'Model error', chunk.error.code ?? 502);
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) onText(choice.delta.content);
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
  }
  return finish;
}

/** One-shot completion (summaries). */
export async function completeChat(req: ChatRequest): Promise<string> {
  const response = await post(req, false);
  const json = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}
