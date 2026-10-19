import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface Conn {
  online: boolean;
  lastSync: Date | null;
  lastAttempt: Date | null;
  retryIn: number;
  retry: () => void;
}

const Ctx = createContext<Conn>(null as any);
const URL_HEALTH = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;

/** Vigila la conexión con la nube (RF-05.3 / RF-08.1): la app no funciona sin Internet. */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [lastAttempt, setLastAttempt] = useState<Date | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const timer = useRef<number>(0);

  const check = async () => {
    setLastAttempt(new Date());
    try {
      const res = await fetch(URL_HEALTH, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(8000),
      });
      const ok = res.ok;
      setOnline(ok);
      if (ok) setLastSync(new Date());
      return ok;
    } catch {
      setOnline(false);
      return false;
    }
  };

  useEffect(() => {
    check();
    const goOffline = () => setOnline(false);
    const goOnline = () => check();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    const poll = setInterval(check, 60_000);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      clearInterval(poll);
    };
  }, []);

  // Sin conexión: reintenta cada 15 s con cuenta regresiva
  useEffect(() => {
    if (online) {
      setRetryIn(0);
      return;
    }
    setRetryIn(15);
    timer.current = window.setInterval(() => {
      setRetryIn((s) => {
        if (s <= 1) {
          check();
          return 15;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current);
  }, [online]);

  return (
    <Ctx.Provider value={{ online, lastSync, lastAttempt, retryIn, retry: () => void check() }}>
      {children}
    </Ctx.Provider>
  );
}

export const useConnection = () => useContext(Ctx);
