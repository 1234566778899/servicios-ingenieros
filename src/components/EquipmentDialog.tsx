import { useEffect, useState } from 'react';
import {
  Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown,
  Field, Input, Option, Spinner, Textarea, makeStyles,
} from '@fluentui/react-components';
import { useCatalogs } from '../lib/catalogs';
import { nextEquipmentCode } from '../lib/services';
import type { ServiceEquipment } from '../lib/types';

const useStyles = makeStyles({
  // minmax(0, 1fr): sin esto el desplegable (ancho mínimo 250 px) ensanchaba la columna y aparecía scroll horizontal
  form: {
    display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 16px',
    '@media (max-width: 1000px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, '@media (max-width: 600px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
    '& .fui-Dropdown, & .fui-Input': { minWidth: 0, width: '100%' },
  },
  span3: { gridColumn: 'span 3', '@media (max-width: 1000px)': { gridColumn: 'span 2' }, '@media (max-width: 600px)': { gridColumn: 'auto' } },
});

export type EquipmentForm = Pick<ServiceEquipment, 'code' | 'equipment_type_id' | 'capacity' | 'unit' | 'brand' | 'model' | 'serial' | 'observation'>;

export function EquipmentDialog({ open, title, initial, siteId, sitePrefix, syncLabel, observationLabel, onSave, onClose }: {
  open: boolean; title: string; initial?: Partial<EquipmentForm>; siteId?: string; sitePrefix?: string | null;
  /** Si se indica, muestra la casilla para guardar el cambio también en el inventario de la sede */
  syncLabel?: string;
  observationLabel?: string;
  onSave: (f: EquipmentForm, sync: boolean) => Promise<void>; onClose: () => void;
}) {
  const s = useStyles();
  const cat = useCatalogs();
  const [f, setF] = useState<EquipmentForm>({
    code: '', equipment_type_id: null, capacity: '', unit: '', brand: '', model: '', serial: '', observation: '',
  });
  const [noSerial, setNoSerial] = useState(false);
  const [sync, setSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setF({ code: '', equipment_type_id: null, capacity: '', unit: '', brand: '', model: '', serial: '', observation: '', ...initial });
    setNoSerial(!!initial?.code && !initial?.serial);
    setSync(true);
    setError('');
    if (!initial?.code) nextEquipmentCode(siteId, sitePrefix).then((code) => setF((x) => ({ ...x, code })));
  }, [open, initial, siteId, sitePrefix]);

  const set = <K extends keyof EquipmentForm>(k: K, v: EquipmentForm[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    // Capacidad y marca no siempre figuran en la placa (dampers, extractores): solo código y tipo son obligatorios
    if (!f.code?.trim() || !f.equipment_type_id) {
      setError('Completa el código y el tipo de equipo.');
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...f, code: f.code.trim().toUpperCase(), serial: noSerial ? null : f.serial || null,
        capacity: f.capacity || null, unit: f.unit || null, brand: f.brand || null, model: f.model || null, observation: f.observation || null,
      }, !!syncLabel && sync);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 720, width: '94vw' }}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <div className={s.form}>
              <Field label="Código de equipo" required validationMessage={error || undefined}>
                <Input value={f.code ?? ''} onChange={(_, d) => set('code', d.value)} />
              </Field>
              <Field label="Tipo de equipo" required className={undefined}>
                <Dropdown placeholder="Selecciona" value={f.equipment_type_id ? cat.typeName(f.equipment_type_id) : ''}
                  selectedOptions={[f.equipment_type_id ?? '']}
                  onOptionSelect={(_, d) => {
                    const t = cat.equipmentTypes.find((x) => x.id === d.optionValue);
                    setF((x) => ({ ...x, equipment_type_id: d.optionValue!, unit: x.unit || t?.default_unit || '' }));
                  }}>
                  {cat.equipmentTypes.map((t) => <Option key={t.id} value={t.id}>{t.name}</Option>)}
                </Dropdown>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px', gap: 8 }}>
                <Field label="Capacidad"><Input value={f.capacity ?? ''} onChange={(_, d) => set('capacity', d.value)} /></Field>
                <Field label="Unidad">
                  <Dropdown value={f.unit ?? ''} selectedOptions={[f.unit ?? '']} onOptionSelect={(_, d) => set('unit', d.optionValue!)} style={{ minWidth: 0 }}>
                    {['BTU', 'TR', 'cm', 'W', 'kW', 'HP', 'CFM'].map((u) => <Option key={u}>{u}</Option>)}
                  </Dropdown>
                </Field>
              </div>
              <Field label="Marca"><Input value={f.brand ?? ''} onChange={(_, d) => set('brand', d.value)} /></Field>
              <Field label="Modelo"><Input value={f.model ?? ''} onChange={(_, d) => set('model', d.value)} /></Field>
              <Field label="N.º de serie">
                <Input disabled={noSerial} value={noSerial ? '' : f.serial ?? ''} placeholder={noSerial ? 'Sin serie visible' : ''} onChange={(_, d) => set('serial', d.value)} />
              </Field>
              <Checkbox className={s.span3} checked={noSerial} onChange={(_, d) => setNoSerial(!!d.checked)}
                label="El equipo no tiene serie visible (se mostrará “—” en el informe)" />
              <Field label={observationLabel ?? 'Observaciones del equipo'} className={s.span3}>
                <Textarea value={f.observation ?? ''} onChange={(_, d) => set('observation', d.value)} placeholder="Ubicación en la tienda, TAG del cliente, etc." />
              </Field>
              {syncLabel && <Checkbox className={s.span3} checked={sync} onChange={(_, d) => setSync(!!d.checked)} label={syncLabel} />}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button appearance="primary" onClick={submit} disabled={busy}>{busy ? <Spinner size="tiny" /> : 'Guardar equipo'}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
