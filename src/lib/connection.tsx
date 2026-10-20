import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface Conn {
  online: boolean;
  retry: () => void;
}

const Ctx = createContext<Conn>(null as any);
const URL_HEALTH = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;

/**
 * Estado de la conexión con la nube (RF-05.3 / RF-08.1): la app no funciona sin Internet.
 * Sin polling: comprueba al iniciar, cuando el sistema avisa que volvió la red y a pedido del usuario.
 */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(navigator.onLine);

  const check = async () => {
    try {
      const res = await fetch(URL_HEALTH, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(8000),
      });
      setOnline(res.ok);
    } catch {
      setOnline(false);
    }
  };

  useEffect(() => {
    check();
    const goOffline = () => setOnline(false);
    const goOnline = () => check();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return <Ctx.Provider value={{ online, retry: () => void check() }}>{children}</Ctx.Provider>;
}

export const useConnection = () => useContext(Ctx);
