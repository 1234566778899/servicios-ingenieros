import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { CatalogOption, Client, EquipmentType, Profile, ReportTemplate, Site } from './types';

interface Catalogs {
  clients: Client[];
  sites: Site[];
  equipmentTypes: EquipmentType[];
  users: Profile[];
  reportTemplates: ReportTemplate[];
  serviceTypes: CatalogOption[];
  specialties: CatalogOption[];
  /** true hasta que termina la primera carga */
  loading: boolean;
  reload: () => Promise<void>;
  clientName: (id?: string | null) => string;
  siteName: (id?: string | null) => string;
  typeName: (id?: string | null) => string;
  userName: (id?: string | null) => string;
  /** La especialidad lleva lista de equipos, checklist y hallazgos (p. ej. aire acondicionado). */
  hasEquipment: (specialty?: string | null) => boolean;
}

const Ctx = createContext<Catalogs>(null as any);

export function CatalogsProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [equipmentTypes, setTypes] = useState<EquipmentType[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [reportTemplates, setTemplates] = useState<ReportTemplate[]>([]);
  const [serviceTypes, setServiceTypes] = useState<CatalogOption[]>([]);
  const [specialties, setSpecialties] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [c, s, t, u, r, st, sp] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('sites').select('*').order('name'),
      supabase.from('equipment_types').select('*').order('name'),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('report_templates').select('*').order('name'),
      supabase.from('service_types').select('*').order('position').order('name'),
      supabase.from('specialties').select('*').order('position').order('name'),
    ]);
    setClients(c.data ?? []);
    setSites(s.data ?? []);
    setTypes(t.data ?? []);
    setUsers(u.data ?? []);
    setTemplates(r.data ?? []);
    setServiceTypes(st.data ?? []);
    setSpecialties(sp.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const by = <T extends { id: string }>(list: T[], key: keyof T) => (id?: string | null) =>
    (id && (list.find((x) => x.id === id)?.[key] as any)) || '—';

  return (
    <Ctx.Provider
      value={{
        clients, sites, equipmentTypes, users, reportTemplates, serviceTypes, specialties, loading, reload,
        clientName: by(clients, 'name'),
        siteName: by(sites, 'name'),
        typeName: by(equipmentTypes, 'name'),
        userName: by(users, 'full_name'),
        hasEquipment: (name) => !!specialties.find((x) => x.name === name)?.has_equipment,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useCatalogs = () => useContext(Ctx);

/** Nombres activos para un desplegable; conserva el valor actual aunque se haya desactivado o renombrado. */
export function optionNames(list: CatalogOption[], current?: string | null) {
  const names = list.filter((o) => o.active).map((o) => o.name);
  return current && !names.includes(current) ? [current, ...names] : names;
}
