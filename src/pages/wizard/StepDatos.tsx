import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, Caption1, Combobox, Dropdown, Field, Input, Option, Radio, RadioGroup, Text, Textarea, Tooltip,
  Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, makeStyles, tokens,
} from '@fluentui/react-components';
import { ArrowClockwise16Regular, ArrowRight20Regular } from '@fluentui/react-icons';
import { AsyncButton, Section, ErrorBar } from '../../components/common';
import { ConceptList } from '../../components/Concepts';
import { ImproveButton } from '../../components/ImproveWriting';
import { DateInput } from '../../components/DateInput';
import { useAuth } from '../../lib/auth';
import { optionNames, useCatalogs } from '../../lib/catalogs';
import { useRouter } from '../../lib/router';
import { supabase } from '../../lib/supabase';
import { addInventoryToService, loadSiteInventory, logActivity, rememberConcepts, type ServiceBundle } from '../../lib/services';
import { coverTitle, memoria, equipmentSummary, DEFAULT_PREV_DETAILS } from '../../lib/texts';
import { fmtDateTime, fold, siteAddress, today } from '../../lib/format';
import { useNotify } from '../../lib/toast';
import type { Service } from '../../lib/types';
import type { SaveHandler, StepProps } from './ServicioWizard';
import { friendlyError } from '../../lib/errors';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  form: {
    display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 16px',
    '@media (max-width: 1000px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, '@media (max-width: 600px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
    '& .fui-Dropdown, & .fui-Input, & .fui-Combobox': { minWidth: 0 },
  },
  span2: { gridColumn: 'span 2', '@media (max-width: 600px)': { gridColumn: 'auto' } },
  span3: { gridColumn: 'span 3', '@media (max-width: 1000px)': { gridColumn: 'span 2' }, '@media (max-width: 600px)': { gridColumn: 'auto' } },
  col: { display: 'flex', flexDirection: 'column', gap: '16px' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' },
  detail: { display: 'flex', alignItems: 'center', gap: '4px' },
});

type Form = Pick<Service,
  'work_order' | 'service_type' | 'client_id' | 'site_id' | 'specialty' | 'execution_date' | 'lead_tech_id' |
  'support_tech_ids' | 'site_contact' | 'cover_title' | 'description' | 'prev_details' | 'report_template_id'>;

const FIELDS: (keyof Form)[] = [
  'work_order', 'service_type', 'client_id', 'site_id', 'specialty', 'execution_date', 'lead_tech_id',
  'support_tech_ids', 'site_contact', 'cover_title', 'description', 'prev_details', 'report_template_id',
];
const LABELS: Record<keyof Form, string> = {
  work_order: 'Orden de trabajo', service_type: 'Tipo de servicio', client_id: 'Cliente', site_id: 'Tienda / Sede',
  specialty: 'Especialidad', execution_date: 'Fecha de ejecución', lead_tech_id: 'Técnico responsable',
  support_tech_ids: 'Técnicos de apoyo', site_contact: 'Contacto de tienda', cover_title: 'Título de portada',
  description: 'Memoria descriptiva', prev_details: 'Detalles previos', report_template_id: 'Plantilla',
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function StepDatos({ bundle, reload, readOnly, goTo, registerSave, withEquipment }: {
  bundle: ServiceBundle | null; reload: () => Promise<void>; readOnly: boolean; goTo: StepProps['goTo'];
  registerSave: (h: SaveHandler | null) => void; withEquipment: boolean;
}) {
  const s = useStyles();
  const cat = useCatalogs();
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const notify = useNotify();
  const svc = bundle?.service;

  const [form, setForm] = useState<Form>(() =>
    svc
      ? Object.fromEntries(FIELDS.map((k) => [k, svc[k]])) as Form
      : {
          work_order: '', service_type: optionNames(cat.serviceTypes)[0] ?? '', client_id: '', site_id: '',
          specialty: optionNames(cat.specialties)[0] ?? '',
          execution_date: today(), lead_tech_id: profile!.id, support_tech_ids: [], site_contact: '',
          cover_title: '', description: '', prev_details: DEFAULT_PREV_DETAILS, report_template_id: null,
        },
  );
  const [siteQuery, setSiteQuery] = useState(() => (form.site_id ? cat.siteName(form.site_id) : ''));
  // Sede elegida al instante: al cerrar la lista (que llega junto con la selección) `form` aún tiene el valor anterior
  const siteIdRef = useRef(form.site_id);
  siteIdRef.current = form.site_id;
  const [autoTitle, setAutoTitle] = useState(!svc?.cover_title);
  const [autoDesc, setAutoDesc] = useState(!svc?.description);
  const [nextCode, setNextCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ server: Service; fields: (keyof Form)[] } | null>(null);
  const [choice, setChoice] = useState<Record<string, 'mine' | 'cloud'>>({});

  const site = cat.allSites.find((x) => x.id === form.site_id);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  // El recorrido sigue la especialidad elegida (un servicio que ya tiene equipos se queda con ellos)
  const equipmentMode = cat.hasEquipment(form.specialty) || (!!bundle?.equipment.length && withEquipment);
  const nextStep = equipmentMode ? 'equipos' : 'trabajos';

  // Vista previa: el código real lo asigna el servidor al guardar (con el año de la fecha de ejecución)
  useEffect(() => {
    if (!svc) supabase.rpc('peek_service_code', { p_date: form.execution_date || null }).then(({ data }) => setNextCode(data ?? ''));
  }, [svc, form.execution_date]);

  // Textos automáticos mientras el usuario no los edite a mano
  useEffect(() => {
    if (autoTitle) set('cover_title', coverTitle(form.service_type, form.specialty, site, equipmentMode));
    if (autoDesc) set('description', memoria(form.service_type, form.specialty, site, equipmentMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.service_type, form.specialty, site, autoTitle, autoDesc, equipmentMode]);

  // Servicio nuevo: si los catálogos aún cargaban al abrir, toma la primera opción activa al llegar
  useEffect(() => {
    if (svc) return;
    if (!form.service_type && cat.serviceTypes.length) set('service_type', optionNames(cat.serviceTypes)[0] ?? '');
    if (!form.specialty && cat.specialties.length) set('specialty', optionNames(cat.specialties)[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat.serviceTypes, cat.specialties]);

  useEffect(() => {
    if (!svc && site?.contact_name && !form.site_contact) set('site_contact', site.contact_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site]);

  const templates = useMemo(
    () => cat.reportTemplates.filter((t) => t.status !== 'Inactiva'),
    [cat.reportTemplates],
  );
  useEffect(() => {
    // Espera a conocer el tipo de servicio: si no, cae en la primera plantilla por orden alfabético
    if (form.report_template_id || !templates.length || !form.service_type) return;
    const t = templates.find((x) => x.service_type === form.service_type && x.status === 'Activa') ?? templates.find((x) => x.status === 'Activa');
    if (t) set('report_template_id', t.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, form.service_type]);

  const validate = (f: Form) => {
    const missing = (['service_type', 'client_id', 'site_id', 'specialty', 'execution_date', 'lead_tech_id', 'report_template_id'] as const)
      .filter((k) => !f[k]).map((k) => LABELS[k]);
    if (missing.length) {
      setError(`Completa los campos obligatorios: ${missing.join(', ')}.`);
      return false;
    }
    setError(null);
    return true;
  };

  const payload = (f: Form) => ({ ...f, work_order: f.work_order || null, site_contact: f.site_contact || null });

  // Actualiza solo si nadie guardó antes (version); si hubo cambios ajenos, detecta conflicto por campo
  const update = async (base: Service, values: Form): Promise<boolean> => {
    const { data, error } = await supabase
      .from('services')
      .update(payload(values))
      .eq('id', base.id)
      .eq('version', base.version)
      .select('id');
    if (error) throw new Error(error.message);
    if (data.length) return true;
    const { data: server, error: e2 } = await supabase.from('services').select('*').eq('id', base.id).single();
    if (e2) throw new Error(e2.message);
    const mine = FIELDS.filter((k) => !same(values[k], base[k]));
    const theirs = FIELDS.filter((k) => !same(server[k], base[k]));
    const clash = mine.filter((k) => theirs.includes(k) && !same(values[k], server[k]));
    if (clash.length) {
      setChoice(Object.fromEntries(clash.map((k) => [k, 'mine'])));
      setConflict({ server, fields: clash });
      return false;
    }
    // Sin choque: combina mis cambios sobre la versión de la nube
    const merged = { ...(Object.fromEntries(FIELDS.map((k) => [k, server[k]])) as Form) };
    for (const k of mine) (merged as any)[k] = values[k];
    setForm(merged);
    return update(server, merged);
  };

  const latest = useRef({ form, svc });
  latest.current = { form, svc };

  // Solo un servicio ya creado: uno nuevo sin guardar se descarta al salir (no se crea solo)
  const dirty = () => {
    const { form: f, svc: current } = latest.current;
    return !readOnly && !!current && FIELDS.some((k) => !same(f[k], current[k]));
  };

  const save = async (): Promise<boolean> => {
    if (readOnly) return true;
    const { form: f, svc: current } = latest.current;
    if (!validate(f)) return false;
    try {
      if (!current) {
        const { data, error } = await supabase.from('services').insert(payload(f)).select('id, code').single();
        if (error) throw new Error(error.message);
        await logActivity(data.id, 'creó el servicio');
        await rememberConcepts('detalle', '', f.prev_details);
        // Con equipos: se precargan los del inventario de la sede (luego se quitan los que no se atendieron)
        let loaded = 0;
        if (cat.hasEquipment(f.specialty)) {
          try {
            const inv = await loadSiteInventory(f.site_id);
            await addInventoryToService(data.id, inv);
            loaded = inv.length;
            if (loaded) await logActivity(data.id, `cargó ${loaded} equipos del inventario de la sede`);
          } catch (e: any) {
            notify('No se pudieron cargar los equipos de la sede', 'warning', e.message);
          }
        }
        notify(`Servicio ${data.code} creado`, 'success', loaded ? `Se cargaron ${loaded} equipos de ${cat.siteName(f.site_id)}.` : undefined);
        navigate(`/servicios/${data.id}/editar?paso=${cat.hasEquipment(f.specialty) ? 'equipos' : 'trabajos'}`);
        return false; // la navegación ya cambia de pantalla
      }
      if (FIELDS.every((k) => same(f[k], current[k]))) return true;
      const ok = await update(current, f);
      if (ok) {
        // Conceptos e historial por detrás; la recarga la hace el asistente (al cambiar de paso o con "Guardar borrador")
        if (!same(f.prev_details, current.prev_details)) void rememberConcepts('detalle', '', f.prev_details).catch(() => {});
        const changed = FIELDS.filter((k) => !same(f[k], current[k])).map((k) => `“${LABELS[k]}”`);
        void logActivity(current.id, `editó ${changed.slice(0, 2).join(', ')}${changed.length > 2 ? '…' : ''}`).catch(() => {});
        notify('Cambios guardados');
      }
      return ok;
    } catch (e: any) {
      setError(friendlyError(e));
      return false;
    }
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

  const resolveConflict = async () => {
    if (!conflict) return;
    const merged = { ...form };
    // Lo que yo no toqué se toma de la nube; en los campos en conflicto manda la elección
    for (const k of FIELDS) if (svc && same(form[k], svc[k])) (merged as any)[k] = conflict.server[k];
    for (const k of conflict.fields) if (choice[k] === 'cloud') (merged as any)[k] = conflict.server[k];
    setConflict(null);
    setForm(merged);
    try {
      if (await update(conflict.server, merged)) {
        await logActivity(conflict.server.id, 'resolvió un conflicto de edición');
        notify('Cambios guardados');
        await reload();
      }
    } catch (e: any) {
      setError(friendlyError(e));
    }
  };

  const show = (k: keyof Form, v: any) => {
    if (k === 'client_id') return cat.clientName(v);
    if (k === 'site_id') return cat.siteName(v);
    if (k === 'lead_tech_id') return cat.userName(v);
    if (Array.isArray(v)) return v.join(', ');
    return String(v ?? '—');
  };

  const techs = cat.users.filter((u) => u.active);
  const sites = cat.sites.filter((x) => x.client_id === form.client_id);
  // Hay clientes con cientos de sedes: se busca por nombre, código, distrito o dirección
  // Si el texto es el de la sede ya elegida se muestran todas (con la elegida primero) para poder cambiarla sin borrar
  const showingCurrent = !!form.site_id && siteQuery === cat.siteName(form.site_id);
  const siteMatches = useMemo(() => {
    if (showingCurrent) {
      const current = sites.find((x) => x.id === form.site_id);
      return [...(current ? [current] : []), ...sites.filter((x) => x.id !== form.site_id)].slice(0, 50);
    }
    const words = fold(siteQuery).split(' ').filter(Boolean);
    return sites.filter((x) => words.every((w) => fold(`${x.name} ${x.code ?? ''} ${x.district ?? ''} ${x.province ?? ''} ${x.address ?? ''}`).includes(w))).slice(0, 50);
  }, [sites, siteQuery, showingCurrent, form.site_id]);

  return (
    <>
      <ErrorBar error={error} />
      <div className={s.grid}>
        <Section title="Portada y sección 1 · Memoria descriptiva">
          <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className={s.form}>
              <Field label="Código de servicio">
                <Input readOnly value={svc?.code ?? `${nextCode} (automático)`} />
              </Field>
              <Field label="Orden de trabajo / OC">
                <Input value={form.work_order ?? ''} onChange={(_, d) => set('work_order', d.value)} placeholder="OT-00000" />
              </Field>
              <Field label="Tipo de servicio" required>
                <Dropdown placeholder="Selecciona" value={form.service_type} selectedOptions={[form.service_type]} onOptionSelect={(_, d) => set('service_type', d.optionValue!)}>
                  {optionNames(cat.serviceTypes, svc?.service_type).map((t) => <Option key={t}>{t}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Cliente" required>
                <Dropdown placeholder="Selecciona" value={form.client_id ? cat.clientName(form.client_id) : ''} selectedOptions={[form.client_id]}
                  onOptionSelect={(_, d) => { setForm((f) => ({ ...f, client_id: d.optionValue!, site_id: '' })); setSiteQuery(''); }}>
                  {cat.clients.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Tienda / Sede" required>
                <Combobox placeholder={form.client_id ? `Busca entre ${sites.length} sedes` : 'Elige un cliente'} disabled={!form.client_id}
                  value={siteQuery} selectedOptions={[form.site_id]}
                  // Con una sede elegida, entrar al campo selecciona su nombre: lo que se escriba lo reemplaza
                  // (también en el clic: el mouseup del navegador deshace la selección hecha en el foco)
                  input={{
                    onFocus: (e) => showingCurrent && e.target.select(),
                    onClick: (e) => showingCurrent && e.currentTarget.select(),
                  }}
                  onChange={(e) => setSiteQuery(e.target.value)}
                  onOpenChange={(_, d) => { if (!d.open) setSiteQuery(siteIdRef.current ? cat.siteName(siteIdRef.current) : ''); }}
                  onOptionSelect={(_, d) => {
                    if (!d.optionValue) return;
                    siteIdRef.current = d.optionValue;
                    set('site_id', d.optionValue);
                    setSiteQuery(cat.siteName(d.optionValue));
                  }}>
                  {siteMatches.map((x) => (
                    <Option key={x.id} value={x.id} text={x.name}>
                      {x.name}{(x.district || x.province) && <Caption1 style={{ marginLeft: 6, color: tokens.colorNeutralForeground3 }}>{x.district ?? x.province}</Caption1>}
                    </Option>
                  ))}
                  {!siteMatches.length && <Option disabled value="" text="">Sin coincidencias</Option>}
                </Combobox>
              </Field>
              <Field label="Especialidad" required>
                <Dropdown placeholder="Selecciona" value={form.specialty} selectedOptions={[form.specialty]} onOptionSelect={(_, d) => set('specialty', d.optionValue!)}>
                  {optionNames(cat.specialties, svc?.specialty).map((t) => <Option key={t}>{t}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Fecha de ejecución" required>
                <DateInput value={form.execution_date} onChange={(v) => set('execution_date', v)} disabled={readOnly} />
              </Field>
              <Field label="Técnico responsable" required>
                <Dropdown value={form.lead_tech_id ? cat.userName(form.lead_tech_id) : ''} selectedOptions={[form.lead_tech_id ?? '']}
                  onOptionSelect={(_, d) => set('lead_tech_id', d.optionValue!)}>
                  {techs.map((u) => <Option key={u.id} value={u.id}>{u.full_name}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Técnicos de apoyo">
                <Dropdown multiselect placeholder="Ninguno"
                  value={form.support_tech_ids.map((id) => cat.userName(id)).join(', ')}
                  selectedOptions={form.support_tech_ids}
                  onOptionSelect={(_, d) => set('support_tech_ids', d.selectedOptions)}>
                  {techs.filter((u) => u.id !== form.lead_tech_id).map((u) => <Option key={u.id} value={u.id}>{u.full_name}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Dirección (de la sede)" className={s.span2}>
                <Input readOnly value={siteAddress(site)} placeholder="Se completa al elegir la sede" />
              </Field>
              <Field label="Contacto de tienda">
                <Input value={form.site_contact ?? ''} onChange={(_, d) => set('site_contact', d.value)} />
              </Field>
              <Field
                className={s.span3}
                label={
                  <span className={s.detail}>
                    Título de portada {autoTitle ? '(automático)' : '(editado)'}
                    {!autoTitle && (
                      <Tooltip content="Restaurar título automático" relationship="label">
                        <Button size="small" appearance="subtle" icon={<ArrowClockwise16Regular />} onClick={() => setAutoTitle(true)} />
                      </Tooltip>
                    )}
                  </span>
                }
              >
                <Input value={form.cover_title ?? ''} onChange={(_, d) => { setAutoTitle(false); set('cover_title', d.value); }} />
              </Field>
              <Field
                className={s.span3}
                label={
                  <span className={s.detail}>
                    Memoria descriptiva {autoDesc ? '(generada · editable)' : '(editada)'}
                    {!autoDesc && (
                      <Tooltip content="Regenerar memoria descriptiva" relationship="label">
                        <Button size="small" appearance="subtle" icon={<ArrowClockwise16Regular />} onClick={() => setAutoDesc(true)} />
                      </Tooltip>
                    )}
                    {!readOnly && (
                      <ImproveButton size="small" texts={[form.description ?? '']} kind="memoria" specialty={form.specialty}
                        onApply={([t]) => { setAutoDesc(false); set('description', t); }} />
                    )}
                  </span>
                }
              >
                <Textarea rows={3} resize="vertical" value={form.description ?? ''} onChange={(_, d) => { setAutoDesc(false); set('description', d.value); }} />
              </Field>
            </div>
          </fieldset>
        </Section>

        <div className={s.col}>
          <Section title="Detalles previos" subtitle="Sección 2">
            <ConceptList kind="detalle" specialty="" items={form.prev_details} readOnly={readOnly}
              onChange={(v) => set('prev_details', v)} placeholder="Nuevo detalle…" />
          </Section>
          {equipmentMode && (
            <Section title="Resumen de equipos" subtitle="automático">
              <Text block>
                {bundle?.equipment.length
                  ? `• ${equipmentSummary(form.service_type, bundle.equipment, cat.typeName)}`
                  : svc ? 'Aún no hay equipos.' : 'Al crear el servicio se cargan los equipos registrados de la sede.'}
              </Text>
              <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>Se completa con los equipos del Paso 2.</Caption1>
            </Section>
          )}
          <Section title="Formato del informe">
            <Field label="Plantilla" required>
              <Dropdown disabled={readOnly} placeholder="Selecciona"
                value={templates.find((t) => t.id === form.report_template_id) ? `${templates.find((t) => t.id === form.report_template_id)!.code} · ${templates.find((t) => t.id === form.report_template_id)!.name}` : ''}
                selectedOptions={[form.report_template_id ?? '']} onOptionSelect={(_, d) => set('report_template_id', d.optionValue!)}>
                {templates.map((t) => <Option key={t.id} value={t.id} text={`${t.code} · ${t.name}`}>{t.code} · {t.name} v{String(t.version).padStart(2, '0')}</Option>)}
              </Dropdown>
            </Field>
            {svc && (
              <Caption1 block style={{ marginTop: 8, color: tokens.colorNeutralForeground3 }}>
                Creado por {cat.userName(svc.created_by)} · {fmtDateTime(svc.created_at)}
              </Caption1>
            )}
          </Section>
        </div>
      </div>
      <div className={s.footer}>
        <span />
        <AsyncButton appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after"
          onClick={async () => {
            if (readOnly) return goTo(nextStep);
            if (!svc) return save();
            // goTo guarda con el mismo handler y recarga antes de cambiar de paso
            return goTo(nextStep);
          }}>
          {svc ? `Siguiente: ${equipmentMode ? 'Equipos' : 'Trabajos realizados'}` : 'Crear y continuar'}
        </AsyncButton>
      </div>

      <Dialog open={!!conflict} modalType="alert">
        <DialogSurface style={{ maxWidth: 640 }}>
          <DialogBody>
            <DialogTitle>Este servicio fue modificado por otro usuario</DialogTitle>
            <DialogContent>
              <Text block style={{ marginBottom: 12 }}>
                {cat.userName(conflict?.server.updated_by)} guardó cambios a las{' '}
                {conflict && new Date(conflict.server.updated_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} mientras
                editabas. Elige qué versión conservar de cada campo en conflicto:
              </Text>
              {conflict?.fields.map((k) => (
                <Field key={k} label={LABELS[k]} style={{ marginBottom: 12 }}>
                  <RadioGroup value={choice[k]} onChange={(_, d) => setChoice((c) => ({ ...c, [k]: d.value as any }))}>
                    <Radio value="mine" label={`Tu versión: ${show(k, form[k])}`} />
                    <Radio value="cloud" label={`Versión en la nube (${cat.userName(conflict.server.updated_by)}): ${show(k, conflict.server[k])}`} />
                  </RadioGroup>
                </Field>
              ))}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConflict(null)}>Seguir editando</Button>
              <Button appearance="primary" onClick={resolveConflict}>Conservar seleccionada</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
