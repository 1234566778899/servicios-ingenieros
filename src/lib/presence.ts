import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

/** Quién más tiene abierto este servicio (Realtime Presence) — RF-08.2. */
export function useServicePresence(serviceId?: string, editing = false) {
  const { profile } = useAuth();
  const [others, setOthers] = useState<{ id: string; name: string; editing: boolean }[]>([]);

  useEffect(() => {
    if (!serviceId || !profile) return;
    const ch = supabase.channel(`service:${serviceId}`, { config: { presence: { key: profile.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ name: string; editing: boolean }>();
      setOthers(
        Object.entries(state)
          .filter(([id]) => id !== profile.id)
          .map(([id, metas]) => ({ id, name: metas[0]?.name ?? '', editing: metas.some((m) => m.editing) })),
      );
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') ch.track({ name: profile.full_name, editing });
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [serviceId, profile, editing]);

  return others;
}
