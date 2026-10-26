import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, fetchAll } from './supabase';
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
  /** Mensaje si alguna lista no se pudo cargar (se conserva lo último que sí cargó) */
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    // Cada lista por separado: si una falla (p. ej. un corte de red) las demás se actualizan y esa conserva lo anterior
    const load = <T,>(table: string, set: (v: T[]) => void, ...order: string[]) =>
      fetchAll<T>((a, b) => order.reduce((q, col) => q.order(col), supabase.from(table).select('*')).order('id').range(a, b)).then(set);
    const results = await Promise.allSettled([
      load<Client>('clients', setClients, 'name'),
      load<Site>('sites', setSites, 'name'),
      load<EquipmentType>('equipment_types', setTypes, 'name'),
      load<Profile>('profiles', setUsers, 'full_name'),
      load<ReportTemplate>('report_templates', setTemplates, 'name'),
      load<CatalogOption>('service_types', setServiceTypes, 'position', 'name'),
      load<CatalogOption>('specialties', setSpecialties, 'position', 'name'),
    ]);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    setError(failed ? String(failed.reason?.message ?? failed.reason) : null);
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
        clients, sites, equipmentTypes, users, reportTemplates, serviceTypes, specialties, loading, error, reload,
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
