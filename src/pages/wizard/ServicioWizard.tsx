import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, MessageBar, MessageBarBody, Tab, TabList, makeStyles, tokens,
} from '@fluentui/react-components';
import { Checkmark16Filled, Save20Regular } from '@fluentui/react-icons';
import { PageHeader, Loading, ErrorBar } from '../../components/common';
import { useAuth } from '../../lib/auth';
import { useCatalogs } from '../../lib/catalogs';
import { useRouter } from '../../lib/router';
import { loadServiceBundle, type ServiceBundle } from '../../lib/services';
import { useServicePresence } from '../../lib/presence';
import { StepDatos } from './StepDatos';
import { StepEquipos } from './StepEquipos';
import { StepChecklist } from './StepChecklist';
import { StepFotos } from './StepFotos';
import { StepHallazgos } from './StepHallazgos';
import { StepInforme } from './StepInforme';

const STEPS = ['Datos del servicio', 'Equipos', 'Checklist', 'Fotografías', 'Hallazgos', 'Generar informe'];

const useStyles = makeStyles({
  steps: {
    backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow4, padding: '4px 8px', marginBottom: '16px',
  },
  num: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px',
    borderRadius: '50%', fontSize: '11px', fontWeight: 600, marginRight: '6px',
  },
});

export interface StepProps {
  bundle: ServiceBundle;
  reload: () => Promise<void>;
  readOnly: boolean;
  goTo: (step: number) => void;
}

/** Guarda borrador: cada paso registra aquí su función de guardado pendiente. */
export type SaveHandler = () => Promise<boolean>;

export function ServicioWizard({ serviceId }: { serviceId?: string }) {
  const s = useStyles();
  const { path, navigate } = useRouter();
  const { can, profile } = useAuth();
  const cat = useCatalogs();
  const qs = new URLSearchParams(path.split('?')[1] ?? '');
  const step = serviceId ? Math.min(6, Math.max(1, Number(qs.get('paso')) || 1)) : 1;

  const [bundle, setBundle] = useState<ServiceBundle | null>(null);
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

  // Recarga al cambiar de paso para ver lo que otros usuarios hayan guardado
  const [freshFor, setFreshFor] = useState<number | null>(null);
  useEffect(() => {
    setFreshFor(null);
    reload().then(() => setFreshFor(step));
  }, [reload, step]);

  const others = useServicePresence(serviceId, true);
  const register = useCallback((h: SaveHandler | null) => setSaveHandler(() => h), []);

  const goTo = async (n: number) => {
    if (!serviceId) return;
    if (saveHandler && !(await saveHandler())) return;
    navigate(`/servicios/${serviceId}/editar?paso=${n}`);
  };

  if (serviceId && !bundle) return error ? <ErrorBar error={error} /> : <Loading />;

  const svc = bundle?.service;
  const member = svc && [svc.created_by, svc.lead_tech_id, ...svc.support_tech_ids].includes(profile!.id);
  const readOnly = !!svc && !(can('servicios.editar_otros') || (can('servicios.editar_propios') && member));

  const done = (n: number) => {
    if (!bundle) return false;
    const eq = bundle.equipment;
    switch (n) {
      case 1: return true;
      case 2: return eq.length > 0;
      case 3: return eq.length > 0 && eq.every((e) => e.final_status !== 'Pendiente');
      case 4: return eq.length > 0 && eq.every((e) => bundle.photos.filter((p) => p.service_equipment_id === e.id).length >= 9);
      case 5: return eq.length > 0 && (bundle.findings.length > 0 || eq.every((e) => e.final_status === 'Conforme'));
      case 6: return bundle.reports.length > 0;
    }
    return false;
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
            <Button onClick={() => navigate(svc ? `/servicios/${svc.id}` : '/servicios')}>{svc ? 'Cerrar' : 'Cancelar'}</Button>
            {!readOnly && saveHandler && (
              <Button
                icon={<Save20Regular />}
                disabled={saving}
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
      <div className={s.steps}>
        <TabList selectedValue={step} onTabSelect={(_, d) => goTo(d.value as number)} disabled={!serviceId}>
          {STEPS.map((label, i) => {
            const n = i + 1;
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
                  {ok ? <Checkmark16Filled /> : n}
                </span>
                {label}
              </Tab>
            );
          })}
        </TabList>
      </div>
      {freshFor !== step && <Loading />}
      {freshFor === step && step === 1 && <StepDatos bundle={bundle} reload={reload} readOnly={readOnly} goTo={goTo} registerSave={register} />}
      {bundle && freshFor === step && step === 2 && <StepEquipos bundle={bundle} reload={reload} readOnly={readOnly} goTo={goTo} />}
      {bundle && freshFor === step && step === 3 && <StepChecklist bundle={bundle} reload={reload} readOnly={readOnly} goTo={goTo} />}
      {bundle && freshFor === step && step === 4 && <StepFotos bundle={bundle} reload={reload} readOnly={readOnly} goTo={goTo} />}
      {bundle && freshFor === step && step === 5 && <StepHallazgos bundle={bundle} reload={reload} readOnly={readOnly} goTo={goTo} registerSave={register} />}
      {bundle && freshFor === step && step === 6 && <StepInforme bundle={bundle} reload={reload} readOnly={readOnly} goTo={goTo} />}
    </>
  );
}
