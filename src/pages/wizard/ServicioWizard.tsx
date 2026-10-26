import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge, Button, MessageBar, MessageBarBody, ProgressBar, Spinner, Tab, TabList, makeStyles, tokens,
} from '@fluentui/react-components';
import { Checkmark16Filled, Save20Regular } from '@fluentui/react-icons';
import { AsyncButton, PageHeader, Loading, ErrorBar } from '../../components/common';
import { useAuth } from '../../lib/auth';
import { useCatalogs } from '../../lib/catalogs';
import { useRouter } from '../../lib/router';
import { loadServiceBundle, photoStagesDone, splitLines, usesEquipment, type ServiceBundle } from '../../lib/services';
import { useServicePresence } from '../../lib/presence';
import { StepDatos } from './StepDatos';
import { StepEquipos } from './StepEquipos';
import { StepChecklist } from './StepChecklist';
import { StepFotos } from './StepFotos';
import { StepFotosSecciones } from './StepFotosSecciones';
import { StepHallazgos } from './StepHallazgos';
import { StepTrabajos } from './StepTrabajos';
import { StepCierre } from './StepCierre';
import { StepInforme } from './StepInforme';

export type StepKey = 'datos' | 'equipos' | 'checklist' | 'fotos' | 'hallazgos' | 'trabajos' | 'cierre' | 'informe';

/** Con equipos (aire acondicionado): checklist y hallazgos por equipo. Sin equipos: trabajos, fotos por sección y cierre. */
const EQUIPMENT_STEPS: [StepKey, string][] = [
  ['datos', 'Datos del servicio'], ['equipos', 'Equipos'], ['checklist', 'Checklist'], ['fotos', 'Fotografías'],
  ['hallazgos', 'Hallazgos'], ['informe', 'Generar informe'],
];
const SERVICE_STEPS: [StepKey, string][] = [
  ['datos', 'Datos del servicio'], ['trabajos', 'Trabajos realizados'], ['fotos', 'Fotografías'],
  ['cierre', 'Conclusiones'], ['informe', 'Generar informe'],
];

const useStyles = makeStyles({
  steps: {
    backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow4, padding: '4px 8px', marginBottom: '16px', overflowX: 'auto',
  },
  num: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px',
    borderRadius: '50%', fontSize: '11px', fontWeight: 600, marginRight: '6px',
  },
});

export interface StepProps {
  bundle: ServiceBundle;
  reload: () => Promise<void>;
  /** Cambia los datos en pantalla al instante (el paso guarda en la nube por detrás y recarga si algo falla) */
  patch: (fn: (b: ServiceBundle) => ServiceBundle) => void;
  readOnly: boolean;
  goTo: (step: StepKey, before?: () => Promise<unknown>) => Promise<void>;
}

/** Guarda borrador: cada paso registra aquí su función de guardado pendiente. */
export type SaveHandler = (() => Promise<boolean>) & {
  /** Hay cambios sin guardar (para avisar al cerrar la pestaña) */
  dirty?: () => boolean;
};

export function ServicioWizard({ serviceId }: { serviceId?: string }) {
  const s = useStyles();
  const { path, navigate } = useRouter();
  const { can, profile } = useAuth();
  const cat = useCatalogs();
  const qs = new URLSearchParams(path.split('?')[1] ?? '');

  const [loaded, setBundle] = useState<ServiceBundle | null>(null);
  // Al pasar de un servicio a "Nuevo" (mismo asistente montado) no se usan los datos del anterior
  const bundle = loaded && loaded.service.id === serviceId ? loaded : null;
  const [error, setError] = useState<string | null>(null);
  const [saveHandler, setSaveHandler] = useState<SaveHandler | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!serviceId) return;
    try {
      setBundle(await loadServiceBundle(serviceId));
    } catch (e: any) {
      setError(e.message);
    }
  }, [serviceId]);

  // Carga inicial (y al pasar de "nuevo" a un servicio ya creado)
  useEffect(() => {
    setBundle(null);
    reload();
  }, [reload]);
  // Paso al que se está yendo mientras se recargan los datos (el paso actual sigue visible)
  const [pending, setPending] = useState<StepKey | null>(null);

  const withEquipment = !bundle || usesEquipment(bundle, cat.hasEquipment);
  const steps = withEquipment ? EQUIPMENT_STEPS : SERVICE_STEPS;
  // ?paso=fotos (o el número de paso de los enlaces antiguos); un paso que no existe en este recorrido vuelve a Datos
  const raw = qs.get('paso') ?? '';
  const asked = (/^\d+$/.test(raw) ? EQUIPMENT_STEPS[Number(raw) - 1]?.[0] : raw) as StepKey;
  const step: StepKey = serviceId && steps.some(([k]) => k === asked) ? asked : 'datos';

  const others = useServicePresence(serviceId, true);
  // En pantallas angostas la barra de pasos se desplaza hasta el paso actual
  const stepsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stepsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [step, bundle]);
  const handlerRef = useRef<SaveHandler | null>(null);
  const register = useCallback((h: SaveHandler | null) => {
    handlerRef.current = h;
    setSaveHandler(() => h);
  }, []);
  // Cerrar la pestaña o recargar con cambios sin guardar: el navegador pide confirmación
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (handlerRef.current?.dirty?.()) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const patch = useCallback((fn: (b: ServiceBundle) => ServiceBundle) => setBundle((b) => b && fn(b)), []);

  /** Guarda el paso actual, trae los datos al día (cambios de otros usuarios) y recién entonces cambia de paso. */
  const goTo = async (n: StepKey, before?: () => Promise<unknown>) => {
    if (!serviceId || pending) return;
    setPending(n);
    try {
      await before?.();
      if (saveHandler && !(await saveHandler())) return;
      await reload();
      navigate(`/servicios/${serviceId}/editar?paso=${n}`);
    } finally {
      setPending(null);
    }
  };

  const svc = bundle?.service;
  const member = svc && [svc.created_by, svc.lead_tech_id, ...svc.support_tech_ids].includes(profile!.id);
  const readOnly = !!svc && !(can('servicios.editar_otros') || (can('servicios.editar_propios') && member));

  const done = (n: StepKey) => {
    if (!bundle) return false;
    const eq = bundle.equipment;
    switch (n) {
      case 'datos': return true;
      case 'equipos': return eq.length > 0;
      case 'checklist': return eq.length > 0 && eq.every((e) => e.final_status !== 'Pendiente');
      case 'fotos': return withEquipment
        ? eq.length > 0 && eq.every((e) => photoStagesDone(bundle.photos, e.id) === 3)
        : bundle.photos.length > 0;
      case 'hallazgos': return eq.length > 0 && (bundle.findings.length > 0 || eq.every((e) => e.final_status === 'Conforme'));
      case 'trabajos': return bundle.service.work_items.length > 0;
      case 'cierre': return splitLines(bundle.service.conclusions).length > 0;
      case 'informe': return bundle.reports.length > 0;
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Inicio', to: '/' },
          { label: 'Servicios', to: '/servicios' },
          ...(svc ? [{ label: svc.code, to: `/servicios/${svc.id}` }, { label: 'Editar' }] : [{ label: 'Nuevo' }]),
        ]}
        title={svc ? `${svc.code} · ${cat.siteName(svc.site_id)}` : 'Nuevo servicio técnico'}
        badges={readOnly && <Badge appearance="tint" color="warning">Solo lectura</Badge>}
        actions={
          <>
            <AsyncButton onClick={async () => {
              // Con un servicio ya creado se guarda antes de salir; si falla (validación, conflicto) se queda en el paso
              if (svc && saveHandler && !readOnly && !(await saveHandler())) return;
              navigate(svc ? `/servicios/${svc.id}` : '/servicios');
            }} disabled={!!pending}>{svc ? 'Cerrar' : 'Cancelar'}</AsyncButton>
            {!readOnly && saveHandler && (
              <Button
                icon={saving ? <Spinner size="tiny" /> : <Save20Regular />}
                disabled={saving || !!pending}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await saveHandler();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Guardar borrador
              </Button>
            )}
          </>
        }
      />
      {others.filter((o) => o.editing).map((o) => (
        <MessageBar key={o.id} intent="info" style={{ marginBottom: 12 }}>
          <MessageBarBody>
            {o.name} también está editando este servicio desde otro equipo. Los cambios se sincronizan al guardar.
          </MessageBarBody>
        </MessageBar>
      ))}
      {readOnly && (
        <MessageBar intent="warning" style={{ marginBottom: 12 }}>
          <MessageBarBody>
            Estás viendo un servicio asignado a {cat.userName(svc!.lead_tech_id)}. Tu rol solo permite consultarlo; para
            editarlo solicita acceso a un supervisor.
          </MessageBarBody>
        </MessageBar>
      )}
      <div className={s.steps} ref={stepsRef}>
        <TabList selectedValue={step} onTabSelect={(_, d) => goTo(d.value as StepKey)} disabled={!serviceId || !!pending}>
          {steps.map(([n, label], i) => {
            const ok = n !== step && done(n);
            return (
              <Tab key={n} value={n}>
                <span
                  className={s.num}
                  style={{
                    backgroundColor: n === step ? tokens.colorBrandBackground : ok ? tokens.colorPaletteGreenBackground3 : tokens.colorNeutralBackground5,
                    color: n === step || ok ? tokens.colorNeutralForegroundOnBrand : tokens.colorNeutralForeground2,
                  }}
                >
                  {ok ? <Checkmark16Filled /> : i + 1}
                </span>
                {label}
              </Tab>
            );
          })}
        </TabList>
      </div>
      {pending && <ProgressBar thickness="medium" style={{ marginTop: -12, marginBottom: 12 }} aria-label="Cargando paso" />}
      {error && <ErrorBar error={error} />}
      {serviceId && !bundle && !error && <Loading />}
      {(!serviceId || bundle) && step === 'datos' && (
        <StepDatos bundle={bundle} reload={reload} readOnly={readOnly} goTo={goTo} registerSave={register} withEquipment={withEquipment} />
      )}
      {bundle && step === 'equipos' && <StepEquipos bundle={bundle} reload={reload} patch={patch} readOnly={readOnly} goTo={goTo} />}
      {bundle && step === 'checklist' && <StepChecklist bundle={bundle} reload={reload} patch={patch} readOnly={readOnly} goTo={goTo} />}
      {bundle && step === 'fotos' && withEquipment && <StepFotos bundle={bundle} reload={reload} patch={patch} readOnly={readOnly} goTo={goTo} />}
      {bundle && step === 'fotos' && !withEquipment && <StepFotosSecciones bundle={bundle} reload={reload} patch={patch} readOnly={readOnly} goTo={goTo} />}
      {bundle && step === 'hallazgos' && <StepHallazgos bundle={bundle} reload={reload} patch={patch} readOnly={readOnly} goTo={goTo} registerSave={register} />}
      {bundle && step === 'trabajos' && <StepTrabajos bundle={bundle} reload={reload} patch={patch} readOnly={readOnly} goTo={goTo} registerSave={register} />}
      {bundle && step === 'cierre' && <StepCierre bundle={bundle} reload={reload} patch={patch} readOnly={readOnly} goTo={goTo} registerSave={register} />}
      {bundle && step === 'informe' && <StepInforme bundle={bundle} reload={reload} patch={patch} readOnly={readOnly} goTo={goTo} withEquipment={withEquipment} />}
    </>
  );
}
