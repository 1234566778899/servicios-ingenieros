import { useEffect, useRef, useState } from 'react';
import { Caption1, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowLeft20Regular, ArrowRight20Regular } from '@fluentui/react-icons';
import { AsyncButton, Section } from '../../components/common';
import { ConceptList, invalidateConcepts } from '../../components/Concepts';
import { supabase } from '../../lib/supabase';
import { logActivity, rememberConcepts } from '../../lib/services';
import { useNotify } from '../../lib/toast';
import type { SaveHandler, StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' },
});

/** Servicios sin equipos: lista de trabajos ejecutados ("Se realizó…"), con conceptos guardados. */
export function StepTrabajos({ bundle, readOnly, goTo, registerSave }: StepProps & { registerSave: (h: SaveHandler | null) => void }) {
  const s = useStyles();
  const notify = useNotify();
  const svc = bundle.service;
  const [items, setItems] = useState<string[]>(svc.work_items);

  const latest = useRef(items);
  latest.current = items;
  // Último estado guardado: solo los textos nuevos suman como concepto
  const saved = useRef(svc.work_items);

  const dirty = () => !readOnly && JSON.stringify(latest.current.map((t) => t.trim()).filter(Boolean)) !== JSON.stringify(saved.current);

  const save = async () => {
    if (readOnly) return true;
    const list = latest.current.map((t) => t.trim()).filter(Boolean);
    if (JSON.stringify(list) === JSON.stringify(saved.current)) return true;
    const { error } = await supabase.from('services').update({ work_items: list }).eq('id', svc.id);
    if (error) {
      notify('No se pudo guardar', 'error', error.message);
      return false;
    }
    await rememberConcepts('trabajo', svc.specialty, list.filter((t) => !saved.current.includes(t)));
    saved.current = list;
    invalidateConcepts('trabajo');
    await logActivity(svc.id, `actualizó los trabajos realizados (${list.length})`);
    notify('Trabajos guardados');
    return true;
  };

  useEffect(() => {
    registerSave(Object.assign(save, { dirty }));
    // Al salir del asistente (menú, búsqueda, "Cerrar") se guarda lo pendiente
    return () => {
      registerSave(null);
      if (dirty()) void save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Section title="Trabajos realizados" subtitle={`${items.length} · ${svc.specialty} · sección 3 del informe`}>
        <Caption1 block style={{ marginBottom: 12, color: tokens.colorNeutralForeground3 }}>
          Describe cada actividad ejecutada. Al escribir se sugieren los textos usados en otros informes de {svc.specialty.toLowerCase()};
          lo que escribas aquí también queda guardado para la próxima vez.
        </Caption1>
        <ConceptList kind="trabajo" specialty={svc.specialty} items={items} onChange={setItems} readOnly={readOnly}
          placeholder="Ej.: Se realizó el cambio de luminarias deterioradas en la zona de caja…" emptyText="Sin trabajos registrados." />
      </Section>
      <div className={s.footer}>
        <AsyncButton icon={<ArrowLeft20Regular />} onClick={() => goTo('datos')}>Anterior</AsyncButton>
        <AsyncButton appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" onClick={() => goTo('fotos')}>
          Siguiente: Fotografías
        </AsyncButton>
      </div>
    </>
  );
}
