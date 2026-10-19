import { useEffect, useState } from 'react';
import {
  Button, Caption1, Combobox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown,
  Field, Option, Radio, RadioGroup, Spinner, Textarea, makeStyles,
} from '@fluentui/react-components';
import { useCatalogs } from '../lib/catalogs';
import { supabase, must } from '../lib/supabase';
import { logActivity, type ServiceBundle } from '../lib/services';
import type { CatalogFinding, Finding, Priority } from '../lib/types';

const useStyles = makeStyles({
  form: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' },
  span2: { gridColumn: 'span 2' },
});

type Draft = Pick<Finding, 'service_equipment_id' | 'template_item_id' | 'catalog_id' | 'finding' | 'probable_cause' | 'action_taken' | 'recommendation' | 'priority' | 'photo_id'>;

export function FindingDialog({ open, bundle, initial, onClose, onSaved }: {
  open: boolean; bundle: ServiceBundle; initial?: Partial<Finding>; onClose: () => void; onSaved: () => void;
}) {
  const s = useStyles();
  const cat = useCatalogs();
  const [catalog, setCatalog] = useState<CatalogFinding[]>([]);
  const [d, setD] = useState<Draft>({} as Draft);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    supabase.from('findings_catalog').select('*').order('code').then(({ data }) => {
      const list = (data ?? []) as CatalogFinding[];
      setCatalog(list);
      // Si la observación del checklist coincide con un hallazgo del catálogo, se completa sola
      const match = !initial?.id && !initial?.catalog_id && initial?.finding
        ? list.find((c) => c.finding.toLowerCase() === initial.finding!.trim().toLowerCase())
        : undefined;
      if (match) {
        setD((x) => ({
          ...x, catalog_id: match.id, finding: match.finding, probable_cause: match.probable_cause,
          action_taken: match.suggested_action, recommendation: match.recommendation, priority: match.priority,
        }));
      }
    });
    setD({
      service_equipment_id: '', template_item_id: null, catalog_id: null, finding: '', probable_cause: '',
      action_taken: '', recommendation: '', priority: 'Media', photo_id: null, ...initial,
    } as Draft);
    setQuery(initial?.finding ?? '');
    setError('');
  }, [open, initial]);

  const eq = bundle.equipment.find((e) => e.id === d.service_equipment_id);
  const items = eq?.checklist_template_id ? bundle.items[eq.checklist_template_id] ?? [] : [];
  const ncItems = items.filter((i) => bundle.results.some((r) => r.service_equipment_id === eq!.id && r.template_item_id === i.id && r.result === 'NC'));
  const photos = bundle.photos.filter((p) => p.service_equipment_id === d.service_equipment_id);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const suggestions = catalog.filter(
    (c) =>
      (!eq?.equipment_type_id || !c.equipment_type_id || c.equipment_type_id === eq.equipment_type_id) &&
      `${c.code} ${c.finding} ${c.category}`.toLowerCase().includes(query.toLowerCase()),
  );

  const pickCatalog = (id: string) => {
    const c = catalog.find((x) => x.id === id);
    if (!c) return;
    setD((x) => ({
      ...x, catalog_id: c.id, finding: c.finding, probable_cause: c.probable_cause, action_taken: c.suggested_action,
      recommendation: c.recommendation, priority: c.priority,
    }));
    setQuery(c.finding);
  };

  const save = async () => {
    const finding = (d.finding || query).trim();
    if (!d.service_equipment_id || !finding || !d.probable_cause || !d.action_taken || !d.recommendation) {
      setError('Completa equipo, hallazgo, causa, acción y recomendación.');
      return;
    }
    setBusy(true);
    try {
      const row = { ...d, finding };
      if (initial?.id) {
        must(await supabase.from('findings').update(row).eq('id', initial.id));
      } else {
        const position = Math.max(0, ...bundle.findings.map((f) => f.position)) + 1;
        must(await supabase.from('findings').insert({ ...row, service_id: bundle.service.id, position }));
        await logActivity(bundle.service.id, `registró el hallazgo “${finding}” en ${eq?.code}`);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, x) => !x.open && onClose()}>
      <DialogSurface style={{ maxWidth: 720 }}>
        <DialogBody>
          <DialogTitle>{initial?.id ? 'Editar hallazgo' : 'Registrar hallazgo'}</DialogTitle>
          <DialogContent>
            <div className={s.form}>
              <Field label="Equipo" required>
                <Dropdown value={eq ? `${eq.code} · ${cat.typeName(eq.equipment_type_id)}` : ''} selectedOptions={[d.service_equipment_id]}
                  onOptionSelect={(_, x) => setD((v) => ({ ...v, service_equipment_id: x.optionValue!, template_item_id: null, photo_id: null }))}>
                  {bundle.equipment.map((e) => <Option key={e.id} value={e.id} text={`${e.code} · ${cat.typeName(e.equipment_type_id)}`}>{e.code} · {cat.typeName(e.equipment_type_id)}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Actividad origen">
                <Dropdown placeholder={ncItems.length ? 'Selecciona' : 'Sin actividades No conforme'}
                  value={items.find((i) => i.id === d.template_item_id) ? `${items.find((i) => i.id === d.template_item_id)!.activity} · No conforme` : ''}
                  selectedOptions={[d.template_item_id ?? '']} onOptionSelect={(_, x) => set('template_item_id', x.optionValue || null)}>
                  <Option value="">(Ninguna)</Option>
                  {ncItems.map((i) => <Option key={i.id} value={i.id} text={i.activity}>{i.activity} · No conforme</Option>)}
                </Dropdown>
              </Field>
              <Field label="Hallazgo / deficiencia" required className={s.span2}
                hint="Al elegir el hallazgo del catálogo se completan la causa, la acción y la recomendación. Puedes ajustarlas para este servicio.">
                <Combobox freeform placeholder="Busca en el catálogo o escribe uno nuevo" value={query}
                  onChange={(e) => { setQuery(e.target.value); setD((x) => ({ ...x, finding: e.target.value, catalog_id: null })); }}
                  onOptionSelect={(_, x) => x.optionValue && pickCatalog(x.optionValue)}>
                  {suggestions.map((c) => <Option key={c.id} value={c.id} text={c.finding}>{c.code} · {c.finding}</Option>)}
                </Combobox>
              </Field>
              <Field label="Causa probable" required className={s.span2}>
                <Textarea value={d.probable_cause ?? ''} onChange={(_, x) => set('probable_cause', x.value)} />
              </Field>
              <Field label="Acción realizada" required className={s.span2}>
                <Textarea value={d.action_taken ?? ''} onChange={(_, x) => set('action_taken', x.value)} />
              </Field>
              <Field label="Recomendación" required className={s.span2}>
                <Textarea value={d.recommendation ?? ''} onChange={(_, x) => set('recommendation', x.value)} />
              </Field>
              <Field label="Prioridad" required>
                <RadioGroup layout="horizontal" value={d.priority} onChange={(_, x) => set('priority', x.value as Priority)}>
                  <Radio value="Alta" label="Alta" />
                  <Radio value="Media" label="Media" />
                  <Radio value="Baja" label="Baja" />
                </RadioGroup>
              </Field>
              <Field label="Foto de evidencia (opcional)">
                <Dropdown placeholder={photos.length ? 'Elegir del registro fotográfico' : 'Sin fotos para este equipo'} disabled={!photos.length}
                  value={photos.find((p) => p.id === d.photo_id)?.caption ?? (d.photo_id ? 'Foto' : '')}
                  selectedOptions={[d.photo_id ?? '']} onOptionSelect={(_, x) => set('photo_id', x.optionValue || null)}>
                  <Option value="">(Ninguna)</Option>
                  {photos.map((p) => <Option key={p.id} value={p.id} text={p.caption || `Foto ${p.position}`}>{`${p.stage} · ${p.position} · ${p.caption ?? ''}`}</Option>)}
                </Dropdown>
              </Field>
            </div>
            {error && <Caption1 style={{ color: 'var(--colorPaletteRedForeground1)', display: 'block', marginTop: 8 }}>{error}</Caption1>}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button appearance="primary" onClick={save} disabled={busy}>{busy ? <Spinner size="tiny" /> : 'Guardar hallazgo'}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
