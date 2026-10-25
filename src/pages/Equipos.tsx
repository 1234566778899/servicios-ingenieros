import { useMemo, useState } from 'react';
import {
  Badge, Button, Caption1, Dropdown, Field, Input, Link, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Option, Spinner,
  Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, tokens,
} from '@fluentui/react-components';
import {
  Add20Regular, ArrowUndo20Regular, Dismiss20Regular, Edit20Regular, MoreHorizontal20Regular, Prohibited20Regular, Search20Regular,
} from '@fluentui/react-icons';
import { PageHeader, Section, StatusBadge, ErrorBar } from '../components/common';
import { EquipmentDialog, type EquipmentForm } from '../components/EquipmentDialog';
import { useAuth } from '../lib/auth';
import { useCatalogs } from '../lib/catalogs';
import { useRouter } from '../lib/router';
import { supabase, must } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { equipmentLabel } from '../lib/services';
import { fmtDate } from '../lib/format';
import { useNotify } from '../lib/toast';
import type { ServiceEquipment, SiteEquipment } from '../lib/types';

const useStyles = makeStyles({
  filters: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' },
  wideOnly: { '@media (max-width: 700px)': { display: 'none' } },
});

// La tabla completa (cientos de equipos) se vuelve lenta: se muestran los primeros y se pide filtrar
const MAX_ROWS = 300;

type Last = Pick<ServiceEquipment, 'site_equipment_id' | 'final_status'> & { services: { execution_date: string } };

/** Inventario de equipos por sede (lo que se precarga al crear un servicio) con su último servicio. */
export function Equipos() {
  const s = useStyles();
  const cat = useCatalogs();
  const { can } = useAuth();
  const { navigate } = useRouter();
  const notify = useNotify();
  const admin = can('equipos.gestionar');
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [type, setType] = useState('');
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<SiteEquipment | 'new' | null>(null);

  const { data, error, loading, reload } = useAsync(async () => {
    const [eq, last] = await Promise.all([
      supabase.from('site_equipment').select('*').order('site_id').order('position'),
      supabase.from('service_equipment').select('site_equipment_id, final_status, services!inner(execution_date)').not('site_equipment_id', 'is', null),
    ]);
    const latest = new Map<string, Last>();
    for (const r of (must(last) ?? []) as unknown as Last[]) {
      const cur = latest.get(r.site_equipment_id!);
      if (!cur || r.services.execution_date > cur.services.execution_date) latest.set(r.site_equipment_id!, r);
    }
    return { list: must(eq) as SiteEquipment[], latest };
  }, []);

  const siteOf = (id: string) => cat.sites.find((x) => x.id === id);
  const rows = useMemo(
    () =>
      (data?.list ?? []).filter((e) =>
        (inactive || e.active) &&
        (!clientId || siteOf(e.site_id)?.client_id === clientId) &&
        (!siteId || e.site_id === siteId) &&
        (!type || e.equipment_type_id === type) &&
        (!q || `${e.code} ${e.serial} ${e.brand} ${e.model} ${e.location}`.toLowerCase().includes(q.toLowerCase())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, q, clientId, siteId, type, inactive, cat.sites],
  );

  const filtered = !!(q || clientId || siteId || type);
  const site = siteOf(siteId);
  const current = editing && editing !== 'new' ? editing : null;

  const save = async (f: EquipmentForm) => {
    const row = {
      code: f.code!, equipment_type_id: f.equipment_type_id, capacity: f.capacity, unit: f.unit, brand: f.brand,
      model: f.model, serial: f.serial, location: f.observation,
    };
    if (current) {
      must(await supabase.from('site_equipment').update(row).eq('id', current.id));
      notify(`Equipo ${row.code} actualizado`, 'success', 'Los próximos servicios usarán estos datos; los informes ya emitidos no cambian.');
    } else {
      const pos = Math.max(0, ...(data?.list ?? []).filter((e) => e.site_id === siteId).map((e) => e.position)) + 1;
      must(await supabase.from('site_equipment').insert({ ...row, site_id: siteId, position: pos }));
      notify(`Equipo ${row.code} agregado a ${site?.name}`);
    }
    await reload();
  };

  const setActive = async (e: SiteEquipment, active: boolean) => {
    const { error: err } = await supabase.from('site_equipment').update({ active }).eq('id', e.id);
    if (err) return notify('No se pudo actualizar', 'error', err.message);
    notify(active ? `${e.code} reactivado` : `${e.code} dado de baja`, 'success', active ? undefined : 'Ya no se cargará en los servicios nuevos de la sede.');
    await reload();
  };

  return (
    <>
      <PageHeader crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Equipos' }]} title="Inventario de equipos"
        actions={admin && (
          <Button appearance="primary" icon={<Add20Regular />} disabled={!siteId} onClick={() => setEditing('new')}
            title={siteId ? undefined : 'Elige una sede para agregarle un equipo'}>
            {site ? `Nuevo equipo en ${site.name}` : 'Nuevo equipo'}
          </Button>
        )} />
      <ErrorBar error={error} />
      <Section>
        <div className={s.filters}>
          <Field label="Buscar">
            <Input contentBefore={<Search20Regular />} placeholder="Código, serie, marca…" value={q} onChange={(_, d) => setQ(d.value)} style={{ width: 220 }} />
          </Field>
          <Field label="Cliente">
            <Dropdown value={clientId ? cat.clientName(clientId) : 'Todos'} selectedOptions={[clientId]} onOptionSelect={(_, d) => { setClientId(d.optionValue ?? ''); setSiteId(''); }} style={{ minWidth: 170 }}>
              <Option value="">Todos</Option>
              {cat.clients.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Sede">
            <Dropdown value={siteId ? cat.siteName(siteId) : 'Todas'} selectedOptions={[siteId]} onOptionSelect={(_, d) => setSiteId(d.optionValue ?? '')} style={{ minWidth: 190 }}>
              <Option value="">Todas</Option>
              {cat.sites.filter((x) => !clientId || x.client_id === clientId).map((x) => <Option key={x.id} value={x.id}>{x.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Tipo de equipo">
            <Dropdown value={type ? cat.typeName(type) : 'Todos'} selectedOptions={[type]} onOptionSelect={(_, d) => setType(d.optionValue ?? '')} style={{ minWidth: 190 }}>
              <Option value="">Todos</Option>
              {cat.equipmentTypes.map((t) => <Option key={t.id} value={t.id}>{t.name}</Option>)}
            </Dropdown>
          </Field>
          <Switch label="Ver dados de baja" checked={inactive} onChange={(_, d) => setInactive(d.checked)} />
          {filtered && (
            <Button appearance="subtle" icon={<Dismiss20Regular />} onClick={() => { setQ(''); setClientId(''); setSiteId(''); setType(''); }}>Limpiar</Button>
          )}
        </div>
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Código</TableHeaderCell>
              <TableHeaderCell>Tipo de equipo</TableHeaderCell>
              <TableHeaderCell>Capacidad</TableHeaderCell>
              <TableHeaderCell className={s.wideOnly}>Marca / Modelo</TableHeaderCell>
              <TableHeaderCell className={s.wideOnly}>Serie</TableHeaderCell>
              <TableHeaderCell>Sede</TableHeaderCell>
              <TableHeaderCell className={s.wideOnly}>Último servicio</TableHeaderCell>
              {admin && <TableHeaderCell style={{ width: 44 }} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, MAX_ROWS).map((e) => {
              const last = data?.latest.get(e.id);
              return (
                <TableRow key={e.id} style={e.active ? undefined : { color: tokens.colorNeutralForeground4 }}>
                  <TableCell>
                    <Link onClick={() => navigate(`/equipos/${encodeURIComponent(e.code)}`)}>{e.code}</Link>
                    {!e.active && <Badge appearance="outline" size="small" style={{ marginLeft: 6 }}>De baja</Badge>}
                  </TableCell>
                  <TableCell>{cat.typeName(e.equipment_type_id)}</TableCell>
                  <TableCell>{equipmentLabel(e) || '—'}</TableCell>
                  <TableCell className={s.wideOnly}>{[e.brand, e.model].filter(Boolean).join(' / ') || '—'}</TableCell>
                  <TableCell className={s.wideOnly}>{e.serial || '—'}</TableCell>
                  <TableCell>{siteOf(e.site_id)?.name ?? '—'}</TableCell>
                  <TableCell className={s.wideOnly}>
                    {last ? <>{fmtDate(last.services.execution_date)} <StatusBadge status={last.final_status} /></> : '—'}
                  </TableCell>
                  {admin && (
                    <TableCell>
                      <Menu>
                        <MenuTrigger>
                          <Button size="small" appearance="subtle" icon={<MoreHorizontal20Regular />} aria-label={`Acciones: ${e.code}`} />
                        </MenuTrigger>
                        <MenuPopover>
                          <MenuList>
                            <MenuItem icon={<Edit20Regular />} onClick={() => setEditing(e)}>Editar</MenuItem>
                            {e.active
                              ? <MenuItem icon={<Prohibited20Regular />} onClick={() => setActive(e, false)}>Dar de baja</MenuItem>
                              : <MenuItem icon={<ArrowUndo20Regular />} onClick={() => setActive(e, true)}>Reactivar</MenuItem>}
                          </MenuList>
                        </MenuPopover>
                      </Menu>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {loading && !data && <Spinner style={{ padding: 24 }} />}
        <Caption1 block style={{ marginTop: 12, color: tokens.colorNeutralForeground3 }}>
          {data && !rows.length && (filtered ? 'No hay equipos con esos filtros. ' : 'Aún no hay equipos registrados. ')}
          {rows.length > MAX_ROWS ? `Mostrando ${MAX_ROWS} de ${rows.length} equipos: filtra por cliente o sede para ver el resto. ` : rows.length > 0 && `${rows.length} equipos. `}
          Al crear un servicio de una especialidad con equipos se cargan los equipos activos de la sede.
        </Caption1>
      </Section>
      <EquipmentDialog
        open={!!editing}
        title={current ? `Editar ${current.code}` : `Nuevo equipo · ${site?.name ?? ''}`}
        initial={current ? { ...current, observation: current.location } : undefined}
        siteId={current?.site_id ?? siteId}
        sitePrefix={site?.equipment_prefix}
        observationLabel="Ubicación / notas"
        onSave={save}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
