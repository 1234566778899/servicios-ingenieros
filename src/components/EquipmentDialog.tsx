import { useEffect, useState } from 'react';
import {
  Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown,
  Field, Input, Option, Spinner, Textarea, makeStyles,
} from '@fluentui/react-components';
import { useCatalogs } from '../lib/catalogs';
import { supabase } from '../lib/supabase';
import type { ServiceEquipment } from '../lib/types';

const useStyles = makeStyles({
  form: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px' },
  span3: { gridColumn: 'span 3' },
});

export type EquipmentForm = Pick<ServiceEquipment, 'code' | 'equipment_type_id' | 'capacity' | 'unit' | 'brand' | 'model' | 'serial' | 'observation'>;

/** Siguiente código libre con el prefijo de la sede: TAFSA-05 → TAFSA-06 */
export async function nextEquipmentCode(prefix: string) {
  const { data } = await supabase.from('service_equipment').select('code').ilike('code', `${prefix}-%`);
  const max = Math.max(0, ...(data ?? []).map((r) => Number(r.code?.split('-').pop()) || 0));
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

export function EquipmentDialog({ open, title, initial, sitePrefix, onSave, onClose }: {
  open: boolean; title: string; initial?: Partial<EquipmentForm>; sitePrefix?: string | null;
  onSave: (f: EquipmentForm) => Promise<void>; onClose: () => void;
}) {
  const s = useStyles();
  const cat = useCatalogs();
  const [f, setF] = useState<EquipmentForm>({
    code: '', equipment_type_id: null, capacity: '', unit: '', brand: '', model: '', serial: '', observation: '',
  });
  const [noSerial, setNoSerial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setF({ code: '', equipment_type_id: null, capacity: '', unit: '', brand: '', model: '', serial: '', observation: '', ...initial });
    setNoSerial(!!initial?.code && !initial?.serial);
    setError('');
    if (!initial?.code) nextEquipmentCode(sitePrefix || 'EQ').then((code) => setF((x) => ({ ...x, code })));
  }, [open, initial, sitePrefix]);

  const set = <K extends keyof EquipmentForm>(k: K, v: EquipmentForm[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    if (!f.code || !f.equipment_type_id || !f.capacity || !f.unit || !f.brand) {
      setError('Completa código, tipo, capacidad, unidad y marca.');
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...f, serial: noSerial ? null : f.serial || null, code: f.code.trim().toUpperCase() });
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 720 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
                <Field label="Capacidad" required><Input value={f.capacity ?? ''} onChange={(_, d) => set('capacity', d.value)} /></Field>
                <Field label="Unidad" required>
                  <Dropdown value={f.unit ?? ''} selectedOptions={[f.unit ?? '']} onOptionSelect={(_, d) => set('unit', d.optionValue!)} style={{ minWidth: 0 }}>
                    {['BTU', 'TR', 'cm', 'kW', 'HP', 'CFM'].map((u) => <Option key={u}>{u}</Option>)}
                  </Dropdown>
                </Field>
              </div>
              <Field label="Marca" required><Input value={f.brand ?? ''} onChange={(_, d) => set('brand', d.value)} /></Field>
              <Field label="Modelo"><Input value={f.model ?? ''} onChange={(_, d) => set('model', d.value)} /></Field>
              <Field label="N.º de serie">
                <Input disabled={noSerial} value={noSerial ? '' : f.serial ?? ''} placeholder={noSerial ? 'Sin serie visible' : ''} onChange={(_, d) => set('serial', d.value)} />
              </Field>
              <Checkbox className={s.span3} checked={noSerial} onChange={(_, d) => setNoSerial(!!d.checked)}
                label="El equipo no tiene serie visible (se mostrará “—” en el informe)" />
              <Field label="Observaciones del equipo" className={s.span3}>
                <Textarea value={f.observation ?? ''} onChange={(_, d) => set('observation', d.value)} placeholder="Ubicación en la tienda, TAG del cliente, etc." />
              </Field>
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
