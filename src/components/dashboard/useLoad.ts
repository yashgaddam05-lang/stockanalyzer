import { useCallback, useEffect, useState } from 'react';

export type LoadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** Runs an async loader on mount (and when deps change); exposes a retry. Never throws. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []): [LoadState<T>, () => void] {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    loader()
      .then((data) => active && setState({ status: 'ready', data }))
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return [state, retry];
}
