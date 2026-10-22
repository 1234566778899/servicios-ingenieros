import { useMemo, useState } from 'react';
import {
  Button, Caption1, Dropdown, Field, Input, Link, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Option,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens,
  MessageBar, MessageBarBody, Spinner,
} from '@fluentui/react-components';
import {
  Add20Regular, MoreHorizontal20Regular, Search20Regular, Open20Regular, Edit20Regular, Copy20Regular,
  DocumentArrowRight20Regular, Delete20Regular, ChevronLeft20Regular, ChevronRight20Regular, Dismiss20Regular,
} from '@fluentui/react-icons';
import { PageHeader, Section, StatusBadge, ErrorBar } from '../components/common';
import { DateInput } from '../components/DateInput';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../lib/auth';
import { useCatalogs } from '../lib/catalogs';
import { useRouter } from '../lib/router';
import { supabase, must } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { fmtDate, shortType } from '../lib/format';
import { useNotify } from '../lib/toast';
import type { Service } from '../lib/types';
import { duplicateService } from '../lib/services';

const PAGE = 15;
const STATUSES = ['En registro', 'Fotos pendientes', 'Informe generado'];

const useStyles = makeStyles({
  filters: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' },
  pager: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' },
  row: { cursor: 'pointer' },
});

type Row = Service & { service_equipment: { count: number }[] };

export function Servicios() {
  const s = useStyles();
  const { path, navigate } = useRouter();
  const { can, profile } = useAuth();
  const cat = useCatalogs();
  const notify = useNotify();
  const initialQ = new URLSearchParams(path.split('?')[1] ?? '').get('q') ?? '';

  const [q, setQ] = useState(initialQ);
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [toDelete, setToDelete] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    let query = supabase
      .from('services')
      .select('*, service_equipment(count)', { count: 'exact' })
      .order('execution_date', { ascending: false })
      .order('code', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (clientId) query = query.eq('client_id', clientId);
    if (siteId) query = query.eq('site_id', siteId);
    if (type) query = query.eq('service_type', type);
    if (status) query = query.eq('status', status);
    if (from) query = query.gte('execution_date', from);
    if (to) query = query.lte('execution_date', to);
    if (q.trim()) {
      const t = q.trim().replace(/[,()%]/g, ' ');
      const ors = [`code.ilike.%${t}%`, `work_order.ilike.%${t}%`];
      const lt = t.toLowerCase();
      const cIds = cat.clients.filter((c) => c.name.toLowerCase().includes(lt)).map((c) => c.id);
      const sIds = cat.sites.filter((x) => x.name.toLowerCase().includes(lt)).map((x) => x.id);
      if (cIds.length) ors.push(`client_id.in.(${cIds.join(',')})`);
      if (sIds.length) ors.push(`site_id.in.(${sIds.join(',')})`);
      query = query.or(ors.join(','));
    }
    const res = await query;
    return { rows: must(res) as Row[], total: res.count ?? 0 };
  }, [q, clientId, siteId, type, status, from, to, page, cat.clients, cat.sites]);

  const sites = useMemo(() => cat.sites.filter((x) => !clientId || x.client_id === clientId), [cat.sites, clientId]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const canEdit = (r: Service) =>
    can('servicios.editar_otros') ||
    (can('servicios.editar_propios') && [r.created_by, r.lead_tech_id, ...r.support_tech_ids].includes(profile!.id));

  const filtered = !!(q.trim() || clientId || siteId || type || status || from || to);
  const clear = () => {
    setQ(''); setClientId(''); setSiteId(''); setType(''); setStatus(''); setFrom(''); setTo(''); setPage(0);
  };

  const duplicate = async (r: Service) => {
    setBusy(true);
    try {
      const id = await duplicateService(r.id);
      notify('Servicio duplicado');
      navigate(`/servicios/${id}/editar`);
    } catch (e: any) {
      notify('No se pudo duplicar', 'error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from('services').delete().eq('id', toDelete.id);
    if (error) notify('No se pudo eliminar', 'error', error.message);
    else notify(`${toDelete.code} eliminado`);
    setToDelete(null);
    reload();
  };

  const set = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Servicios' }]}
        title="Servicios técnicos"
        actions={can('servicios.crear') && (
          <Button appearance="primary" icon={<Add20Regular />} onClick={() => navigate('/servicios/nuevo')}>Nuevo servicio</Button>
        )}
      />
      <ErrorBar error={error} />
      <Section>
        <div className={s.filters}>
          <Field label="Buscar">
            <Input contentBefore={<Search20Regular />} placeholder="Código, OT, cliente o sede…" value={q} onChange={(_, d) => set(setQ)(d.value)} style={{ width: 240 }} />
          </Field>
          <Field label="Cliente">
            <Dropdown placeholder="Todos" selectedOptions={[clientId]} value={clientId ? cat.clientName(clientId) : ''}
              onOptionSelect={(_, d) => { set(setClientId)(d.optionValue ?? ''); setSiteId(''); }} style={{ minWidth: 150 }}>
              <Option value="">Todos</Option>
              {cat.clients.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Sede">
            <Dropdown placeholder="Todas" selectedOptions={[siteId]} value={siteId ? cat.siteName(siteId) : ''}
              onOptionSelect={(_, d) => set(setSiteId)(d.optionValue ?? '')} style={{ minWidth: 170 }}>
              <Option value="">Todas</Option>
              {sites.map((x) => <Option key={x.id} value={x.id}>{x.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Tipo de servicio">
            <Dropdown placeholder="Todos" selectedOptions={[type]} value={type}
              onOptionSelect={(_, d) => set(setType)(d.optionValue ?? '')} style={{ minWidth: 200 }}>
              <Option value="">Todos</Option>
              {cat.serviceTypes.map((t) => <Option key={t.id}>{t.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Estado">
            <Dropdown placeholder="Todos" selectedOptions={[status]} value={status}
              onOptionSelect={(_, d) => set(setStatus)(d.optionValue ?? '')} style={{ minWidth: 160 }}>
              <Option value="">Todos</Option>
              {STATUSES.map((t) => <Option key={t}>{t}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Desde"><DateInput value={from} onChange={set(setFrom)} placeholder="dd/mm/aaaa" style={{ width: 140 }} /></Field>
          <Field label="Hasta"><DateInput value={to} onChange={set(setTo)} placeholder="dd/mm/aaaa" style={{ width: 140 }} /></Field>
          {filtered && <Button appearance="subtle" icon={<Dismiss20Regular />} onClick={clear}>Limpiar</Button>}
        </div>

        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Código</TableHeaderCell>
              <TableHeaderCell>Cliente</TableHeaderCell>
              <TableHeaderCell>Sede</TableHeaderCell>
              <TableHeaderCell>Tipo</TableHeaderCell>
              <TableHeaderCell style={{ width: 80 }}>Equipos</TableHeaderCell>
              <TableHeaderCell>Técnico</TableHeaderCell>
              <TableHeaderCell style={{ width: 110 }}>Fecha</TableHeaderCell>
              <TableHeaderCell style={{ width: 150 }}>Estado</TableHeaderCell>
              <TableHeaderCell style={{ width: 48 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.rows.map((r) => (
              <TableRow key={r.id} className={s.row} onDoubleClick={() => navigate(`/servicios/${r.id}`)}>
                <TableCell><Link onClick={() => navigate(`/servicios/${r.id}`)}>{r.code}</Link></TableCell>
                <TableCell>{cat.clientName(r.client_id)}</TableCell>
                <TableCell>{cat.siteName(r.site_id)}</TableCell>
                <TableCell>{shortType(r.service_type)}</TableCell>
                <TableCell>{r.service_equipment?.[0]?.count ?? 0}</TableCell>
                <TableCell>{cat.userName(r.lead_tech_id)}</TableCell>
                <TableCell>{fmtDate(r.execution_date)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell>
                  <Menu>
                    <MenuTrigger>
                      <Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label="Acciones" disabled={busy} />
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        <MenuItem icon={<Open20Regular />} onClick={() => navigate(`/servicios/${r.id}`)}>Abrir</MenuItem>
                        {canEdit(r) && <MenuItem icon={<Edit20Regular />} onClick={() => navigate(`/servicios/${r.id}/editar`)}>Editar</MenuItem>}
                        {can('servicios.crear') && <MenuItem icon={<Copy20Regular />} onClick={() => duplicate(r)}>Duplicar</MenuItem>}
                        {canEdit(r) && (can('informes.word') || can('informes.pdf')) && (
                          <MenuItem icon={<DocumentArrowRight20Regular />} onClick={() => navigate(`/servicios/${r.id}/editar?paso=6`)}>
                            Generar informe
                          </MenuItem>
                        )}
                        {(can('servicios.editar_otros') || (r.created_by === profile!.id && r.status === 'En registro')) && (
                          <MenuItem icon={<Delete20Regular />} onClick={() => setToDelete(r)}>Eliminar</MenuItem>
                        )}
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {loading && !data && <Spinner style={{ padding: 24 }} />}
        {data && data.rows.length === 0 && (
          <MessageBar style={{ marginTop: 12 }}>
            <MessageBarBody>{filtered ? 'No se encontraron servicios con esos filtros.' : 'Aún no hay servicios registrados.'}</MessageBarBody>
          </MessageBar>
        )}
        {total > 0 && <div className={s.pager}>
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
            {total ? `Mostrando ${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} de ${total} servicios` : ''}
          </Caption1>
          {pages > 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button size="small" icon={<ChevronLeft20Regular />} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Anterior" />
            <Text size={200}>{page + 1} / {pages}</Text>
            <Button size="small" icon={<ChevronRight20Regular />} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Siguiente" />
          </div>}
        </div>}
      </Section>
      <ConfirmDialog
        open={!!toDelete}
        title={`¿Eliminar ${toDelete?.code}?`}
        body="Se eliminarán el servicio, sus equipos, checklist, fotografías e informes asociados. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
