import {
  readJsonBody,
  resolveAuth,
  sendBadRequest,
  sendMethodNotAllowed,
  sendUnauthorized,
  supabase as anonymousDb,
  type ApiRequest,
  type ApiResponse,
} from '../_supabase.js';
import { completeChat } from '../_llm.js';
import { visitorHash } from '../_visitor.js';
import { getPlan } from '../_plan.js';

// POST /api/voice
//   { action: "transcribe", audio: <base64>, mime: "audio/webm" }  -> { text }      (ElevenLabs Scribe)
//   { action: "speak", text: "<reply markdown>" }                    -> audio/mpeg   (ElevenLabs text to speech)
// Voice for the assistant, so people who find typing or reading hard can talk to it and listen to answers. Signed in or
// out, with daily limits per account or per visitor (voice_consume). Long answers are condensed to a spoken summary.

const ELEVEN = 'https://api.elevenlabs.io/v1';
// ElevenLabs default voice; set ELEVENLABS_VOICE_ID to change it.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
const STT_MODEL = 'scribe_v2';
const MAX_AUDIO_BASE64 = 3_000_000; // ~2 minutes of compressed speech, under Vercel's 4.5 MB body limit
const MAX_SPOKEN_CHARS = 1600;
const SUMMARIZE_OVER = 1400;

type BinaryResponse = ApiResponse & { setHeader: (name: string, value: string) => void; end: (body?: Buffer) => void };

const SPOKEN_PROMPT = `Rewrite this stock research answer as a short spoken briefing for someone listening, not reading.
120 to 180 words, plain sentences, no lists, tables, symbols, links or chart descriptions. Keep the verdict or lean, the
two or three numbers that matter most (say them naturally, for example "about four hundred dollars"), the next key date,
and end with: "This is educational research, not financial advice." Do not add anything that is not in the answer.`;

/** Markdown answer to plain text a voice can read: drops charts, tables, sources, links and formatting. */
function toPlainSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*\|/.test(line) && !/^\s*sources\b/i.test(line))
    .join('\n')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#>`~]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (end > max * 0.6 ? cut.slice(0, end + 1) : cut).trim();
}

/** Counts usage against the caller's daily voice limit; null when their sign-in expired. */
async function consume(request: ApiRequest, kind: 'tts' | 'stt', amount: number): Promise<{ ok: boolean; upgrade?: boolean } | null> {
  const auth = await resolveAuth(request);
  if (auth.kind === 'invalid') return null;
  // Voice runs on paid ElevenLabs minutes: Pro only.
  if (auth.kind !== 'user' || (await getPlan(auth.userId, auth.db)).plan !== 'pro') return { ok: false, upgrade: true };
  const db = auth.kind === 'user' ? auth.db : anonymousDb;
  const { data, error } = await db.rpc('voice_consume', {
    p_kind: kind,
    p_amount: amount,
    p_ip_hash: auth.kind === 'user' ? null : visitorHash(request),
  });
  return { ok: !error && typeof data === 'number' && data >= 0 };
}

async function transcribe(request: ApiRequest, response: ApiResponse, body: Record<string, unknown>): Promise<void> {
  const audio = typeof body.audio === 'string' ? body.audio : '';
  const mime = typeof body.mime === 'string' && /^audio\/[\w.+-]+(;.*)?$/.test(body.mime) ? body.mime.split(';')[0] : 'audio/webm';
  if (!audio || audio.length > MAX_AUDIO_BASE64) {
    sendBadRequest(response, 'Send up to 2 minutes of audio.');
    return;
  }
  const quota = await consume(request, 'stt', 1);
  if (!quota) return sendUnauthorized(response, 'Your session expired. Sign in again.');
  if (!quota.ok) {
    if (quota.upgrade) {
      response.status(402).json({ error: 'Voice is part of 3x Hunter Pro. You can still type your question.', upgrade: true });
      return;
    }
    response.status(429).json({ error: "You've reached today's voice limit. You can still type your question." });
    return;
  }
  const form = new FormData();
  form.append('model_id', STT_MODEL);
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([Buffer.from(audio, 'base64')], { type: mime }), `speech.${mime.split('/')[1] ?? 'webm'}`);
  const result = await fetch(`${ELEVEN}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' },
    body: form,
  });
  if (!result.ok) {
    console.error('voice transcribe failed', result.status, (await result.text()).slice(0, 300));
    response.status(502).json({ error: "I couldn't hear that clearly. Please try again." });
    return;
  }
  const json = (await result.json()) as { text?: string };
  response.status(200).json({ text: (json.text ?? '').trim() });
}

async function speak(request: ApiRequest, rawResponse: ApiResponse, body: Record<string, unknown>): Promise<void> {
  const response = rawResponse as BinaryResponse;
  const source = typeof body.text === 'string' ? body.text.slice(0, 40000) : '';
  let text = toPlainSpeech(source);
  if (!text) {
    sendBadRequest(response, 'Nothing to read aloud.');
    return;
  }
  if (text.length > SUMMARIZE_OVER) {
    // Long reports become a short spoken briefing; reading tables and charts aloud helps nobody.
    try {
      text = toPlainSpeech(
        await completeChat({ tier: 'guest', system: [{ text: SPOKEN_PROMPT }], messages: [{ role: 'user', content: source.slice(0, 30000) }], maxTokens: 2000, effort: 'low' })
      ) || text;
    } catch (error) {
      console.error('voice summary failed', (error as Error)?.message ?? error);
    }
  }
  text = clip(text, MAX_SPOKEN_CHARS);
  const quota = await consume(request, 'tts', text.length);
  if (!quota) return sendUnauthorized(response, 'Your session expired. Sign in again.');
  if (!quota.ok) {
    if (quota.upgrade) {
      response.status(402).json({ error: 'Voice is part of 3x Hunter Pro. The answer is still on screen.', upgrade: true });
      return;
    }
    response.status(429).json({ error: "You've reached today's voice limit. The answer is still on screen." });
    return;
  }
  const result = await fetch(`${ELEVEN}/text-to-speech/${encodeURIComponent(VOICE_ID)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: TTS_MODEL }),
  });
  if (!result.ok) {
    console.error('voice speak failed', result.status, (await result.text()).slice(0, 300));
    response.status(502).json({ error: 'Audio is not available right now.' });
    return;
  }
  const audio = Buffer.from(await result.arrayBuffer());
  response.setHeader('Content-Type', 'audio/mpeg');
  response.setHeader('Cache-Control', 'no-store');
  response.status(200);
  response.end(audio);
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(response, ['POST']);
    return;
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    response.status(503).json({ error: 'Voice is not available right now.' });
    return;
  }
  const body = readJsonBody(request);
  if (!body) {
    sendBadRequest(response, 'Invalid request.');
    return;
  }
  if (body.action === 'transcribe') await transcribe(request, response, body);
  else if (body.action === 'speak') await speak(request, response, body);
  else sendBadRequest(response, 'Unknown voice action.');
}
