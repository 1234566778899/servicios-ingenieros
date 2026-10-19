import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, must } from './supabase';
import type { Profile } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  roleName: string;
  perms: Set<string>;
  loading: boolean;
  can: (perm: string) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roleName, setRoleName] = useState('');
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setPerms(new Set());
      setLoading(false);
      return;
    }
    try {
      const p = must(await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()) as Profile | null;
      if (!p || !p.active) {
        await supabase.auth.signOut();
        throw new Error(p ? 'Tu usuario está desactivado. Contacta a un administrador.' : 'Tu usuario no tiene perfil en el sistema.');
      }
      const [role, rp] = await Promise.all([
        supabase.from('roles').select('name').eq('id', p.role_id).single(),
        supabase.from('role_permissions').select('permission_id').eq('role_id', p.role_id),
      ]);
      setRoleName(role.data?.name ?? p.role_id);
      setPerms(new Set((rp.data ?? []).map((r) => r.permission_id)));
      setProfile(p);
      supabase.rpc('touch_last_seen').then(() => {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session).catch(() => {});
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') loadProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Marca "último acceso" periódicamente para el contador de usuarios conectados
  useEffect(() => {
    if (!profile) return;
    const t = setInterval(() => supabase.rpc('touch_last_seen').then(() => {}), 120_000);
    return () => clearInterval(t);
  }, [profile]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message === 'Invalid login credentials' ? 'Usuario o contraseña incorrectos.' : error.message);
    }
    setLoading(true);
    await loadProfile(data.session);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthCtx.Provider
      value={{ session, profile, roleName, perms, loading, can: (p) => perms.has(p), signIn, signOut }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
