import { useEffect, useRef, useState } from 'react';
import { Caption1, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowLeft20Regular, ArrowRight20Regular } from '@fluentui/react-icons';
import { AsyncButton, Section } from '../../components/common';
import { ConceptList, invalidateConcepts } from '../../components/Concepts';
import { supabase } from '../../lib/supabase';
import { logActivity, rememberConcepts, splitLines } from '../../lib/services';
import { useNotify } from '../../lib/toast';
import type { ConceptKind } from '../../lib/types';
import type { SaveHandler, StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  col: { display: 'flex', flexDirection: 'column', gap: '16px' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' },
});

type Texts = { conclusions: string[]; observations: string[]; recommendations: string[] };
const KIND: Record<keyof Texts, ConceptKind> = { conclusions: 'conclusion', observations: 'observacion', recommendations: 'recomendacion' };

/** Servicios sin equipos: conclusiones, observaciones y recomendaciones (un párrafo por elemento). */
export function StepCierre({ bundle, readOnly, goTo, registerSave }: StepProps & { registerSave: (h: SaveHandler | null) => void }) {
  const s = useStyles();
  const notify = useNotify();
  const svc = bundle.service;
  const initial: Texts = {
    conclusions: splitLines(svc.conclusions), observations: splitLines(svc.observations), recommendations: splitLines(svc.recommendations),
  };
  const [texts, setTexts] = useState<Texts>(initial);

  const latest = useRef(texts);
  latest.current = texts;
  const saved = useRef(initial);

  const clean = () => Object.fromEntries(Object.entries(latest.current).map(([k, v]) => [k, v.map((x) => x.trim()).filter(Boolean)])) as Texts;
  const dirty = () => !readOnly && JSON.stringify(clean()) !== JSON.stringify(saved.current);

  const save = async () => {
    if (readOnly) return true;
    const t = clean();
    if (JSON.stringify(t) === JSON.stringify(saved.current)) return true;
    const { error } = await supabase.from('services').update({
      conclusions: t.conclusions.join('\n') || null,
      observations: t.observations.join('\n') || null,
      recommendations: t.recommendations.join('\n') || null,
    }).eq('id', svc.id);
    if (error) {
      notify('No se pudo guardar', 'error', error.message);
      return false;
    }
    for (const k of Object.keys(KIND) as (keyof Texts)[]) {
      const fresh = t[k].filter((x) => !saved.current[k].includes(x));
      // Conceptos e historial por detrás: no frenan el cambio de paso
      if (fresh.length) void rememberConcepts(KIND[k], svc.specialty, fresh).then(() => invalidateConcepts(KIND[k]), () => {});
    }
    saved.current = t;
    void logActivity(svc.id, 'editó conclusiones y recomendaciones').catch(() => {});
    notify('Conclusiones guardadas');
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

  const list = (k: keyof Texts, placeholder: string, empty: string) => (
    <ConceptList kind={KIND[k]} specialty={svc.specialty} items={texts[k]} readOnly={readOnly} placeholder={placeholder} emptyText={empty}
      onChange={(v) => setTexts((x) => ({ ...x, [k]: v }))} />
  );

  return (
    <>
      <div className={s.col}>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          Las sugerencias vienen de informes anteriores de {svc.specialty.toLowerCase()} y de otras especialidades. Los textos nuevos se guardan como conceptos al avanzar.
        </Caption1>
        <Section title="Conclusiones">
          {list('conclusions', 'Ej.: Se realizó satisfactoriamente el servicio de…', 'Sin conclusiones.')}
        </Section>
        <Section title="Observaciones" subtitle="opcional · solo aparece en el informe si hay alguna">
          {list('observations', 'Ej.: Se evidenció…', 'Sin observaciones.')}
        </Section>
        <Section title="Recomendaciones">
          {list('recommendations', 'Ej.: Se recomienda realizar inspecciones periódicas…', 'Sin recomendaciones.')}
        </Section>
      </div>
      <div className={s.footer}>
        <AsyncButton icon={<ArrowLeft20Regular />} onClick={() => goTo('fotos')}>Anterior: Fotografías</AsyncButton>
        <AsyncButton appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" onClick={() => goTo('informe')}>
          Siguiente: Generar informe
        </AsyncButton>
      </div>
    </>
  );
}
