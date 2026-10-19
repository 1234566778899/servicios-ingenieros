import { useEffect, useMemo, useState } from 'react';
import {
  Button, Caption1, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Dropdown, Field, Input, MessageBar, MessageBarBody, Option, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import {
  Add20Regular, ArrowLeft20Regular, ArrowRight20Regular, Box20Regular, Delete20Regular, Edit20Regular, Search20Regular,
} from '@fluentui/react-icons';
import { AsyncButton, Section, StatusBadge } from '../../components/common';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EquipmentDialog, type EquipmentForm } from '../../components/EquipmentDialog';
import { useCatalogs } from '../../lib/catalogs';
import { supabase, must } from '../../lib/supabase';
import { currentTemplateId, equipmentLabel, logActivity } from '../../lib/services';
import { equipmentSummary } from '../../lib/texts';
import { useNotify } from '../../lib/toast';
import type { ServiceEquipment } from '../../lib/types';
import type { StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' },
  summary: { marginTop: '12px', padding: '10px 12px', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium },
  pickList: { maxHeight: '320px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' },
  pickRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
});

type Existing = ServiceEquipment & { services: { site_id: string; execution_date: string } };

export function StepEquipos({ bundle, reload, readOnly, goTo }: StepProps) {
  const s = useStyles();
  const cat = useCatalogs();
  const notify = useNotify();
  const svc = bundle.service;
  const site = cat.sites.find((x) => x.id === svc.site_id);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceEquipment | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [toRemove, setToRemove] = useState<ServiceEquipment | null>(null);

  const tplName = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of bundle.equipment) if (e.checklist_template_id) m.set(e.checklist_template_id, cat.typeName(e.equipment_type_id));
    return m;
  }, [bundle.equipment, cat]);

  const add = async (rows: EquipmentForm[]) => {
    let pos = Math.max(0, ...bundle.equipment.map((e) => e.position));
    const payload = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        service_id: svc.id,
        position: ++pos,
        checklist_template_id: await currentTemplateId(r.equipment_type_id),
      })),
    );
    must(await supabase.from('service_equipment').insert(payload));
    await logActivity(svc.id, `agregó equipo${rows.length > 1 ? 's' : ''} ${rows.map((r) => r.code).join(', ')}`);
    notify(rows.length > 1 ? `${rows.length} equipos agregados` : `Equipo ${rows[0].code} agregado`);
    await reload();
  };

  const saveEdit = async (f: EquipmentForm) => {
    const tpl = f.equipment_type_id !== editing!.equipment_type_id ? await currentTemplateId(f.equipment_type_id) : editing!.checklist_template_id;
    must(await supabase.from('service_equipment').update({ ...f, checklist_template_id: tpl }).eq('id', editing!.id));
    notify(`Equipo ${f.code} actualizado`);
    await reload();
  };

  const remove = async () => {
    const e = toRemove!;
    const paths = bundle.photos.filter((p) => p.service_equipment_id === e.id).map((p) => p.storage_path);
    must(await supabase.from('service_equipment').delete().eq('id', e.id));
    if (paths.length) await supabase.storage.from('photos').remove(paths);
    // Renumerar para que el informe quede 1..n
    const rest = bundle.equipment.filter((x) => x.id !== e.id);
    await Promise.all(rest.map((x, i) => (x.position !== i + 1 ? supabase.from('service_equipment').update({ position: i + 1 }).eq('id', x.id) : null)));
    await logActivity(svc.id, `quitó el equipo ${e.code}`);
    setToRemove(null);
    await reload();
  };

  const counts = (e: ServiceEquipment) => ({
    results: bundle.results.filter((r) => r.service_equipment_id === e.id && r.result).length,
    photos: bundle.photos.filter((p) => p.service_equipment_id === e.id).length,
  });

  return (
    <>
      <Section
        title="Lista de equipos"
        subtitle={`${bundle.equipment.length} equipos · ${cat.siteName(svc.site_id)} · sección 3 del informe`}
        actions={!readOnly && (
          <>
            <Button icon={<Search20Regular />} onClick={() => setPickOpen(true)}>Agregar equipo existente</Button>
            <Button appearance="primary" icon={<Add20Regular />} onClick={() => setNewOpen(true)}>Registrar equipo nuevo</Button>
          </>
        )}
      >
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell style={{ width: 50 }}>N.º</TableHeaderCell>
              <TableHeaderCell>Código de equipo</TableHeaderCell>
              <TableHeaderCell>Tipo de equipo</TableHeaderCell>
              <TableHeaderCell>Capacidad</TableHeaderCell>
              <TableHeaderCell>Marca / Modelo</TableHeaderCell>
              <TableHeaderCell>Serie</TableHeaderCell>
              <TableHeaderCell>Checklist (plantilla)</TableHeaderCell>
              <TableHeaderCell>Estado final</TableHeaderCell>
              <TableHeaderCell style={{ width: 90 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundle.equipment.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.position}</TableCell>
                <TableCell><Text weight="semibold">{e.code}</Text></TableCell>
                <TableCell>{cat.typeName(e.equipment_type_id).toUpperCase()}</TableCell>
                <TableCell>{equipmentLabel(e).toUpperCase()}</TableCell>
                <TableCell>{[e.brand, e.model].filter(Boolean).join(' / ').toUpperCase()}</TableCell>
                <TableCell>{e.serial || '—'}</TableCell>
                <TableCell>{e.checklist_template_id ? tplName.get(e.checklist_template_id) : <Caption1>Sin plantilla</Caption1>}</TableCell>
                <TableCell><StatusBadge status={e.final_status === 'Pendiente' ? 'En checklist' : e.final_status} /></TableCell>
                <TableCell>
                  {!readOnly && (
                    <>
                      <Button size="small" appearance="subtle" icon={<Edit20Regular />} aria-label="Editar" onClick={() => setEditing(e)} />
                      <Button size="small" appearance="subtle" icon={<Delete20Regular />} aria-label="Quitar" onClick={() => setToRemove(e)} />
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {bundle.equipment.length === 0 && (
          <MessageBar style={{ marginTop: 12 }}>
            <MessageBarBody>Agrega los equipos intervenidos en este servicio. Puedes reutilizar los ya registrados en la sede.</MessageBarBody>
          </MessageBar>
        )}
        {bundle.equipment.length > 0 && (
          <div className={s.summary}>
            <Caption1>Resumen para “Detalles previos”: </Caption1>
            <Text size={200}>{equipmentSummary(svc.service_type, bundle.equipment, cat.typeName)}</Text>
            <Caption1 block style={{ color: tokens.colorNeutralForeground3 }}>El estado final se calcula en el paso Checklist.</Caption1>
          </div>
        )}
      </Section>
      <div className={s.footer}>
        <AsyncButton icon={<ArrowLeft20Regular />} onClick={() => goTo(1)}>Anterior</AsyncButton>
        <AsyncButton appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" disabled={!bundle.equipment.length} onClick={() => goTo(3)}>
          Siguiente: Checklist
        </AsyncButton>
      </div>

      <EquipmentDialog open={newOpen} title="Registrar equipo nuevo" sitePrefix={site?.equipment_prefix}
        onSave={(f) => add([f])} onClose={() => setNewOpen(false)} />
      <EquipmentDialog open={!!editing} title={`Editar ${editing?.code}`} initial={editing ?? undefined}
        onSave={saveEdit} onClose={() => setEditing(null)} />
      <PickExisting open={pickOpen} siteId={svc.site_id} exclude={bundle.equipment.map((e) => e.code!)}
        onAdd={add} onClose={() => setPickOpen(false)} />
      <ConfirmDialog
        open={!!toRemove}
        title={`¿Quitar ${toRemove?.code} del servicio?`}
        body={toRemove && (() => {
          const c = counts(toRemove);
          return c.results || c.photos
            ? `Se eliminarán también ${c.results} resultado(s) de checklist y ${c.photos} fotografía(s) de este equipo en el servicio.`
            : 'El equipo dejará de aparecer en este servicio. Su historial en otros servicios se conserva.';
        })()}
        confirmLabel="Quitar"
        danger
        onConfirm={remove}
        onCancel={() => setToRemove(null)}
      />
    </>
  );
}

function PickExisting({ open, siteId, exclude, onAdd, onClose }: {
  open: boolean; siteId: string; exclude: string[]; onAdd: (rows: EquipmentForm[]) => Promise<void>; onClose: () => void;
}) {
  const s = useStyles();
  const cat = useCatalogs();
  const [site, setSite] = useState(siteId);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState<Existing[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async (siteFilter: string) => {
    setList(null);
    const { data } = await supabase
      .from('service_equipment')
      .select('*, services!inner(site_id, execution_date)')
      .eq('services.site_id', siteFilter)
      .order('created_at', { ascending: false });
    // Un equipo aparece en varios servicios: nos quedamos con su registro más reciente
    const seen = new Map<string, Existing>();
    for (const r of (data ?? []) as Existing[]) if (r.code && !seen.has(r.code)) seen.set(r.code, r);
    setList([...seen.values()].sort((a, b) => a.code!.localeCompare(b.code!)));
  };

  useEffect(() => {
    if (!open) return;
    setSel(new Set());
    setSite(siteId);
    load(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, siteId]);

  const filtered = (list ?? []).filter(
    (e) =>
      (!type || e.equipment_type_id === type) &&
      (!q || `${e.code} ${e.serial} ${cat.typeName(e.equipment_type_id)}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Dialog open={open} onOpenChange={(_, d) => {
      if (!d.open) onClose();
    }}>
      <DialogSurface style={{ maxWidth: 760 }}>
        <DialogBody>
          <DialogTitle>Agregar equipo existente</DialogTitle>
          <DialogContent>
            <Caption1 block>Busca equipos ya registrados para reutilizarlos en este servicio.</Caption1>
            <div className="r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 200px 180px', gap: 8, marginTop: 12 }}>
              <Field label="Buscar"><Input contentBefore={<Search20Regular />} placeholder="Código, serie o nombre…" value={q} onChange={(_, d) => setQ(d.value)} /></Field>
              <Field label="Tienda / Sede">
                <Dropdown value={cat.siteName(site)} selectedOptions={[site]} style={{ minWidth: 0 }}
                  onOptionSelect={(_, d) => { setSite(d.optionValue!); load(d.optionValue!); }}>
                  {cat.sites.map((x) => <Option key={x.id} value={x.id}>{x.name}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Tipo de equipo">
                <Dropdown value={type ? cat.typeName(type) : 'Todos'} selectedOptions={[type]} style={{ minWidth: 0 }} onOptionSelect={(_, d) => setType(d.optionValue ?? '')}>
                  <Option value="">Todos</Option>
                  {cat.equipmentTypes.map((t) => <Option key={t.id} value={t.id}>{t.name}</Option>)}
                </Dropdown>
              </Field>
            </div>
            <div className={s.pickList}>
              {list === null && <Spinner size="small" />}
              {list && filtered.length === 0 && <Caption1>No hay equipos registrados con esos filtros.</Caption1>}
              {filtered.map((e) => {
                const already = exclude.includes(e.code!);
                return (
                  <label key={e.id} className={s.pickRow}>
                    <Checkbox disabled={already} checked={already || sel.has(e.id)}
                      onChange={(_, d) => setSel((x) => { const n = new Set(x); if (d.checked) n.add(e.id); else n.delete(e.id); return n; })} />
                    <Box20Regular />
                    <div style={{ flex: 1 }}>
                      <Text weight="semibold" block>{e.code} · {cat.typeName(e.equipment_type_id)} {equipmentLabel(e)}</Text>
                      <Caption1>{[e.brand, e.model].filter(Boolean).join(' ')} · S/N {e.serial || '—'}</Caption1>
                    </div>
                    {already && <Caption1>ya agregado</Caption1>}
                  </label>
                );
              })}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancelar</Button>
            <Button appearance="primary" disabled={!sel.size || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onAdd((list ?? []).filter((e) => sel.has(e.id)).map((e) => ({
                    code: e.code, equipment_type_id: e.equipment_type_id, capacity: e.capacity, unit: e.unit,
                    brand: e.brand, model: e.model, serial: e.serial, observation: null,
                  })));
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}>
              Agregar {sel.size || ''} equipo{sel.size === 1 ? '' : 's'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
