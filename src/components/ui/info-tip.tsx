import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Info, MessageCircle, X } from 'lucide-react';
import { EXPLAINERS } from '@/lib/explainers';
import type { ExplainerKey } from '@/lib/explainers';
import { useAssistant } from '@/components/assistant/AssistantProvider';
import { cn } from '@/lib/utils';

/** Small "i" button that explains a metric or screen, links to Methodology and can hand off to the assistant. */
export function InfoTip({ topic, className, align = 'left' }: { topic: ExplainerKey; className?: string; align?: 'left' | 'right' }) {
  const e = EXPLAINERS[topic];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const assistant = useAssistant();

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn('relative inline-flex align-middle', className)}>
      <button
        type="button"
        onClick={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What is ${e.title}?`}
        className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label={e.title}
          onClick={(ev) => ev.stopPropagation()}
          className={cn(
            'absolute top-7 z-50 block w-[min(320px,calc(100vw-32px))] rounded-xl border border-border bg-background p-4 text-left shadow-xl animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="block text-[13px] font-semibold text-neutral-900">{e.title}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:text-neutral-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
          <span className="mt-1.5 block text-[12px] font-normal normal-case leading-relaxed tracking-normal text-neutral-600">{e.body}</span>
          <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              to={`/methodology#${e.anchor}`}
              className="inline-flex items-center gap-1 text-[12px] font-medium normal-case tracking-normal text-neutral-900 underline-offset-4 hover:underline"
            >
              Full explanation <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
            {assistant && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  assistant.ask(e.ask);
                }}
                className="inline-flex items-center gap-1 text-[12px] font-medium normal-case tracking-normal text-neutral-600 hover:text-neutral-900"
              >
                <MessageCircle className="h-3 w-3" aria-hidden="true" /> Ask the assistant
              </button>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
