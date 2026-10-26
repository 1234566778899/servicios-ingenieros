import { useMemo, useState } from 'react';
import {
  Button, Caption1, Divider, DrawerBody, DrawerHeader, DrawerHeaderTitle, Dropdown, Field, Input, Link, MessageBar,
  MessageBarBody, Option, OverlayDrawer, Spinner, Tab, TabList, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import {
  ArrowDownload20Regular, ArrowExportLtr20Regular, Dismiss20Regular, DocumentPdf24Regular, DocumentText24Regular,
  Open20Regular, Search20Regular,
} from '@fluentui/react-icons';
import { PageHeader, Section, ErrorBar } from '../components/common';
import { DateInput } from '../components/DateInput';
import { Pager, usePageSize } from '../components/Pager';
import { useAuth } from '../lib/auth';
import { useCatalogs } from '../lib/catalogs';
import { useRouter } from '../lib/router';
import { supabase, fetchAll } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { fmtDateTime, fmtSize, today } from '../lib/format';
import { useNotify } from '../lib/toast';
import { openReportFile, saveReportFile } from '../report/generate';
import type { Report } from '../lib/types';

const useStyles = makeStyles({
  filters: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' },
  file: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, marginTop: '8px' },
  kv: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 12px', margin: '12px 0' },
});

type Row = Report & { services: { id: string; code: string; client_id: string; site_id: string; service_type: string } };

export function Historial() {
  const s = useStyles();
  const cat = useCatalogs();
  const { can } = useAuth();
  const { navigate } = useRouter();
  const notify = useNotify();
  const [q, setQ] = useState('');
  const defaultFrom = () => new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today());
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [userId, setUserId] = useState('');
  const [open, setOpen] = useState<Row | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = usePageSize('historial', 25);

  // Se trae todo el periodo (en bloques): la búsqueda por texto, la paginación y el CSV trabajan sobre el listado completo
  const { data, error, loading } = useAsync(() => fetchAll<Row>((a, b) => {
    let query = supabase
      .from('reports')
      .select('*, services!inner(id, code, client_id, site_id, service_type)')
      .order('generated_at', { ascending: false })
      .order('id')
      .range(a, b);
    if (from) query = query.gte('generated_at', from);
    if (to) query = query.lte('generated_at', `${to}T23:59:59`);
    if (clientId) query = query.eq('services.client_id', clientId);
    if (siteId) query = query.eq('services.site_id', siteId);
    if (userId) query = query.eq('generated_by', userId);
    return query as unknown as PromiseLike<{ data: Row[] | null; error: any }>;
  }), [from, to, clientId, siteId, userId]);

  const rows = useMemo(
    () => (data ?? []).filter((r) => !q || `${r.number} ${r.services.code} ${r.file_base_name}`.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const pg = Math.min(page, pages - 1);
  const set = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };
  const tplName = (id: string | null) => {
    const t = cat.reportTemplates.find((x) => x.id === id);
    return t ? `${t.code} · ${t.name}` : '—';
  };
  const formats = (r: Report) => [r.docx_path && 'DOCX', r.pdf_path && 'PDF'].filter(Boolean).join(' · ');

  const act = async (r: Report, kind: 'docx' | 'pdf', mode: 'open' | 'save') => {
    try {
      if (mode === 'open') await openReportFile(r, kind);
      else if (await saveReportFile(r, kind)) notify('Archivo guardado');
    } catch (e: any) {
      notify('No se pudo obtener el archivo', 'error', e.message);
    }
  };

  const exportCsv = async () => {
    const head = ['N.º informe', 'Servicio', 'Cliente', 'Sede', 'Plantilla', 'Generado por', 'Fecha', 'Formatos'];
    const lines = rows.map((r) => [
      r.number, r.services.code, cat.clientName(r.services.client_id), cat.siteName(r.services.site_id), tplName(r.template_id),
      cat.userName(r.generated_by), fmtDateTime(r.generated_at), formats(r),
    ]);
    const csv = '﻿' + [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const bytes = new TextEncoder().encode(csv);
    const name = `historial-informes-${today()}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes]));
    a.download = name;
    a.click();
  };

  const filtered = !!(q || clientId || siteId || userId) || from !== defaultFrom() || to !== today();
  const clear = () => { setQ(''); setFrom(defaultFrom()); setTo(today()); setClientId(''); setSiteId(''); setUserId(''); setPage(0); };

  const versions = open ? (data ?? []).filter((r) => r.service_id === open.service_id && r.id !== open.id) : [];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Historial de informes' }]}
        title="Historial de informes"
        actions={<Button icon={<ArrowExportLtr20Regular />} onClick={exportCsv} disabled={!rows.length}>Exportar listado</Button>}
      />
      <TabList selectedValue="informes" onTabSelect={(_, d) => d.value === 'plantillas' && navigate('/historial/plantillas')} style={{ marginBottom: 12 }}>
        <Tab value="informes">Informes generados</Tab>
        <Tab value="plantillas">Plantillas</Tab>
      </TabList>
      <ErrorBar error={error} />
      <Section>
        <div className={s.filters}>
          <Field label="Buscar">
            <Input contentBefore={<Search20Regular />} placeholder="N.º informe, servicio…" value={q} onChange={(_, d) => set(setQ)(d.value)} style={{ width: 220 }} />
          </Field>
          <Field label="Desde"><DateInput value={from} onChange={set(setFrom)} style={{ width: 140 }} /></Field>
          <Field label="Hasta"><DateInput value={to} onChange={set(setTo)} style={{ width: 140 }} /></Field>
          <Field label="Cliente">
            <Dropdown value={clientId ? cat.clientName(clientId) : 'Todos'} selectedOptions={[clientId]} onOptionSelect={(_, d) => { set(setClientId)(d.optionValue ?? ''); setSiteId(''); }} style={{ minWidth: 150 }}>
              <Option value="">Todos</Option>
              {cat.clients.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Sede">
            <Dropdown value={siteId ? cat.siteName(siteId) : 'Todas'} selectedOptions={[siteId]} onOptionSelect={(_, d) => set(setSiteId)(d.optionValue ?? '')} style={{ minWidth: 170 }}>
              <Option value="">Todas</Option>
              {cat.sites.filter((x) => !clientId || x.client_id === clientId).map((x) => <Option key={x.id} value={x.id}>{x.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Generado por">
            <Dropdown value={userId ? cat.userName(userId) : 'Todos'} selectedOptions={[userId]} onOptionSelect={(_, d) => set(setUserId)(d.optionValue ?? '')} style={{ minWidth: 160 }}>
              <Option value="">Todos</Option>
              {cat.users.map((u) => <Option key={u.id} value={u.id}>{u.full_name}</Option>)}
            </Dropdown>
          </Field>
          {filtered && <Button appearance="subtle" icon={<Dismiss20Regular />} onClick={clear}>Limpiar</Button>}
        </div>
        {!can('historial.ver_todos') && (
          <MessageBar style={{ marginBottom: 12 }}><MessageBarBody>Solo ves los informes de los servicios en los que participas.</MessageBarBody></MessageBar>
        )}
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>N.º informe</TableHeaderCell>
              <TableHeaderCell>Servicio</TableHeaderCell>
              <TableHeaderCell>Cliente · Sede</TableHeaderCell>
              <TableHeaderCell>Plantilla</TableHeaderCell>
              <TableHeaderCell>Generado por</TableHeaderCell>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Formatos</TableHeaderCell>
              <TableHeaderCell style={{ width: 90 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(pg * size, (pg + 1) * size).map((r) => (
              <TableRow key={r.id} onDoubleClick={() => setOpen(r)}>
                <TableCell><Link onClick={() => setOpen(r)}>{r.number}</Link>{r.version > 1 && <Caption1> v{r.version}</Caption1>}</TableCell>
                <TableCell>{r.services.code}</TableCell>
                <TableCell>{cat.clientName(r.services.client_id)} · {cat.siteName(r.services.site_id)}</TableCell>
                <TableCell>{tplName(r.template_id)}</TableCell>
                <TableCell>{cat.userName(r.generated_by)}</TableCell>
                <TableCell>{fmtDateTime(r.generated_at)}</TableCell>
                <TableCell>{formats(r) || <Caption1>sin archivos</Caption1>}</TableCell>
                <TableCell>
                  <Button size="small" appearance="subtle" icon={<Open20Regular />} aria-label="Abrir" disabled={!r.pdf_path && !r.docx_path}
                    onClick={() => act(r, r.pdf_path ? 'pdf' : 'docx', 'open')} />
                  {can('historial.descargar') && (
                    <Button size="small" appearance="subtle" icon={<ArrowDownload20Regular />} aria-label="Descargar" disabled={!r.pdf_path && !r.docx_path}
                      onClick={() => act(r, r.pdf_path ? 'pdf' : 'docx', 'save')} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {loading && !data && <Spinner style={{ padding: 24 }} />}
        {data && !rows.length && (
          <Caption1 block style={{ padding: 12 }}>{filtered ? 'No hay informes con esos filtros.' : 'No hay informes generados en los últimos 60 días.'}</Caption1>
        )}
        <Pager page={pg} size={size} total={rows.length} noun="informes" onPage={setPage}
          onSize={(n) => { setPage(Math.floor((pg * size) / n)); setSize(n); }} />
      </Section>

      <OverlayDrawer position="end" size="medium" open={!!open} onOpenChange={(_, d) => !d.open && setOpen(null)}>
        <DrawerHeader>
          <DrawerHeaderTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} aria-label="Cerrar" onClick={() => setOpen(null)} />}>
            {open?.number}
          </DrawerHeaderTitle>
          <Caption1>NORDICO INGENIEROS · INFORME TÉCNICO DE SERVICIO</Caption1>
        </DrawerHeader>
        {open && (
          <DrawerBody>
            <div className={s.kv}>
              <Caption1>Servicio</Caption1><Text>{open.services.code} · {open.services.service_type}</Text>
              <Caption1>Cliente · Sede</Caption1><Text>{cat.clientName(open.services.client_id)} · {cat.siteName(open.services.site_id)}</Text>
              <Caption1>Plantilla</Caption1><Text>{tplName(open.template_id)}</Text>
              <Caption1>Generado por</Caption1><Text>{cat.userName(open.generated_by)} · {fmtDateTime(open.generated_at)}</Text>
              <Caption1>Versión</Caption1><Text>v{open.version}</Text>
            </div>
            <Divider />
            <Text weight="semibold" block style={{ marginTop: 12 }}>Archivos</Text>
            {(['docx', 'pdf'] as const).filter((k) => (k === 'docx' ? open.docx_path : open.pdf_path)).map((k) => (
              <div key={k} className={s.file}>
                {k === 'docx' ? <DocumentText24Regular /> : <DocumentPdf24Regular />}
                <div style={{ flex: 1 }}>
                  <Text block size={200} weight="semibold">{open.number}.{k}</Text>
                  <Caption1>{k === 'docx' ? 'Word editable' : 'PDF final'} · {fmtSize(k === 'docx' ? open.docx_size : open.pdf_size)}</Caption1>
                </div>
                <Button size="small" icon={<Open20Regular />} onClick={() => act(open, k, 'open')}>Abrir</Button>
                {can('historial.descargar') && <Button size="small" icon={<ArrowDownload20Regular />} onClick={() => act(open, k, 'save')}>Descargar</Button>}
              </div>
            ))}
            {versions.length > 0 && (
              <>
                <Text weight="semibold" block style={{ marginTop: 16 }}>Versiones anteriores</Text>
                {versions.map((v) => (
                  <div key={v.id}>
                    <Link onClick={() => setOpen(v)}>
                      v{v.version} · {fmtDateTime(v.generated_at)} · {cat.userName(v.generated_by)} ({formats(v)})
                    </Link>
                  </div>
                ))}
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
              <Button onClick={() => navigate(`/servicios/${open.service_id}`)}>Ver servicio</Button>
              {(can('informes.word') || can('informes.pdf')) && (
                <Button appearance="primary" onClick={() => navigate(`/servicios/${open.service_id}/editar?paso=informe`)}>Regenerar informe</Button>
              )}
            </div>
          </DrawerBody>
        )}
      </OverlayDrawer>
    </>
  );
}
