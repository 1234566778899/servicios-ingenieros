import { createContext, startTransition, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';

/** Devuelve true si se encarga de la navegación (p. ej. pide confirmar y llama a `go` si se acepta). */
export type Blocker = (go: () => void) => boolean;

const RouterCtx = createContext<{ path: string; navigate: (p: string) => void; blocker: MutableRefObject<Blocker | null> }>({
  path: '/', navigate: () => {}, blocker: { current: null },
});

function current() {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(current);
  const blocker = useRef<Blocker | null>(null);
  useEffect(() => {
    // En transición: si la pantalla nueva aún se está descargando (lazy), React deja visible la actual en vez de
    // cambiar toda la página por el indicador de carga del Suspense
    const onHash = () => startTransition(() => setPath(current()));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = (p: string) => {
    const go = () => { window.location.hash = p; };
    if (blocker.current?.(go)) return;
    go();
  };
  return <RouterCtx.Provider value={{ path, navigate, blocker }}>{children}</RouterCtx.Provider>;
}

export const useRouter = () => useContext(RouterCtx);

/**
 * Mientras `fn` no sea null, las navegaciones de la app (menú, migas, enlaces) pasan primero por ella
 * y al recargar o cerrar la pestaña el navegador pide confirmar.
 */
export function useNavigationBlock(fn: Blocker | null) {
  const { blocker } = useContext(RouterCtx);
  useEffect(() => {
    if (!fn) return;
    blocker.current = fn;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      if (blocker.current === fn) blocker.current = null;
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [fn, blocker]);
}

// Última dirección de la lista de servicios (página y filtros): «Servicios» en las migas y «Cancelar» vuelven a ella
const SERVICES_KEY = 'lastServicesUrl';
export function servicesUrl() {
  try { return sessionStorage.getItem(SERVICES_KEY) || '/servicios'; } catch { return '/servicios'; }
}
export function rememberServicesUrl(url: string) {
  try { sessionStorage.setItem(SERVICES_KEY, url); } catch { /* sin almacenamiento */ }
}

/** Compara "/servicios/:id" con la ruta actual y devuelve los parámetros o null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('?')[0].split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
