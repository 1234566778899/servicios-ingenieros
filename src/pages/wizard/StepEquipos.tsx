import { useEffect, useMemo, useState } from 'react';
import {
  Button, Caption1, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Dropdown, Field, Input, MessageBar, MessageBarActions, MessageBarBody, Option, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import {
  Add20Regular, ArrowLeft20Regular, ArrowRight20Regular, Box20Regular, Delete20Regular, Edit20Regular, Search20Regular,
} from '@fluentui/react-icons';
import { AsyncButton, Section, StatusBadge } from '../../components/common';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EquipmentDialog, type EquipmentForm } from '../../components/EquipmentDialog';
import { useAuth } from '../../lib/auth';
import { useCatalogs } from '../../lib/catalogs';
import { supabase, must } from '../../lib/supabase';
import { addInventoryToService, currentTemplateId, equipmentLabel, loadSiteInventory, logActivity } from '../../lib/services';
import { equipmentSummary } from '../../lib/texts';
import { useAsync } from '../../lib/useAsync';
import { useNotify } from '../../lib/toast';
import type { ServiceEquipment, SiteEquipment } from '../../lib/types';
import type { StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' },
  summary: { marginTop: '12px', padding: '10px 12px', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium },
  pickList: { maxHeight: '320px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' },
  pickRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
});

/** Campos que se copian entre el inventario de la sede y el equipo del servicio */
const master = (f: EquipmentForm) => ({
  code: f.code!, equipment_type_id: f.equipment_type_id, capacity: f.capacity, unit: f.unit, brand: f.brand, model: f.model, serial: f.serial,
});

export function StepEquipos({ bundle, reload, readOnly, goTo }: StepProps) {
  const s = useStyles();
  const cat = useCatalogs();
  const { can } = useAuth();
  const notify = useNotify();
  const svc = bundle.service;
  const site = cat.sites.find((x) => x.id === svc.site_id);
  const canInventory = can('equipos.gestionar');
  const { data: inventory, reload: reloadInventory } = useAsync(() => loadSiteInventory(svc.site_id), [svc.site_id]);
  const inService = (e: SiteEquipment) => bundle.equipment.some((x) => x.site_equipment_id === e.id || x.code === e.code);
  const missing = (inventory ?? []).filter((e) => !inService(e));
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceEquipment | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [toRemove, setToRemove] = useState<ServiceEquipment | null>(null);

  const tplName = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of bundle.equipment) if (e.checklist_template_id) m.set(e.checklist_template_id, cat.typeName(e.equipment_type_id));
    return m;
  }, [bundle.equipment, cat]);

  const maxPos = Math.max(0, ...bundle.equipment.map((e) => e.position));

  const addFromInventory = async (list: SiteEquipment[]) => {
    await addInventoryToService(svc.id, list, maxPos);
    await logActivity(svc.id, `agregó equipo${list.length > 1 ? 's' : ''} ${list.map((r) => r.code).join(', ')}`);
    notify(list.length > 1 ? `${list.length} equipos agregados` : `Equipo ${list[0].code} agregado`);
    await reload();
  };

  /** Equipo nuevo: se agrega al servicio y, si corresponde, al inventario de la sede. */
  const addNew = async (f: EquipmentForm, toInventory: boolean) => {
    let siteEquipmentId: string | null = null;
    if (toInventory) {
      const pos = Math.max(0, ...(inventory ?? []).map((e) => e.position)) + 1;
      const row = must(await supabase.from('site_equipment')
        .insert({ ...master(f), site_id: svc.site_id, location: f.observation, position: pos }).select('id').single()) as { id: string };
      siteEquipmentId = row.id;
    }
    must(await supabase.from('service_equipment').insert({
      ...f, service_id: svc.id, site_equipment_id: siteEquipmentId, position: maxPos + 1,
      checklist_template_id: await currentTemplateId(f.equipment_type_id),
    }));
    await logActivity(svc.id, `agregó el equipo ${f.code}${toInventory ? ' (nuevo en el inventario de la sede)' : ''}`);
    notify(`Equipo ${f.code} agregado`, 'success', toInventory ? `También quedó registrado en el inventario de ${site?.name}.` : undefined);
    reloadInventory();
    await reload();
  };

  const saveEdit = async (f: EquipmentForm, toInventory: boolean) => {
    const e = editing!;
    const tpl = f.equipment_type_id !== e.equipment_type_id ? await currentTemplateId(f.equipment_type_id) : e.checklist_template_id;
    must(await supabase.from('service_equipment').update({ ...f, checklist_template_id: tpl }).eq('id', e.id));
    // Cambio de serie, reemplazo de equipo, etc.: se corrige también en el inventario para los próximos servicios
    if (toInventory && e.site_equipment_id) must(await supabase.from('site_equipment').update(master(f)).eq('id', e.site_equipment_id));
    notify(`Equipo ${f.code} actualizado`, 'success', toInventory && e.site_equipment_id ? 'Inventario de la sede actualizado.' : undefined);
    if (toInventory) reloadInventory();
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
            <Button icon={<Search20Regular />} onClick={() => setPickOpen(true)}>Agregar del inventario</Button>
            <Button appearance="primary" icon={<Add20Regular />} onClick={() => setNewOpen(true)}>Registrar equipo nuevo</Button>
          </>
        )}
      >
        {!readOnly && missing.length > 0 && (
          <MessageBar intent="info" style={{ marginBottom: 12 }}>
            <MessageBarBody>
              {bundle.equipment.length
                ? `${missing.length} equipo(s) del inventario de ${site?.name} no están en este servicio.`
                : `${site?.name} tiene ${missing.length} equipos registrados en su inventario.`}
            </MessageBarBody>
            <MessageBarActions>
              <Button size="small" onClick={() => addFromInventory(missing)}>
                {bundle.equipment.length ? 'Agregar los que faltan' : `Cargar los ${missing.length} equipos`}
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}
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
        {bundle.equipment.length === 0 && !missing.length && (
          <MessageBar style={{ marginTop: 12 }}>
            <MessageBarBody>
              {inventory?.length === 0
                ? `${site?.name} aún no tiene equipos en su inventario. Registra los equipos intervenidos: quedarán guardados para los próximos servicios.`
                : 'Agrega los equipos intervenidos en este servicio.'}
            </MessageBarBody>
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
        <AsyncButton icon={<ArrowLeft20Regular />} onClick={() => goTo('datos')}>Anterior</AsyncButton>
        <AsyncButton appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" disabled={!bundle.equipment.length} onClick={() => goTo('checklist')}>
          Siguiente: Checklist
        </AsyncButton>
      </div>

      <EquipmentDialog open={newOpen} title="Registrar equipo nuevo" siteId={svc.site_id} sitePrefix={site?.equipment_prefix}
        syncLabel={canInventory ? `Guardarlo también en el inventario de ${site?.name}` : undefined}
        onSave={addNew} onClose={() => setNewOpen(false)} />
      <EquipmentDialog open={!!editing} title={`Editar ${editing?.code}`} initial={editing ?? undefined}
        syncLabel={canInventory && editing?.site_equipment_id ? 'Actualizar también el inventario de la sede (código, tipo, marca, modelo y serie)' : undefined}
        onSave={saveEdit} onClose={() => setEditing(null)} />
      <PickInventory open={pickOpen} list={inventory ?? []} inService={inService} siteName={site?.name ?? ''}
        onAdd={addFromInventory} onClose={() => setPickOpen(false)} />
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

function PickInventory({ open, list, inService, siteName, onAdd, onClose }: {
  open: boolean; list: SiteEquipment[]; inService: (e: SiteEquipment) => boolean; siteName: string;
  onAdd: (rows: SiteEquipment[]) => Promise<void>; onClose: () => void;
}) {
  const s = useStyles();
  const cat = useCatalogs();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSel(new Set());
  }, [open]);

  const types = [...new Set(list.map((e) => e.equipment_type_id).filter(Boolean) as string[])];
  const filtered = list.filter(
    (e) =>
      (!type || e.equipment_type_id === type) &&
      (!q || `${e.code} ${e.serial} ${e.brand} ${e.model} ${cat.typeName(e.equipment_type_id)}`.toLowerCase().includes(q.toLowerCase())),
  );
  const free = filtered.filter((e) => !inService(e));

  return (
    <Dialog open={open} onOpenChange={(_, d) => {
      if (!d.open) onClose();
    }}>
      <DialogSurface style={{ maxWidth: 760 }}>
        <DialogBody>
          <DialogTitle>Agregar del inventario · {siteName}</DialogTitle>
          <DialogContent>
            <Caption1 block>Equipos registrados en la sede. Los cambios de serie o reemplazos se corrigen en Equipos o al editar el equipo en el servicio.</Caption1>
            <div className="r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 8, marginTop: 12 }}>
              <Field label="Buscar"><Input contentBefore={<Search20Regular />} placeholder="Código, serie, marca…" value={q} onChange={(_, d) => setQ(d.value)} /></Field>
              <Field label="Tipo de equipo">
                <Dropdown value={type ? cat.typeName(type) : 'Todos'} selectedOptions={[type]} style={{ minWidth: 0 }} onOptionSelect={(_, d) => setType(d.optionValue ?? '')}>
                  <Option value="">Todos</Option>
                  {types.map((t) => <Option key={t} value={t}>{cat.typeName(t)}</Option>)}
                </Dropdown>
              </Field>
            </div>
            {free.length > 1 && (
              <Checkbox style={{ marginTop: 8 }} label={`Seleccionar todos (${free.length})`}
                checked={free.every((e) => sel.has(e.id)) ? true : free.some((e) => sel.has(e.id)) ? 'mixed' : false}
                onChange={(_, d) => setSel(d.checked === true ? new Set(free.map((e) => e.id)) : new Set())} />
            )}
            <div className={s.pickList}>
              {filtered.length === 0 && <Caption1>{list.length ? 'No hay equipos con esos filtros.' : 'La sede no tiene equipos en su inventario.'}</Caption1>}
              {filtered.map((e) => {
                const already = inService(e);
                return (
                  <label key={e.id} className={s.pickRow}>
                    <Checkbox disabled={already} checked={already || sel.has(e.id)}
                      onChange={(_, d) => setSel((x) => { const n = new Set(x); if (d.checked) n.add(e.id); else n.delete(e.id); return n; })} />
                    <Box20Regular />
                    <div style={{ flex: 1 }}>
                      <Text weight="semibold" block>{e.code} · {cat.typeName(e.equipment_type_id)} {equipmentLabel(e)}</Text>
                      <Caption1>{[e.brand, e.model].filter(Boolean).join(' ') || '—'} · S/N {e.serial || '—'}</Caption1>
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
                  await onAdd(list.filter((e) => sel.has(e.id)));
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
