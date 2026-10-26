import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Solo vale la última consulta: si una anterior responde tarde (p. ej. al escribir en un filtro), se descarta
  const lastRun = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(async () => {
    const id = ++lastRun.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === lastRun.current) setData(result);
    } catch (e: any) {
      if (id === lastRun.current) setError(e.message ?? String(e));
    } finally {
      if (id === lastRun.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}
