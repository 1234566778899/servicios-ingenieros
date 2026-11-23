import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Tema elegido: claro, oscuro o el del sistema operativo. Se recuerda en cada equipo. */
export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'theme';
const query = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

function stored(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const Ctx = createContext<{ mode: ThemeMode; dark: boolean; setMode: (m: ThemeMode) => void }>({
  mode: 'system', dark: false, setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(stored);
  const [systemDark, setSystemDark] = useState(() => !!query()?.matches);

  // Si el sistema cambia de tema (p. ej. modo nocturno automático) y se eligió «Según el sistema», la app lo sigue
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const dark = mode === 'dark' || (mode === 'system' && systemDark);

  // Barras de desplazamiento, calendarios y controles nativos del navegador en el mismo tema
  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try {
      if (m === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch { /* sin almacenamiento: vale solo para esta visita */ }
  };

  return <Ctx.Provider value={{ mode, dark, setMode }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
