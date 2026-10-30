import { useState } from 'react';
import {
  Avatar, Badge, Button, Caption1, Link, MessageBar, MessageBarBody, Tab, TabList, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens, Dialog, DialogSurface, DialogBody, DialogTitle,
  DialogContent, DialogActions,
} from '@fluentui/react-components';
import { ArrowDownload20Regular, DocumentArrowRight20Regular, Edit20Regular, Image20Regular, Open20Regular } from '@fluentui/react-icons';
import { PageHeader, Section, StatusBadge, Loading, ErrorBar } from '../components/common';
import { PhotoThumb } from '../components/PhotoThumb';
import { useAuth } from '../lib/auth';
import { useCatalogs } from '../lib/catalogs';
import { useRouter } from '../lib/router';
import { supabase } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { equipmentLabel, loadServiceBundle, usesEquipment } from '../lib/services';
import { useServicePresence } from '../lib/presence';
import { fmtDate, fmtDateTime, fmtSize } from '../lib/format';
import { useNotify } from '../lib/toast';
import { openReportFile, saveReportFile } from '../report/generate';
import { STAGES, type Report } from '../lib/types';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  col: { display: 'flex', flexDirection: 'column', gap: '16px' },
  kv: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 24px', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr 1fr' }, '@media (max-width: 600px)': { gridTemplateColumns: '1fr' } },
  photos: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  gallery: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' },
  log: { display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0' },
  tabs: { marginBottom: '16px' },
});

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Caption1 block style={{ color: tokens.colorNeutralForeground3 }}>{label}</Caption1>
      <Text>{value || '—'}</Text>
    </div>
  );
}

export function ServicioDetalle({ id }: { id: string }) {
  const s = useStyles();
  const cat = useCatalogs();
  const { can, profile } = useAuth();
  const { navigate } = useRouter();
  const notify = useNotify();
  const [tab, setTab] = useState('resumen');
  const [denied, setDenied] = useState<string | null>(null);

  const { data, error, loading } = useAsync(async () => {
    const bundle = await loadServiceBundle(id);
    const { data: log } = await supabase.from('activity_log').select('*').eq('service_id', id).order('created_at', { ascending: false }).limit(50);
    return { ...bundle, log: log ?? [] };
  }, [id]);
  const others = useServicePresence(id, false);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBar error={error ?? 'Servicio no encontrado o sin permiso para verlo.'} />;

  const svc = data.service;
  const site = cat.allSites.find((x) => x.id === svc.site_id);
  const withEquipment = usesEquipment(data, cat.hasEquipment);
  const groups = [...data.photoGroups].sort((a, b) => a.position - b.position);
  const groupPhotos = (id: string) => data.photos.filter((p) => p.group_id === id).sort((a, b) => a.position - b.position);
  const member = [svc.created_by, svc.lead_tech_id, ...svc.support_tech_ids].includes(profile!.id);
  const canEdit = can('servicios.editar_otros') || (can('servicios.editar_propios') && member);
  const canReport = canEdit && (can('informes.word') || can('informes.pdf'));
  const nc = data.equipment.filter((e) => e.final_status === 'No conforme').length;
  const findingOf = (seId: string) => data.findings.filter((f) => f.service_equipment_id === seId).map((f) => f.finding).join(', ');
  const progress = (seId: string, tplId: string | null) =>
    `${data.results.filter((r) => r.service_equipment_id === seId && r.result).length}/${tplId ? data.items[tplId]?.length ?? 0 : 0}`;

  const guard = (allowed: boolean, action: string, fn: () => void) => () => (allowed ? fn() : setDenied(action));

  const act = async (r: Report, kind: 'docx' | 'pdf', mode: 'open' | 'save') => {
    try {
      if (mode === 'open') await openReportFile(r, kind);
      else if (await saveReportFile(r, kind)) notify('Archivo guardado');
    } catch (e: any) {
      notify('No se pudo obtener el archivo', 'error', e.message);
    }
  };

  const equipmentTable = (
    <Table size="small">
      <TableHeader>
        <TableRow>
          <TableHeaderCell>Código</TableHeaderCell>
          <TableHeaderCell>Tipo de equipo</TableHeaderCell>
          <TableHeaderCell>Capacidad</TableHeaderCell>
          <TableHeaderCell>Marca / Modelo</TableHeaderCell>
          <TableHeaderCell>Checklist</TableHeaderCell>
          <TableHeaderCell>Estado final</TableHeaderCell>
          <TableHeaderCell>Hallazgo</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.equipment.map((e) => (
          <TableRow key={e.id}>
            <TableCell><Link onClick={() => navigate(`/equipos/${encodeURIComponent(e.code ?? '')}`)}>{e.code}</Link></TableCell>
            <TableCell>{cat.typeName(e.equipment_type_id)}</TableCell>
            <TableCell>{equipmentLabel(e)}</TableCell>
            <TableCell>{[e.brand, e.model].filter(Boolean).join(' / ')}</TableCell>
            <TableCell>{progress(e.id, e.checklist_template_id)}</TableCell>
            <TableCell><StatusBadge status={e.final_status} /></TableCell>
            <TableCell>{findingOf(e.id) || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Servicios', to: '/servicios' }, { label: svc.code }]}
        title={`${svc.code} · ${cat.siteName(svc.site_id)}`}
        badges={<><StatusBadge status={svc.status} />{!canEdit && <Badge appearance="outline" color="warning">Solo lectura</Badge>}</>}
        actions={
          <>
            <Button icon={<Edit20Regular />} onClick={guard(canEdit, 'Editar servicio', () => navigate(`/servicios/${id}/editar`))}>Editar servicio</Button>
            <Button appearance="primary" icon={<DocumentArrowRight20Regular />}
              onClick={guard(canReport, 'Generar informe', () => navigate(`/servicios/${id}/editar?paso=informe`))}>
              Generar informe
            </Button>
          </>
        }
      />
      {!canEdit && (
        <MessageBar intent="warning" style={{ marginBottom: 12 }}>
          <MessageBarBody>
            Estás viendo un servicio asignado a {cat.userName(svc.lead_tech_id)}. Tu rol solo permite consultarlo; para editarlo solicita acceso a un supervisor.
          </MessageBarBody>
        </MessageBar>
      )}
      {others.filter((o) => o.editing).map((o) => (
        <MessageBar key={o.id} intent="info" style={{ marginBottom: 12 }}>
          <MessageBarBody>{o.name} está editando este servicio en otro equipo. Los cambios se sincronizan al guardar.</MessageBarBody>
        </MessageBar>
      ))}
      <TabList className={s.tabs} selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as string)}>
        <Tab value="resumen">Resumen</Tab>
        {withEquipment && <Tab value="equipos">Equipos ({data.equipment.length})</Tab>}
        <Tab value="fotos">Fotografías ({data.photos.length})</Tab>
        <Tab value="informes">Informes ({data.reports.length})</Tab>
        <Tab value="historial">Historial de cambios</Tab>
      </TabList>

      {tab === 'resumen' && (
        <div className={s.grid}>
          <div className={s.col}>
            <Section title="Datos del servicio">
              <div className={s.kv}>
                <KV label="Fecha" value={fmtDate(svc.execution_date)} />
                <KV label="Tipo de servicio" value={svc.service_type} />
                <KV label="Orden de trabajo" value={svc.work_order} />
                <KV label="Cliente" value={cat.clientName(svc.client_id)} />
                <KV label="Tienda / Sede" value={`${site?.name ?? ''}${site?.short_name ? ` · ${site.short_name}` : ''}`} />
                <KV label="Especialidad" value={svc.specialty} />
                <KV label="Técnico responsable" value={cat.userName(svc.lead_tech_id)} />
                <KV label="Técnicos de apoyo" value={svc.support_tech_ids.map((u) => cat.userName(u)).join(', ')} />
                <KV label="Contacto de tienda" value={svc.site_contact} />
              </div>
              <div style={{ marginTop: 12 }}><KV label="Descripción del trabajo" value={svc.description} /></div>
            </Section>
            {withEquipment ? (
              <Section title="Equipos" subtitle={`${data.equipment.length} · ${nc} No conforme`}>{equipmentTable}</Section>
            ) : (
              <Section title="Trabajos realizados" subtitle={String(svc.work_items.length)}>
                {svc.work_items.length
                  ? <ul style={{ margin: 0, paddingLeft: 18 }}>{svc.work_items.map((t, i) => <li key={i}><Text size={300}>{t}</Text></li>)}</ul>
                  : <Caption1>Sin trabajos registrados.</Caption1>}
              </Section>
            )}
          </div>
          <div className={s.col}>
            <Section title="Fotografías" actions={canEdit && <Button size="small" icon={<Image20Regular />} onClick={() => navigate(`/servicios/${id}/editar?paso=fotos`)}>Gestionar fotografías</Button>}>
              <div className={s.photos}>
                {withEquipment ? STAGES.map((st) => {
                  const list = data.photos.filter((p) => p.stage === st.id);
                  return (
                    <div key={st.id}>
                      {list[0] ? <PhotoThumb path={list[0].storage_path} alt={st.label} height={80} /> : <div style={{ height: 80, background: tokens.colorNeutralBackground3, borderRadius: 4 }} />}
                      <Text block weight="semibold" size={200}>{st.label}</Text>
                      <Caption1>{list.length} fotos · {new Set(list.map((p) => p.service_equipment_id)).size} equipos</Caption1>
                    </div>
                  );
                }) : groups.map((g) => {
                  const list = groupPhotos(g.id);
                  return (
                    <div key={g.id}>
                      {list[0] ? <PhotoThumb path={list[0].storage_path} alt={g.title} height={80} /> : <div style={{ height: 80, background: tokens.colorNeutralBackground3, borderRadius: 4 }} />}
                      <Text block weight="semibold" size={200} truncate wrap={false} title={g.title}>{g.title}</Text>
                      <Caption1>{list.length} fotos</Caption1>
                    </div>
                  );
                })}
              </div>
              {!withEquipment && !groups.length && <Caption1>Sin fotografías.</Caption1>}
            </Section>
            <Section title="Actividad reciente">
              {data.log.slice(0, 5).map((a: any) => (
                <div key={a.id} className={s.log}>
                  <Avatar size={24} name={cat.userName(a.user_id)} />
                  <div>
                    <Text block size={200}><b>{cat.userName(a.user_id)}</b> · {a.action}</Text>
                    <Caption1>{fmtDateTime(a.created_at)}</Caption1>
                  </div>
                </div>
              ))}
              {!data.log.length && <Caption1>Sin actividad.</Caption1>}
            </Section>
          </div>
        </div>
      )}

      {tab === 'equipos' && <Section>{equipmentTable}</Section>}

      {tab === 'fotos' && !withEquipment && (
        <div className={s.col}>
          {groups.map((g) => (
            <Section key={g.id} title={g.title} subtitle={`${groupPhotos(g.id).length} fotos${g.description ? ` · ${g.description}` : ''}`}>
              <div className={s.gallery}>
                {groupPhotos(g.id).map((p) => (
                  <div key={p.id}>
                    <PhotoThumb path={p.storage_path} alt={p.caption ?? ''} height={120} annotations={p.annotations} />
                    <Caption1 block>{p.caption}</Caption1>
                  </div>
                ))}
              </div>
            </Section>
          ))}
          {!groups.length && <Section><Caption1>Sin fotografías.</Caption1></Section>}
        </div>
      )}

      {tab === 'fotos' && withEquipment && (
        <div className={s.col}>
          {data.equipment.map((e) => (
            <Section key={e.id} title={`${e.code} · ${cat.typeName(e.equipment_type_id)}`} subtitle={`${data.photos.filter((p) => p.service_equipment_id === e.id).length} fotos`}>
              <div className={s.gallery}>
                {data.photos.filter((p) => p.service_equipment_id === e.id)
                  .sort((a, b) => STAGES.findIndex((x) => x.id === a.stage) - STAGES.findIndex((x) => x.id === b.stage) || a.position - b.position)
                  .map((p) => (
                    <div key={p.id}>
                      <PhotoThumb path={p.storage_path} alt={p.caption ?? ''} height={120} annotations={p.annotations} />
                      <Caption1 block>{STAGES.find((x) => x.id === p.stage)?.label}{p.caption ? ` · ${p.caption}` : ''}</Caption1>
                    </div>
                  ))}
              </div>
            </Section>
          ))}
        </div>
      )}

      {tab === 'informes' && (
        <Section>
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>N.º informe</TableHeaderCell>
                <TableHeaderCell>Versión</TableHeaderCell>
                <TableHeaderCell>Generado por</TableHeaderCell>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Archivos</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Text weight="semibold">{r.number}</Text></TableCell>
                  <TableCell>v{r.version}</TableCell>
                  <TableCell>{cat.userName(r.generated_by)}</TableCell>
                  <TableCell>{fmtDateTime(r.generated_at)}</TableCell>
                  <TableCell>
                    {(['docx', 'pdf'] as const).filter((k) => (k === 'docx' ? r.docx_path : r.pdf_path)).map((k) => (
                      <span key={k} style={{ marginRight: 12 }}>
                        <Text size={200}>{k.toUpperCase()} ({fmtSize(k === 'docx' ? r.docx_size : r.pdf_size)})</Text>
                        <Button size="small" appearance="subtle" icon={<Open20Regular />} aria-label="Abrir" onClick={() => act(r, k, 'open')} />
                        {can('historial.descargar') && <Button size="small" appearance="subtle" icon={<ArrowDownload20Regular />} aria-label="Descargar" onClick={() => act(r, k, 'save')} />}
                      </span>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!data.reports.length && <Caption1 block style={{ padding: 12 }}>Aún no se generó ningún informe.</Caption1>}
        </Section>
      )}

      {tab === 'historial' && (
        <Section>
          {data.log.map((a: any) => (
            <div key={a.id} className={s.log}>
              <Avatar size={24} name={cat.userName(a.user_id)} />
              <Text size={200} style={{ flex: 1 }}><b>{cat.userName(a.user_id)}</b> · {a.action}</Text>
              <Caption1>{fmtDateTime(a.created_at)}</Caption1>
            </div>
          ))}
          {!data.log.some((a: any) => a.action === 'creó el servicio') && <div className={s.log}>
            <Avatar size={24} name={cat.userName(svc.created_by)} />
            <Text size={200} style={{ flex: 1 }}><b>{cat.userName(svc.created_by)}</b> · creó el servicio</Text>
            <Caption1>{fmtDateTime(svc.created_at)}</Caption1>
          </div>}
        </Section>
      )}

      <Dialog open={!!denied} onOpenChange={() => setDenied(null)}>
        <DialogSurface style={{ maxWidth: 440 }}>
          <DialogBody>
            <DialogTitle>Acción no permitida</DialogTitle>
            <DialogContent>
              No tienes permiso para “{denied}” en servicios de otros usuarios. Contacta a un Supervisor o Administrador.
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setDenied(null)}>Entendido</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
