import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, must } from './supabase';
import type { Profile } from './types';
import { friendlyError } from './errors';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  roleName: string;
  perms: Set<string>;
  loading: boolean;
  can: (perm: string) => boolean;
  /** Primer ingreso (contraseña = DNI) o enlace de recuperación: debe definir una contraseña nueva */
  mustChangePassword: boolean;
  signIn: (dni: string, password: string) => Promise<void>;
  recover: (tokenHash: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/** En Auth cada usuario tiene un correo interno derivado de su DNI; el correo real está en profiles.email. */
export const authEmail = (dni: string) => `${dni}@dni.nordicoingenieros.com`;

const AuthCtx = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roleName, setRoleName] = useState('');
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

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

  const signIn = async (dni: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail(dni), password });
    if (error) {
      throw new Error(friendlyError(error));
    }
    setLoading(true);
    await loadProfile(data.session);
  };

  // Enlace del correo de recuperación: inicia sesión con el token y obliga a definir una contraseña nueva
  const recover = async (tokenHash: string) => {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error) throw new Error('El enlace no es válido o ya venció. Solicita uno nuevo desde «¿Olvidaste tu contraseña?».');
    setRecovering(true);
    setSession(data.session);
    setLoading(true);
    await loadProfile(data.session);
  };

  const changePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      throw new Error(friendlyError(error));
    }
    must(await supabase.rpc('password_changed'));
    setRecovering(false);
    setProfile((p) => (p ? { ...p, must_change_password: false } : p));
  };

  const signOut = async () => {
    setRecovering(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthCtx.Provider
      value={{
        session, profile, roleName, perms, loading, can: (p) => perms.has(p),
        mustChangePassword: !!profile && (profile.must_change_password || recovering),
        signIn, recover, changePassword, signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
