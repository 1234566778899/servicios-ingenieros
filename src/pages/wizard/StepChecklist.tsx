import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Caption1, Field, Input, MessageBar, MessageBarActions, MessageBarBody, Radio, RadioGroup, Table,
  TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { ArrowLeft20Regular, ArrowRight20Regular, CheckmarkCircle20Regular, Eraser20Regular } from '@fluentui/react-icons';
import { AsyncButton, Section, StatusBadge } from '../../components/common';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EquipmentRail } from '../../components/EquipmentRail';
import { FindingDialog } from '../../components/FindingDialog';
import { useCatalogs } from '../../lib/catalogs';
import { useMediaQuery } from '../../lib/media';
import { supabase } from '../../lib/supabase';
import { equipmentLabel, finalStatusOf } from '../../lib/services';
import { useNotify } from '../../lib/toast';
import type { ChecklistResult, Finding } from '../../lib/types';
import type { StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px', alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' },
  counters: { display: 'flex', gap: '6px 8px', marginTop: '6px', flexWrap: 'wrap' },
  // Celular: una tarjeta por actividad en vez de la tabla (la columna Resultado quedaba fuera de la pantalla)
  cards: { display: 'flex', flexDirection: 'column', gap: '8px' },
  card: {
    display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px',
    border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
  },
  radios: { flexWrap: 'wrap', marginLeft: '-8px' },
  bottom: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', marginTop: '16px', '@media (max-width: 600px)': { gridTemplateColumns: 'minmax(0, 1fr)' } },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '8px', flexWrap: 'wrap' },
});

type R = ChecklistResult['result'];

export function StepChecklist({ bundle, reload, patch, readOnly, goTo }: StepProps) {
  const s = useStyles();
  const cat = useCatalogs();
  const notify = useNotify();
  const [selId, setSelId] = useState(bundle.equipment[0]?.id ?? '');
  const [results, setResults] = useState<ChecklistResult[]>(bundle.results);
  const [statuses, setStatuses] = useState(() => Object.fromEntries(bundle.equipment.map((e) => [e.id, e.final_status])));
  const [observation, setObservation] = useState('');
  const [finding, setFinding] = useState<Partial<Finding> | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const narrow = useMediaQuery('(max-width: 700px)');

  const eq = bundle.equipment.find((e) => e.id === selId);
  const items = useMemo(() => (eq?.checklist_template_id ? bundle.items[eq.checklist_template_id] ?? [] : []), [eq, bundle.items]);
  const mine = results.filter((r) => r.service_equipment_id === selId);
  const get = (itemId: string) => mine.find((r) => r.template_item_id === itemId);

  useEffect(() => setObservation(eq?.observation ?? ''), [eq]);

  const progress = (seId: string) => {
    const e = bundle.equipment.find((x) => x.id === seId)!;
    const its = e.checklist_template_id ? bundle.items[e.checklist_template_id] ?? [] : [];
    return `${results.filter((r) => r.service_equipment_id === seId && r.result).length}/${its.length}`;
  };

  const syncStatus = async (next: ChecklistResult[]) => {
    const st = finalStatusOf(items, next.filter((r) => r.service_equipment_id === selId));
    const before = statuses[selId];
    if (st === before) return;
    setStatuses((x) => ({ ...x, [selId]: st }));
    const { error } = await supabase.from('service_equipment').update({ final_status: st }).eq('id', selId);
    if (error) {
      setStatuses((x) => ({ ...x, [selId]: before }));
      notify('No se pudo guardar el estado final del equipo', 'error', error.message);
    }
  };

  const same = (a: ChecklistResult, b: ChecklistResult) => a.service_equipment_id === b.service_equipment_id && a.template_item_id === b.template_item_id;

  /** Se marca al instante; si no se guarda, la pantalla vuelve a lo que había para no mostrar algo que no quedó en la nube. */
  const write = async (rows: ChecklistResult[]) => {
    if (!rows.length) return;
    const previous = results.filter((r) => rows.some((x) => same(x, r)));
    const next = [...results.filter((r) => !rows.some((x) => same(x, r))), ...rows];
    setResults(next);
    const { error } = await supabase
      .from('checklist_results')
      .upsert(rows.map(({ service_equipment_id, template_item_id, result, value }) => ({ service_equipment_id, template_item_id, result, value, updated_at: new Date().toISOString() })),
        { onConflict: 'service_equipment_id,template_item_id' });
    if (error) {
      setResults((cur) => [...cur.filter((r) => !rows.some((x) => same(x, r))), ...previous]);
      notify('No se pudo guardar el checklist', 'error', error.message);
      return;
    }
    await syncStatus(next);
  };

  const setResult = (itemId: string, result: R) =>
    write([{ service_equipment_id: selId, template_item_id: itemId, result, value: get(itemId)?.value ?? null }]);
  const setValue = (itemId: string, value: string) => {
    const cur = get(itemId);
    if ((cur?.value ?? '') === value) return;
    write([{ service_equipment_id: selId, template_item_id: itemId, result: cur?.result ?? null, value: value || null }]);
  };

  const markAll = () =>
    write(items.filter((i) => !get(i.id)?.result).map((i) => ({ service_equipment_id: selId, template_item_id: i.id, result: 'C', value: get(i.id)?.value ?? null })));

  const clearAll = async () => {
    const { error } = await supabase.from('checklist_results').delete().eq('service_equipment_id', selId);
    if (error) throw new Error(error.message);
    const next = results.filter((r) => r.service_equipment_id !== selId);
    setResults(next);
    setConfirmClear(false);
    await syncStatus(next);
  };

  const saveObservation = async () => {
    const id = selId;
    const value = observation.trim() || null;
    if ((eq?.observation ?? null) === value) return;
    // Sin recargar todo el servicio: solo se actualiza este equipo en pantalla
    patch((b) => ({ ...b, equipment: b.equipment.map((x) => (x.id === id ? { ...x, observation: value } : x)) }));
    const { error } = await supabase.from('service_equipment').update({ observation: value }).eq('id', id);
    if (error) {
      notify('No se pudo guardar la observación', 'error', error.message);
      await reload();
    }
  };

  const counts = { C: 0, NC: 0, NA: 0, P: 0 };
  for (const i of items) {
    const r = get(i.id)?.result;
    if (r) counts[r]++;
    else counts.P++;
  }
  const resultOf = (itemId: string, activity: string) => (
    <RadioGroup layout="horizontal" value={get(itemId)?.result ?? ''} disabled={readOnly} aria-label={activity}
      className={narrow ? s.radios : undefined} onChange={(_, d) => setResult(itemId, d.value as R)}>
      <Radio value="C" label="Conforme" />
      <Radio value="NC" label="No conforme" />
      <Radio value="NA" label="N.A." />
    </RadioGroup>
  );
  const valueOf = (i: (typeof items)[number]) => (
    <Input size={narrow ? 'medium' : 'small'} style={{ width: '100%' }} disabled={readOnly} key={`${selId}-${i.id}`}
      defaultValue={get(i.id)?.value ?? ''}
      placeholder={i.response_type === 'cn_value' ? `Valor${i.value_unit ? ` (${i.value_unit})` : ''}` : narrow ? 'Observación (opcional)' : '—'}
      contentAfter={i.response_type === 'cn_value' && i.value_unit ? <Caption1>{i.value_unit}</Caption1> : undefined}
      onBlur={(e) => setValue(i.id, e.target.value.trim())} />
  );

  const ncWithoutFinding = items.filter((i) => get(i.id)?.result === 'NC' && !bundle.findings.some((f) => f.service_equipment_id === selId && f.template_item_id === i.id));
  const idx = bundle.equipment.findIndex((e) => e.id === selId);
  const nextEq = bundle.equipment[idx + 1];

  return (
    <>
      <div className={s.grid}>
        <Section title="Equipos del servicio">
          <EquipmentRail
            equipment={bundle.equipment}
            selected={selId}
            onSelect={(id) => { saveObservation(); setSelId(id); }}
            right={(e) => (
              <div style={{ textAlign: 'right' }}>
                <Caption1 block>{progress(e.id)}</Caption1>
                <StatusBadge status={statuses[e.id]} />
              </div>
            )}
          />
          <Caption1 block style={{ marginTop: 12, color: tokens.colorNeutralForeground3 }}>
            El checklist se carga según el tipo de equipo (plantilla del catálogo).
          </Caption1>
        </Section>

        {eq && (
          <Section>
            <div className={s.head}>
              <div>
                <Text size={500} weight="semibold" block>{eq.code} · {cat.typeName(eq.equipment_type_id)}</Text>
                <Caption1>
                  {[eq.brand, eq.model].filter(Boolean).join(' / ')} · {equipmentLabel(eq)} · Plantilla “{cat.typeName(eq.equipment_type_id)}” · {items.length} actividades
                </Caption1>
                <div className={s.counters}>
                  <Badge appearance="tint" color="success">{counts.C} Conforme</Badge>
                  <Badge appearance="tint" color="danger">{counts.NC} No conforme</Badge>
                  <Badge appearance="tint" color="subtle">{counts.NA} N.A.</Badge>
                  <Badge appearance="tint" color="warning">{counts.P} Pendiente</Badge>
                </div>
              </div>
              {!readOnly && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button icon={<CheckmarkCircle20Regular />} onClick={markAll} disabled={!counts.P}>Marcar todo Conforme</Button>
                  <Button icon={<Eraser20Regular />} onClick={() => setConfirmClear(true)} disabled={!mine.length}>Limpiar resultados</Button>
                </div>
              )}
            </div>
            {!items.length && (
              <MessageBar intent="warning">
                <MessageBarBody>Este tipo de equipo no tiene plantilla de checklist. Configúrala en Catálogos y plantillas.</MessageBarBody>
              </MessageBar>
            )}
            {items.length > 0 && narrow && (
              <div className={s.cards}>
                {items.map((i, n) => (
                  <div key={i.id} className={s.card}>
                    <Caption1>{n + 1}. {i.category}</Caption1>
                    <Text weight="semibold">{i.activity}{i.required ? '' : ' (opcional)'}</Text>
                    {resultOf(i.id, i.activity)}
                    {valueOf(i)}
                  </div>
                ))}
              </div>
            )}
            {items.length > 0 && !narrow && (
              <Table size="small">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell style={{ width: 44 }}>N.º</TableHeaderCell>
                    <TableHeaderCell style={{ width: 120 }}>Categoría</TableHeaderCell>
                    <TableHeaderCell>Actividad</TableHeaderCell>
                    <TableHeaderCell style={{ width: 330 }}>Resultado</TableHeaderCell>
                    <TableHeaderCell style={{ width: 200 }}>Observación / valor</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i, n) => (
                    <TableRow key={i.id}>
                      <TableCell>{n + 1}</TableCell>
                      <TableCell>{i.category}</TableCell>
                      <TableCell>{i.activity}{i.required ? '' : ' (opcional)'}</TableCell>
                      <TableCell>{resultOf(i.id, i.activity)}</TableCell>
                      <TableCell>{valueOf(i)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {ncWithoutFinding.map((i) => (
              <MessageBar key={i.id} intent="warning" style={{ marginTop: 12 }}>
                <MessageBarBody>
                  {i.activity} quedó “No conforme”. Registra el hallazgo para que aparezca en las secciones 6 y 7 del informe.
                </MessageBarBody>
                {!readOnly && (
                  <MessageBarActions>
                    <Button size="small" onClick={() => setFinding({ service_equipment_id: selId, template_item_id: i.id, finding: get(i.id)?.value ?? '' })}>
                      Registrar hallazgo
                    </Button>
                  </MessageBarActions>
                )}
              </MessageBar>
            ))}
            <div className={s.bottom}>
              <Field label="Estado final del equipo">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusBadge status={statuses[selId]} />
                  <Caption1>
                    {statuses[selId] === 'No conforme' ? `(calculado: ${counts.NC} actividad${counts.NC === 1 ? '' : 'es'} No conforme)` : '(calculado)'}
                  </Caption1>
                </div>
              </Field>
              <Field label="Observación para la lista de equipos">
                <Input value={observation} disabled={readOnly} onChange={(_, d) => setObservation(d.value)} onBlur={saveObservation}
                  placeholder={statuses[selId] === 'No conforme' ? 'Problemas detectados' : 'Sin observaciones'} />
              </Field>
            </div>
          </Section>
        )}
      </div>
      <div className={s.footer}>
        <AsyncButton icon={<ArrowLeft20Regular />} onClick={() => goTo('equipos', saveObservation)}>Anterior: Equipos</AsyncButton>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {nextEq && <Button onClick={() => { saveObservation(); setSelId(nextEq.id); }}>Siguiente equipo: {nextEq.code}</Button>}
          <AsyncButton appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" onClick={() => goTo('fotos', saveObservation)}>
            Siguiente: Fotografías
          </AsyncButton>
        </div>
      </div>
      <ConfirmDialog open={confirmClear} title={`¿Limpiar el checklist de ${eq?.code}?`} danger confirmLabel="Limpiar"
        body={`Se borrarán los ${mine.length} resultado(s) y valores registrados de este equipo. Los hallazgos ya registrados se conservan.`}
        onConfirm={clearAll} onCancel={() => setConfirmClear(false)} />
      <FindingDialog open={!!finding} bundle={bundle} initial={finding ?? undefined} onClose={() => setFinding(null)}
        onSaved={() => { notify('Hallazgo registrado'); reload(); }} />
    </>
  );
}
