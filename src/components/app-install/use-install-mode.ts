import { useEffect, useState } from 'react';

/** Chrome / Edge / Android fire this before showing their own install UI; we keep it to show on click. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS reports itself as a Mac with touch.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** 'prompt': one-tap native install. 'ios': show Add to Home Screen steps. null: installed or not installable. */
/** Shows the browser's native install dialog (Chrome, Edge, Android). */
export async function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  await e.prompt();
  await e.userChoice.catch(() => undefined);
  deferred = null;
  listeners.forEach((l) => l());
}

export function useInstallMode(): 'prompt' | 'ios' | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (isStandalone()) return null;
  if (deferred) return 'prompt';
  return isIos() ? 'ios' : null;
}
