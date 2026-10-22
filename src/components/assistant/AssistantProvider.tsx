import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface AssistantContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Question queued by another component (e.g. an info icon); the widget sends it when it opens. */
  pending: string | null;
  ask: (question: string) => void;
  takePending: () => string | null;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const ask = useCallback((question: string) => {
    setPending(question);
    setOpen(true);
  }, []);

  const takePending = useCallback(() => {
    const q = pending;
    setPending(null);
    return q;
  }, [pending]);

  const value = useMemo(() => ({ open, setOpen, pending, ask, takePending }), [open, pending, ask, takePending]);
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAssistant(): AssistantContextValue | null {
  return useContext(AssistantContext);
}
