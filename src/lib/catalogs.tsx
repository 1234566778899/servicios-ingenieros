import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Client, EquipmentType, Profile, ReportTemplate, Site } from './types';

interface Catalogs {
  clients: Client[];
  sites: Site[];
  equipmentTypes: EquipmentType[];
  users: Profile[];
  reportTemplates: ReportTemplate[];
  reload: () => Promise<void>;
  clientName: (id?: string | null) => string;
  siteName: (id?: string | null) => string;
  typeName: (id?: string | null) => string;
  userName: (id?: string | null) => string;
}

const Ctx = createContext<Catalogs>(null as any);

export function CatalogsProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [equipmentTypes, setTypes] = useState<EquipmentType[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [reportTemplates, setTemplates] = useState<ReportTemplate[]>([]);

  const reload = useCallback(async () => {
    const [c, s, t, u, r] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('sites').select('*').order('name'),
      supabase.from('equipment_types').select('*').order('name'),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('report_templates').select('*').order('name'),
    ]);
    setClients(c.data ?? []);
    setSites(s.data ?? []);
    setTypes(t.data ?? []);
    setUsers(u.data ?? []);
    setTemplates(r.data ?? []);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const by = <T extends { id: string }>(list: T[], key: keyof T) => (id?: string | null) =>
    (id && (list.find((x) => x.id === id)?.[key] as any)) || '—';

  return (
    <Ctx.Provider
      value={{
        clients, sites, equipmentTypes, users, reportTemplates, reload,
        clientName: by(clients, 'name'),
        siteName: by(sites, 'name'),
        typeName: by(equipmentTypes, 'name'),
        userName: by(users, 'full_name'),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useCatalogs = () => useContext(Ctx);
