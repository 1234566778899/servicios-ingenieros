import { useMemo, useState } from 'react';
import {
  Button, Caption1, Dropdown, Field, Input, Link, Option, Table, TableBody, TableCell, TableHeader, TableHeaderCell,
  TableRow, makeStyles, tokens, Spinner,
} from '@fluentui/react-components';
import { Dismiss20Regular, Search20Regular } from '@fluentui/react-icons';
import { PageHeader, Section, StatusBadge, ErrorBar } from '../components/common';
import { useCatalogs } from '../lib/catalogs';
import { useRouter } from '../lib/router';
import { supabase, must } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { equipmentLabel } from '../lib/services';
import { fmtDate } from '../lib/format';
import type { ServiceEquipment } from '../lib/types';

const useStyles = makeStyles({
  filters: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' },
});

type Row = ServiceEquipment & { services: { id: string; code: string; client_id: string; site_id: string; execution_date: string } };

export interface EquipmentAgg {
  latest: Row;
  count: number;
}

/** Los equipos se guardan por servicio; aquí se agrupan por código para tener el inventario. */
export async function loadEquipmentInventory() {
  const rows = must(
    await supabase
      .from('service_equipment')
      .select('*, services!inner(id, code, client_id, site_id, execution_date)')
      .not('code', 'is', null),
  ) as Row[];
  const map = new Map<string, EquipmentAgg>();
  for (const r of rows) {
    const cur = map.get(r.code!);
    if (!cur) map.set(r.code!, { latest: r, count: 1 });
    else {
      cur.count++;
      if (r.services.execution_date > cur.latest.services.execution_date) cur.latest = r;
    }
  }
  return [...map.values()].sort((a, b) => a.latest.code!.localeCompare(b.latest.code!));
}

export function Equipos() {
  const s = useStyles();
  const cat = useCatalogs();
  const { navigate } = useRouter();
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  const { data, error, loading } = useAsync(loadEquipmentInventory, []);

  const rows = useMemo(
    () =>
      (data ?? []).filter(({ latest: e }) =>
        (!clientId || e.services.client_id === clientId) &&
        (!siteId || e.services.site_id === siteId) &&
        (!type || e.equipment_type_id === type) &&
        (!status || e.final_status === status) &&
        (!q || `${e.code} ${e.serial} ${e.brand} ${e.model} ${e.observation}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, clientId, siteId, type, status],
  );

  const filtered = !!(q || clientId || siteId || type || status);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Equipos' }]} title="Equipos registrados" />
      <ErrorBar error={error} />
      <Section>
        <div className={s.filters}>
          <Field label="Buscar">
            <Input contentBefore={<Search20Regular />} placeholder="Código, serie, marca…" value={q} onChange={(_, d) => setQ(d.value)} style={{ width: 240 }} />
          </Field>
          <Field label="Cliente">
            <Dropdown value={clientId ? cat.clientName(clientId) : 'Todos'} selectedOptions={[clientId]} onOptionSelect={(_, d) => { setClientId(d.optionValue ?? ''); setSiteId(''); }} style={{ minWidth: 150 }}>
              <Option value="">Todos</Option>
              {cat.clients.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Sede">
            <Dropdown value={siteId ? cat.siteName(siteId) : 'Todas'} selectedOptions={[siteId]} onOptionSelect={(_, d) => setSiteId(d.optionValue ?? '')} style={{ minWidth: 170 }}>
              <Option value="">Todas</Option>
              {cat.sites.filter((x) => !clientId || x.client_id === clientId).map((x) => <Option key={x.id} value={x.id}>{x.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Tipo de equipo">
            <Dropdown value={type ? cat.typeName(type) : 'Todos'} selectedOptions={[type]} onOptionSelect={(_, d) => setType(d.optionValue ?? '')} style={{ minWidth: 180 }}>
              <Option value="">Todos</Option>
              {cat.equipmentTypes.map((t) => <Option key={t.id} value={t.id}>{t.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Estado último servicio">
            <Dropdown value={status || 'Todos'} selectedOptions={[status]} onOptionSelect={(_, d) => setStatus(d.optionValue ?? '')} style={{ minWidth: 150 }}>
              <Option value="">Todos</Option>
              {['Conforme', 'No conforme', 'Pendiente'].map((x) => <Option key={x}>{x}</Option>)}
            </Dropdown>
          </Field>
          {filtered && (
            <Button appearance="subtle" icon={<Dismiss20Regular />} onClick={() => { setQ(''); setClientId(''); setSiteId(''); setType(''); setStatus(''); }}>Limpiar</Button>
          )}
        </div>
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Código</TableHeaderCell>
              <TableHeaderCell>Tipo de equipo</TableHeaderCell>
              <TableHeaderCell>Capacidad</TableHeaderCell>
              <TableHeaderCell>Marca / Modelo</TableHeaderCell>
              <TableHeaderCell>Serie</TableHeaderCell>
              <TableHeaderCell>Cliente · Sede</TableHeaderCell>
              <TableHeaderCell style={{ width: 70 }}>Serv.</TableHeaderCell>
              <TableHeaderCell>Último servicio</TableHeaderCell>
              <TableHeaderCell>Estado último</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ latest: e, count }) => (
              <TableRow key={e.code} onDoubleClick={() => navigate(`/equipos/${encodeURIComponent(e.code!)}`)}>
                <TableCell><Link onClick={() => navigate(`/equipos/${encodeURIComponent(e.code!)}`)}>{e.code}</Link></TableCell>
                <TableCell>{cat.typeName(e.equipment_type_id)}</TableCell>
                <TableCell>{equipmentLabel(e)}</TableCell>
                <TableCell>{[e.brand, e.model].filter(Boolean).join(' / ')}</TableCell>
                <TableCell>{e.serial || '—'}</TableCell>
                <TableCell>{cat.clientName(e.services.client_id)} · {cat.siteName(e.services.site_id)}</TableCell>
                <TableCell>{count}</TableCell>
                <TableCell>{fmtDate(e.services.execution_date)}</TableCell>
                <TableCell><StatusBadge status={e.final_status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {loading && !data && <Spinner style={{ padding: 24 }} />}
        <Caption1 block style={{ marginTop: 12, color: tokens.colorNeutralForeground3 }}>
          {data && !rows.length && (filtered ? 'No hay equipos con esos filtros. ' : 'Aún no hay equipos registrados. ')}
          {rows.length > 0 && `${rows.length} equipos. `}Los equipos nuevos se registran dentro de un servicio (Paso 2 · Equipos).
        </Caption1>
      </Section>
    </>
  );
}

