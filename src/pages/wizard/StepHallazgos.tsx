import { useEffect, useRef, useState } from 'react';
import {
  Button, Caption1, Field, MessageBar, MessageBarBody, Table, TableBody, TableCell, TableHeader, TableHeaderCell,
  TableRow, Text, Textarea, makeStyles, tokens,
} from '@fluentui/react-components';
import { Add20Regular, ArrowClockwise20Regular, ArrowLeft20Regular, ArrowRight20Regular, Delete20Regular, Edit20Regular } from '@fluentui/react-icons';
import { Section, StatusBadge } from '../../components/common';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FindingDialog } from '../../components/FindingDialog';
import { supabase, must } from '../../lib/supabase';
import { logActivity } from '../../lib/services';
import { conclusionsFrom, recommendationsFrom } from '../../lib/texts';
import { useNotify } from '../../lib/toast';
import type { Finding } from '../../lib/types';
import type { SaveHandler, StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' },
  texts: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', '@media (max-width: 600px)': { gridTemplateColumns: '1fr' } },
  pre: { whiteSpace: 'pre-wrap', padding: '10px 12px', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium, minHeight: '80px' },
});

export function StepHallazgos({ bundle, reload, readOnly, goTo, registerSave }: StepProps & { registerSave: (h: SaveHandler | null) => void }) {
  const s = useStyles();
  const notify = useNotify();
  const svc = bundle.service;
  const codeOf = (seId: string) => bundle.equipment.find((e) => e.id === seId)?.code ?? '—';
  const activityOf = (f: Finding) =>
    Object.values(bundle.items).flat().find((i) => i.id === f.template_item_id)?.activity ?? '—';

  const [dialog, setDialog] = useState<Partial<Finding> | null>(null);
  const [toDelete, setToDelete] = useState<Finding | null>(null);
  const [manual, setManual] = useState(!!svc.conclusions);
  const [conclusions, setConclusions] = useState(svc.conclusions ?? '');
  const [recommendations, setRecommendations] = useState(svc.recommendations ?? '');

  const genC = conclusionsFrom(bundle.findings, codeOf);
  const genR = recommendationsFrom(bundle.findings, codeOf);
  const shownC = manual ? conclusions : genC;
  const shownR = manual ? recommendations : genR;

  const latest = useRef({ shownC, shownR });
  latest.current = { shownC, shownR };

  const save = async () => {
    if (readOnly) return true;
    const { shownC: c, shownR: r } = latest.current;
    if ((svc.conclusions ?? '') === c && (svc.recommendations ?? '') === r) return true;
    const { error } = await supabase.from('services').update({ conclusions: c || null, recommendations: r || null }).eq('id', svc.id);
    if (error) {
      notify('No se pudo guardar', 'error', error.message);
      return false;
    }
    notify('Conclusiones guardadas');
    return true;
  };

  useEffect(() => {
    registerSave(save);
    return () => registerSave(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async () => {
    must(await supabase.from('findings').delete().eq('id', toDelete!.id));
    await logActivity(svc.id, `quitó el hallazgo “${toDelete!.finding}”`);
    setToDelete(null);
    await reload();
  };

  const ncPending = bundle.results.filter(
    (r) => r.result === 'NC' && !bundle.findings.some((f) => f.service_equipment_id === r.service_equipment_id && f.template_item_id === r.template_item_id),
  ).length;
  const conformes = bundle.equipment.filter((e) => !bundle.findings.some((f) => f.service_equipment_id === e.id));

  return (
    <>
      <Section
        title="Hallazgos y deficiencias"
        subtitle={`${bundle.findings.length} ${bundle.findings.length === 1 ? 'registrado' : 'registrados'} · se crean desde actividades “No conforme” del checklist`}
        actions={!readOnly && (
          <Button appearance="primary" icon={<Add20Regular />} disabled={!bundle.equipment.length}
            onClick={() => setDialog({ service_equipment_id: bundle.equipment[0]?.id })}>
            Agregar hallazgo
          </Button>
        )}
      >
        {ncPending > 0 && (
          <MessageBar intent="warning" style={{ marginBottom: 12 }}>
            <MessageBarBody>Hay {ncPending} actividad(es) “No conforme” sin hallazgo registrado.</MessageBarBody>
          </MessageBar>
        )}
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell style={{ width: 44 }}>N.º</TableHeaderCell>
              <TableHeaderCell style={{ width: 90 }}>Equipo</TableHeaderCell>
              <TableHeaderCell>Actividad origen</TableHeaderCell>
              <TableHeaderCell>Hallazgo</TableHeaderCell>
              <TableHeaderCell>Causa probable</TableHeaderCell>
              <TableHeaderCell>Acción realizada</TableHeaderCell>
              <TableHeaderCell>Recomendación</TableHeaderCell>
              <TableHeaderCell style={{ width: 90 }}>Prioridad</TableHeaderCell>
              <TableHeaderCell style={{ width: 80 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundle.findings.map((f, i) => (
              <TableRow key={f.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell><Text weight="semibold">{codeOf(f.service_equipment_id)}</Text></TableCell>
                <TableCell>{activityOf(f)}</TableCell>
                <TableCell>{f.finding}</TableCell>
                <TableCell><Caption1>{f.probable_cause}</Caption1></TableCell>
                <TableCell><Caption1>{f.action_taken}</Caption1></TableCell>
                <TableCell><Caption1>{f.recommendation}</Caption1></TableCell>
                <TableCell><StatusBadge status={f.priority} /></TableCell>
                <TableCell>
                  {!readOnly && (
                    <>
                      <Button size="small" appearance="subtle" icon={<Edit20Regular />} aria-label="Editar" onClick={() => setDialog(f)} />
                      <Button size="small" appearance="subtle" icon={<Delete20Regular />} aria-label="Quitar" onClick={() => setToDelete(f)} />
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {bundle.findings.length === 0 && <Caption1 block style={{ padding: 12 }}>Sin hallazgos. Todos los equipos se reportarán como “Conforme · sin observaciones”.</Caption1>}
      </Section>

      <div style={{ height: 16 }} />
      <Section
        title="Conclusiones y recomendaciones"
        subtitle={manual ? 'Editadas manualmente' : 'Vista previa · se generan a partir de los hallazgos'}
        actions={!readOnly && (
          manual ? (
            <Button icon={<ArrowClockwise20Regular />} onClick={() => setManual(false)}>Regenerar texto</Button>
          ) : (
            <Button icon={<Edit20Regular />} onClick={() => { setConclusions(genC); setRecommendations(genR); setManual(true); }}>Editar manualmente</Button>
          )
        )}
      >
        <div style={{ height: 8 }} />
        <div className={s.texts}>
          <Field label="Conclusiones">
            {manual ? <Textarea rows={6} value={conclusions} onChange={(_, d) => setConclusions(d.value)} disabled={readOnly} /> : <Text className={s.pre}>{genC || '—'}</Text>}
          </Field>
          <Field label="Recomendaciones">
            {manual ? <Textarea rows={6} value={recommendations} onChange={(_, d) => setRecommendations(d.value)} disabled={readOnly} /> : <Text className={s.pre}>{genR || '—'}</Text>}
          </Field>
        </div>
        <Caption1 block style={{ marginTop: 8, color: tokens.colorNeutralForeground3 }}>
          Los equipos sin hallazgos ({conformes.map((e) => e.code).join(', ') || 'ninguno'}) se reportan como “Conforme · sin observaciones”.
          Los textos usan las plantillas del catálogo de hallazgos.
        </Caption1>
      </Section>

      <div className={s.footer}>
        <Button icon={<ArrowLeft20Regular />} onClick={() => goTo(4)}>Anterior: Fotografías</Button>
        <Button appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" onClick={() => goTo(6)}>Siguiente: Generar informe</Button>
      </div>

      <FindingDialog open={!!dialog} bundle={bundle} initial={dialog ?? undefined} onClose={() => setDialog(null)}
        onSaved={() => { notify(dialog?.id ? 'Hallazgo actualizado' : 'Hallazgo registrado'); reload(); }} />
      <ConfirmDialog open={!!toDelete} title="¿Quitar hallazgo?" danger confirmLabel="Quitar"
        body={`Se quitará “${toDelete?.finding}” del equipo ${toDelete ? codeOf(toDelete.service_equipment_id) : ''}.`}
        onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  );
}
