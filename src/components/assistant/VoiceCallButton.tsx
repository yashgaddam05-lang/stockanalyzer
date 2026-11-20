import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSiteStatus } from '@/lib/api';

// Talk to the 3x Hunter voice agent (Vapi) from any page. The public key is a browser key by design;
// the agent's prompt and live facts live in Vapi and /api/agent-knowledge.
/** Hard cap per call so a forgotten tab can't burn Vapi minutes. */
const MAX_CALL_SECONDS = 300;

type VapiClient = InstanceType<typeof import('@vapi-ai/web').default>;
type Status = 'idle' | 'connecting' | 'live' | 'error';

export function VoiceCallButton() {
  const [status, setStatus] = useState<Status>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const vapi = useRef<VapiClient | null>(null);
  const [config, setConfig] = useState<{ publicKey: string; assistantId: string } | null>(null);

  // Key and assistant come from the server, so they can change in Vercel without a rebuild.
  useEffect(() => {
    getSiteStatus()
      .then((s) => setConfig(s.voice ?? null))
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    if (status !== 'live') return;
    setSeconds(0);
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [status]);

  useEffect(() => () => void vapi.current?.stop(), []);

  if (!config) return null;

  async function start() {
    if (!config) return;
    const cfg = config;
    setError(null);
    setStatus('connecting');
    try {
      if (!vapi.current) {
        const { default: Vapi } = await import('@vapi-ai/web');
        const client = new Vapi(cfg.publicKey, undefined, { avoidEval: true });
        client.on('call-start', () => setStatus('live'));
        client.on('call-end', () => {
          setStatus('idle');
          setSpeaking(false);
          setMuted(false);
        });
        client.on('speech-start', () => setSpeaking(true));
        client.on('speech-end', () => setSpeaking(false));
        client.on('error', (e: unknown) => {
          console.error('Voice call error', e);
          setError('The call dropped. Check your microphone permission and try again.');
          setStatus('error');
        });
        vapi.current = client;
      }
      await vapi.current.start(cfg.assistantId, { maxDurationSeconds: MAX_CALL_SECONDS });
    } catch (e) {
      console.error('Voice call failed to start', e);
      setError('Could not start the call. Allow microphone access and try again.');
      setStatus('error');
    }
  }

  function stop() {
    void vapi.current?.stop();
    setStatus('idle');
  }

  function toggleMute() {
    if (!vapi.current) return;
    const next = !muted;
    vapi.current.setMuted(next);
    setMuted(next);
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  if (status === 'live' || status === 'connecting') {
    return (
      <div
        className="fixed bottom-5 right-[112px] z-40 flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 pl-3 pr-1 text-[12px] font-semibold text-white shadow-lg ring-1 ring-white/20"
        role="status"
        aria-live="polite"
      >
        {status === 'connecting' ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Connecting…
          </>
        ) : (
          <>
            <span className={cn('h-2 w-2 rounded-full bg-white', speaking && 'animate-pulse')} aria-hidden="true" />
            {speaking ? 'Speaking' : 'Listening'} · {mmss}
          </>
        )}
        <button
          type="button"
          onClick={toggleMute}
          disabled={status !== 'live'}
          className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-50"
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={stop}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 hover:bg-red-600"
          aria-label="End call"
        >
          <PhoneOff className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-5 right-[112px] z-40 flex flex-col items-end gap-2">
      {error && <p className="max-w-[260px] rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-800 shadow">{error}</p>}
      <button
        type="button"
        onClick={() => void start()}
        className="inline-flex h-9 w-[84px] items-center justify-center gap-1.5 rounded-full bg-emerald-600 text-[12px] font-semibold text-white shadow-lg ring-1 ring-white/20 transition-transform hover:-translate-y-0.5 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
        aria-label="Talk to the 3x Hunter voice assistant"
        title="Call: talk out loud with our voice assistant"
      >
        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
        Call
      </button>
    </div>
  );
}
