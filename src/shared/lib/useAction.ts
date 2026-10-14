import { useEffect, useRef, useState } from 'react';
export function useAction() {
  const busy = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return { run, pending, error, setError };
}
