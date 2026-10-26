import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } },
);

/** Lanza el error de Supabase para que lo capture el llamador. */
export function must<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Trae todas las filas de una consulta en bloques (PostgREST corta cada respuesta en 1000 filas). */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  size = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += size) {
    const chunk = must(await query(from, from + size - 1)) ?? [];
    all.push(...chunk);
    if (chunk.length < size) return all;
  }
}
