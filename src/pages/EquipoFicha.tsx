import { useState } from 'react';
import {
  Button, Caption1, Link, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { Edit20Regular } from '@fluentui/react-icons';
import { PageHeader, Section, StatusBadge, Loading, ErrorBar } from '../components/common';
import { EquipmentDialog } from '../components/EquipmentDialog';
import { useAuth } from '../lib/auth';
import { useCatalogs } from '../lib/catalogs';
import { useRouter } from '../lib/router';
import { supabase, must } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { equipmentLabel } from '../lib/services';
import { fmtDate, shortType } from '../lib/format';
import { useNotify } from '../lib/toast';
import type { ChecklistResult, ServiceEquipment, TemplateItem } from '../lib/types';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  col: { display: 'flex', flexDirection: 'column', gap: '16px' },
  kv: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px' },
});

type Row = ServiceEquipment & {
  services: { id: string; code: string; client_id: string; site_id: string; execution_date: string; service_type: string; lead_tech_id: string };
  findings: { priority: string }[];
};

export function EquipoFicha({ code }: { code: string }) {
  const s = useStyles();
  const cat = useCatalogs();
  const { can } = useAuth();
  const { navigate } = useRouter();
  const notify = useNotify();
  const [editing, setEditing] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const rows = must(
      await supabase
        .from('service_equipment')
        .select('*, services!inner(id, code, client_id, site_id, execution_date, service_type, lead_tech_id), findings(priority)')
        .eq('code', code),
    ) as Row[];
    rows.sort((a, b) => b.services.execution_date.localeCompare(a.services.execution_date));
    const latest = rows[0];
    const sids = rows.map((r) => r.services.id);
    const [reports, items, results] = await Promise.all([
      sids.length ? supabase.from('reports').select('service_id, number, generated_at').in('service_id', sids).order('generated_at', { ascending: false }) : { data: [] },
      latest?.checklist_template_id ? supabase.from('checklist_template_items').select('*').eq('template_id', latest.checklist_template_id).order('position') : { data: [] },
      latest ? supabase.from('checklist_results').select('*').eq('service_equipment_id', latest.id) : { data: [] },
    ]);
    return {
      rows,
      latest,
      reportOf: (sid: string) => (reports.data ?? []).find((r: any) => r.service_id === sid)?.number as string | undefined,
      items: (items.data ?? []) as TemplateItem[],
      results: (results.data ?? []) as ChecklistResult[],
    };
  }, [code]);

  if (loading && !data) return <Loading />;
  const e = data?.latest;
  if (!e) return <ErrorBar error={error ?? `No se encontró el equipo ${code}.`} />;

  const RES: Record<string, string> = { C: 'Conforme', NC: 'No conforme', NA: 'N.A.' };
  const counts = { C: 0, NC: 0 };
  for (const r of data.results) if (r.result === 'C' || r.result === 'NC') counts[r.result]++;
  const site = cat.sites.find((x) => x.id === e.services.site_id);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Equipos', to: '/equipos' }, { label: code }]}
        title={`${code} · ${cat.typeName(e.equipment_type_id)} ${equipmentLabel(e)}`}
        actions={can('servicios.editar_otros') && <Button icon={<Edit20Regular />} onClick={() => setEditing(true)}>Editar equipo</Button>}
      />
      <div className={s.grid}>
        <Section title="Datos del equipo">
          <div className={s.kv}>
            {[
              ['Código', e.code], ['Tipo de equipo', cat.typeName(e.equipment_type_id)], ['Capacidad', equipmentLabel(e)],
              ['Marca / Modelo', [e.brand, e.model].filter(Boolean).join(' / ')], ['N.º de serie', e.serial || '— (sin serie visible)'],
              ['Cliente', cat.clientName(e.services.client_id)], ['Tienda / Sede', site?.name], ['Observación', e.observation],
              ['Plantilla de checklist', e.checklist_template_id ? cat.typeName(e.equipment_type_id) : '—'],
            ].map(([k, v]) => (
              <span key={k as string} style={{ display: 'contents' }}>
                <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{k}</Caption1>
                <Text size={300}>{v || '—'}</Text>
              </span>
            ))}
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>Estado</Caption1>
            <span><StatusBadge status={e.final_status} /></span>
          </div>
        </Section>
        <div className={s.col}>
          <Section title="Historial de servicios" subtitle={`${data.rows.length} servicios`}>
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Servicio</TableHeaderCell>
                  <TableHeaderCell>Fecha</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Técnico</TableHeaderCell>
                  <TableHeaderCell>Resultado</TableHeaderCell>
                  <TableHeaderCell>Hallazgos</TableHeaderCell>
                  <TableHeaderCell>Informe</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => {
                  const high = r.findings.some((f) => f.priority === 'Alta');
                  return (
                    <TableRow key={r.id}>
                      <TableCell><Link onClick={() => navigate(`/servicios/${r.services.id}`)}>{r.services.code}</Link></TableCell>
                      <TableCell>{fmtDate(r.services.execution_date)}</TableCell>
                      <TableCell>{shortType(r.services.service_type)}</TableCell>
                      <TableCell>{cat.userName(r.services.lead_tech_id)}</TableCell>
                      <TableCell><StatusBadge status={r.final_status} /></TableCell>
                      <TableCell>{r.findings.length ? `${r.findings.length}${high ? ' · Alta' : ''}` : '—'}</TableCell>
                      <TableCell>{data.reportOf(r.services.id) ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Section>
          <Section title={`Último checklist · ${fmtDate(e.services.execution_date)}`} subtitle={`${counts.C} Conforme · ${counts.NC} No conforme`}>
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Categoría</TableHeaderCell>
                  <TableHeaderCell>Actividad</TableHeaderCell>
                  <TableHeaderCell>Resultado</TableHeaderCell>
                  <TableHeaderCell>Observación</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((i) => {
                  const r = data.results.find((x) => x.template_item_id === i.id);
                  return (
                    <TableRow key={i.id}>
                      <TableCell>{i.category}</TableCell>
                      <TableCell>{i.activity}</TableCell>
                      <TableCell>{r?.result ? <StatusBadge status={RES[r.result]} /> : '—'}</TableCell>
                      <TableCell>{r?.value || '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Link style={{ marginTop: 8, display: 'inline-block' }} onClick={() => navigate(`/servicios/${e.services.id}/editar?paso=3`)}>Ver checklist completo →</Link>
          </Section>
        </div>
      </div>
      <EquipmentDialog
        open={editing}
        title={`Editar ${code}`}
        initial={e}
        onClose={() => setEditing(false)}
        onSave={async (f) => {
          // Corrige los datos maestros en todos los servicios donde aparece el equipo
          const { observation: _o, ...master } = f;
          must(await supabase.from('service_equipment').update(master).eq('code', code));
          notify('Equipo actualizado');
          if (f.code !== code) navigate(`/equipos/${encodeURIComponent(f.code!)}`);
          else reload();
        }}
      />
    </>
  );
}
