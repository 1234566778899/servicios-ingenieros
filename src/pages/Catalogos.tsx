import { useEffect, useMemo, useState } from 'react';
import {
  Button, Caption1, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field,
  Input, Link, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, MessageBar, MessageBarBody, Option, Radio,
  RadioGroup, Spinner, Switch, Tab, TabList, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text,
  Textarea, makeStyles, tokens,
} from '@fluentui/react-components';
import {
  Add20Regular, ArrowDown16Regular, ArrowDown20Regular, ArrowUp16Regular, ArrowUp20Regular, Copy20Regular, Delete16Regular,
  Delete20Regular, Edit20Regular, History20Regular, MoreHorizontal20Regular, Search20Regular,
} from '@fluentui/react-icons';
import { PageHeader, Section, StatusBadge, ErrorBar } from '../components/common';
import { EquipmentRail } from '../components/EquipmentRail';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../lib/auth';
import { useCatalogs } from '../lib/catalogs';
import { supabase, must } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { fmtDateTime } from '../lib/format';
import { useMediaQuery } from '../lib/media';
import { useNotify } from '../lib/toast';
import type { CatalogFinding, CatalogOption, ChecklistTemplate, Priority, Site, TemplateItem } from '../lib/types';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px', alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', gap: '12px' },
  form: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', '@media (max-width: 600px)': { gridTemplateColumns: '1fr' } },
  span2: { gridColumn: 'span 2', '@media (max-width: 600px)': { gridColumn: 'auto' } },
  filters: { display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '12px', flexWrap: 'wrap' },
  // Columnas secundarias que se ocultan en celular (y su reemplazo compacto)
  wideOnly: { '@media (max-width: 600px)': { display: 'none' } },
  narrowOnly: { display: 'none', '@media (max-width: 600px)': { display: 'block' } },
  pair: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
});

const TABS = [
  ['checklist', 'Checklist por tipo de equipo'],
  ['hallazgos', 'Catálogo de hallazgos'],
  ['clientes', 'Clientes y sedes'],
  ['opciones', 'Tipos de servicio y especialidades'],
] as const;

export function Catalogos() {
  const s = useStyles();
  const { can } = useAuth();
  const [tab, setTab] = useState('checklist');
  const admin = can('catalogos.admin');
  // Las cuatro pestañas no caben en celular: se cambian por un desplegable
  const narrow = useMediaQuery('(max-width: 700px)');
  return (
    <>
      <PageHeader crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Catálogos' }]} title="Catálogos y plantillas" />
      {narrow ? (
        <Field label="Sección" style={{ marginBottom: 12 }}>
          <Dropdown value={TABS.find(([k]) => k === tab)![1]} selectedOptions={[tab]} onOptionSelect={(_, d) => setTab(d.optionValue!)}>
            {TABS.map(([k, label]) => <Option key={k} value={k}>{label}</Option>)}
          </Dropdown>
        </Field>
      ) : (
        <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as string)} style={{ marginBottom: 12 }}>
          {TABS.map(([k, label]) => <Tab key={k} value={k}>{label}</Tab>)}
        </TabList>
      )}
      {!admin && (
        <MessageBar style={{ marginBottom: 12 }}><MessageBarBody>Solo lectura: administrar catálogos requiere el permiso “Catálogos y plantillas de checklist”.</MessageBarBody></MessageBar>
      )}
      {tab === 'checklist' && <ChecklistTemplates admin={admin} />}
      {tab === 'hallazgos' && <FindingsCatalog admin={admin} />}
      {tab === 'clientes' && <ClientsSites admin={admin} />}
      {tab === 'opciones' && (
        <div className={s.pair}>
          <OptionsCatalog admin={admin} table="service_types" column="service_type" title="Tipos de servicio" singular="tipo de servicio" female={false} placeholder="Ej.: Mantenimiento predictivo" />
          <OptionsCatalog admin={admin} table="specialties" column="specialty" title="Especialidades" singular="especialidad" female placeholder="Ej.: Agua helada" />
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Checklist por tipo de equipo ───────────────────────── */

type ItemDraft = Omit<TemplateItem, 'id' | 'template_id'> & { id?: string };

function ChecklistTemplates({ admin }: { admin: boolean }) {
  const s = useStyles();
  const cat = useCatalogs();
  const notify = useNotify();
  const [typeId, setTypeId] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [newType, setNewType] = useState<{ name: string; unit: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewVersion, setViewVersion] = useState<string | null>(null);

  useEffect(() => { if (!typeId && cat.equipmentTypes[0]) setTypeId(cat.equipmentTypes[0].id); }, [cat.equipmentTypes, typeId]);

  const { data, reload } = useAsync(async () => {
    const tpls = must(await supabase.from('checklist_templates').select('*, checklist_template_items(count)').order('version', { ascending: false })) as (ChecklistTemplate & { checklist_template_items: { count: number }[] })[];
    return tpls;
  }, []);

  const versions = (data ?? []).filter((t) => t.equipment_type_id === typeId);
  const current = versions.find((t) => t.is_current) ?? versions[0];
  const shown = versions.find((t) => t.id === viewVersion) ?? current;

  const { data: loaded, loading: itemsLoading } = useAsync(async () => {
    if (!shown) return { items: [] as TemplateItem[], uses: 0 };
    const [its, uses] = await Promise.all([
      supabase.from('checklist_template_items').select('*').eq('template_id', shown.id).order('position'),
      supabase.from('service_equipment').select('id', { count: 'exact', head: true }).eq('checklist_template_id', shown.id),
    ]);
    return { items: must(its) as TemplateItem[], uses: uses.count ?? 0 };
  }, [shown?.id]);

  useEffect(() => { setItems(loaded?.items.map(({ template_id: _t, ...i }) => i) ?? []); }, [loaded]);

  const original = JSON.stringify(loaded?.items.map(({ template_id: _t, id: _i, ...i }) => i) ?? []);
  const dirty = JSON.stringify(items.map(({ id: _i, ...i }) => i)) !== original;
  const editable = admin && shown?.id === current?.id || (admin && !shown);

  const set = (i: number, patch: Partial<ItemDraft>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setItems((xs) => { const n = [...xs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n.map((x, k) => ({ ...x, position: k + 1 })); });

  /** Guardar crea una versión nueva: los servicios ya registrados conservan la suya. */
  const saveVersion = async () => {
    if (items.some((i) => !i.category.trim() || !i.activity.trim())) return notify('Completa categoría y actividad en todas las filas', 'warning');
    setSaving(true);
    try {
      const version = Math.max(0, ...versions.map((v) => v.version)) + 1;
      const tpl = must(await supabase.from('checklist_templates').insert({ equipment_type_id: typeId, version, is_current: true }).select('id').single()) as { id: string };
      if (items.length) {
        must(await supabase.from('checklist_template_items').insert(items.map((i, k) => ({
          template_id: tpl.id, position: k + 1, category: i.category.trim(), activity: i.activity.trim(),
          response_type: i.response_type, value_unit: i.response_type === 'cn_value' ? i.value_unit || null : null, required: i.required,
        }))));
      }
      must(await supabase.from('checklist_templates').update({ is_current: false }).eq('equipment_type_id', typeId).neq('id', tpl.id));
      notify(`Versión ${version} guardada`);
      setViewVersion(null);
      await reload();
    } catch (e: any) {
      notify('No se pudo guardar', 'error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const createType = async () => {
    if (!newType?.name.trim()) return;
    const { data: t, error } = await supabase.from('equipment_types').insert({ name: newType.name.trim(), default_unit: newType.unit || null }).select('id').single();
    if (error) return notify('No se pudo crear', 'error', error.message);
    setNewType(null);
    await cat.reload();
    setTypeId(t.id);
  };

  const types = cat.equipmentTypes.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const typeRail = types.map((t) => ({ id: t.id, code: t.name, equipment_type_id: t.id } as any));

  return (
    <div className={s.grid}>
      <Section title="Tipos de equipo" subtitle={String(cat.equipmentTypes.length)}
        actions={admin && <Button size="small" icon={<Add20Regular />} aria-label="Nuevo tipo de equipo" onClick={() => setNewType({ name: '', unit: '' })} />}>
        <Input size="small" contentBefore={<Search20Regular />} placeholder="Buscar tipo de equipo…" value={q} onChange={(_, d) => setQ(d.value)} style={{ width: '100%', marginBottom: 8 }} />
        {cat.loading ? <Spinner size="small" style={{ padding: 16 }} /> : (
          <EquipmentRail equipment={typeRail} selected={typeId} onSelect={(id) => { setTypeId(id); setViewVersion(null); }} sub={() => null}
            right={(e) => {
              const v = (data ?? []).find((t) => t.equipment_type_id === e.id && t.is_current);
              return <Caption1>{v ? `${v.checklist_template_items[0]?.count ?? 0} act. · v${v.version}` : 'Sin plantilla'}</Caption1>;
            }} />
        )}
      </Section>

      <Section>
        <div className={s.head}>
          <div>
            <Text size={500} weight="semibold" block>{cat.typeName(typeId)}</Text>
            <Caption1>
              {shown ? `Versión ${shown.version}${shown.is_current ? ' (vigente)' : ''} · usada en ${loaded?.uses ?? 0} equipos de servicios · ${fmtDateTime(shown.created_at)}` : 'Sin plantilla: agrega actividades y guarda la versión 1.'}
            </Caption1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {versions.length > 0 && (
              <Menu>
                <MenuTrigger><Button icon={<History20Regular />}>Historial de versiones</Button></MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {versions.map((v) => (
                      <MenuItem key={v.id} onClick={() => setViewVersion(v.id)}>
                        Versión {v.version}{v.is_current ? ' · vigente' : ''} · {v.checklist_template_items[0]?.count ?? 0} actividades
                      </MenuItem>
                    ))}
                  </MenuList>
                </MenuPopover>
              </Menu>
            )}
            {admin && shown && !shown.is_current && (
              <Button icon={<Copy20Regular />} onClick={() => setViewVersion(current?.id ?? null)}>Volver a la vigente</Button>
            )}
            {editable && (
              <>
                <Button icon={<Add20Regular />} onClick={() => setItems((xs) => [...xs, { category: xs.at(-1)?.category ?? 'General', activity: '', response_type: 'cn', value_unit: null, required: true, position: xs.length + 1 }])}>
                  Agregar actividad
                </Button>
              </>
            )}
          </div>
        </div>
        {shown && !shown.is_current && (
          <MessageBar intent="info" style={{ marginBottom: 12 }}><MessageBarBody>Estás viendo una versión anterior (solo lectura).</MessageBarBody></MessageBar>
        )}
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell style={{ width: 70 }}>Orden</TableHeaderCell>
              <TableHeaderCell style={{ width: 44 }}>N.º</TableHeaderCell>
              <TableHeaderCell style={{ width: 170 }}>Categoría</TableHeaderCell>
              <TableHeaderCell>Actividad</TableHeaderCell>
              <TableHeaderCell style={{ width: 210 }}>Tipo de respuesta</TableHeaderCell>
              <TableHeaderCell style={{ width: 90 }}>Unidad</TableHeaderCell>
              <TableHeaderCell style={{ width: 100 }}>Obligatoria</TableHeaderCell>
              <TableHeaderCell style={{ width: 44 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!itemsLoading && items.map((it, i) => (
              <TableRow key={it.id ?? `new-${i}`}>
                <TableCell>
                  <Button size="small" appearance="subtle" icon={<ArrowUp16Regular />} aria-label="Subir" disabled={!editable || i === 0} onClick={() => move(i, -1)} />
                  <Button size="small" appearance="subtle" icon={<ArrowDown16Regular />} aria-label="Bajar" disabled={!editable || i === items.length - 1} onClick={() => move(i, 1)} />
                </TableCell>
                <TableCell>{i + 1}</TableCell>
                <TableCell><Input size="small" value={it.category} readOnly={!editable} onChange={(_, d) => set(i, { category: d.value })} style={{ width: '100%' }} /></TableCell>
                <TableCell><Input size="small" value={it.activity} readOnly={!editable} onChange={(_, d) => set(i, { activity: d.value })} style={{ width: '100%' }} /></TableCell>
                <TableCell>
                  <Dropdown size="small" disabled={!editable} style={{ minWidth: 0, width: '100%' }}
                    value={it.response_type === 'cn' ? 'Conforme / No conforme' : 'Resultado + valor'} selectedOptions={[it.response_type]}
                    onOptionSelect={(_, d) => set(i, { response_type: d.optionValue as any })}>
                    <Option value="cn">Conforme / No conforme</Option>
                    <Option value="cn_value">Resultado + valor</Option>
                  </Dropdown>
                </TableCell>
                <TableCell>
                  <Input size="small" disabled={!editable || it.response_type !== 'cn_value'} value={it.value_unit ?? ''} placeholder="°C, V…" onChange={(_, d) => set(i, { value_unit: d.value })} style={{ width: '100%' }} />
                </TableCell>
                <TableCell><Switch checked={it.required} disabled={!editable} onChange={(_, d) => set(i, { required: d.checked })} aria-label="Obligatoria" /></TableCell>
                <TableCell>
                  {editable && <Button size="small" appearance="subtle" icon={<Delete16Regular />} aria-label="Quitar" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(!data || itemsLoading) && <Spinner style={{ padding: 24 }} />}
        {editable && (
          <div className={s.footer}>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              Al guardar cambios se crea una nueva versión. Los servicios ya registrados conservan la versión con la que se hicieron.
            </Caption1>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button disabled={!dirty || saving} onClick={() => setItems(loaded?.items.map(({ template_id: _t, ...i }) => i) ?? [])}>Descartar</Button>
              <Button appearance="primary" disabled={!dirty || saving || !items.length} onClick={saveVersion}>
                Guardar como versión {Math.max(0, ...versions.map((v) => v.version)) + 1}
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Dialog open={!!newType} onOpenChange={(_, d) => !d.open && setNewType(null)}>
        <DialogSurface style={{ maxWidth: 420 }}>
          <DialogBody>
            <DialogTitle>Nuevo tipo de equipo</DialogTitle>
            <DialogContent>
              <Field label="Nombre" required><Input value={newType?.name ?? ''} onChange={(_, d) => setNewType({ ...newType!, name: d.value })} placeholder="Ej.: Extractor de aire" /></Field>
              <Field label="Unidad de capacidad por defecto" style={{ marginTop: 12 }}>
                <Input value={newType?.unit ?? ''} onChange={(_, d) => setNewType({ ...newType!, unit: d.value })} placeholder="BTU, TR, cm…" />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setNewType(null)}>Cancelar</Button>
              <Button appearance="primary" disabled={!newType?.name.trim()} onClick={createType}>Crear</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

/* ───────────────────────── Catálogo de hallazgos ───────────────────────── */

function FindingsCatalog({ admin }: { admin: boolean }) {
  const s = useStyles();
  const cat = useCatalogs();
  const notify = useNotify();
  const [q, setQ] = useState('');
  const [prio, setPrio] = useState('');
  const [type, setType] = useState('');
  const [draft, setDraft] = useState<Partial<CatalogFinding> | null>(null);
  const [toDelete, setToDelete] = useState<CatalogFinding | null>(null);

  const { data, error, loading, reload } = useAsync(async () => {
    const [list, uses] = await Promise.all([
      supabase.from('findings_catalog').select('*').order('code'),
      supabase.from('findings').select('catalog_id'),
    ]);
    const count = new Map<string, number>();
    for (const u of uses.data ?? []) if (u.catalog_id) count.set(u.catalog_id, (count.get(u.catalog_id) ?? 0) + 1);
    return { list: must(list) as CatalogFinding[], count };
  }, []);

  const rows = useMemo(() => (data?.list ?? []).filter((f) =>
    (!prio || f.priority === prio) && (!type || f.equipment_type_id === type) &&
    (!q || `${f.code} ${f.finding} ${f.probable_cause} ${f.category}`.toLowerCase().includes(q.toLowerCase()))), [data, q, prio, type]);

  const save = async () => {
    if (!draft?.finding || !draft.code) return notify('Completa código y hallazgo', 'warning');
    const { id, ...row } = draft as CatalogFinding;
    const res = id ? await supabase.from('findings_catalog').update(row).eq('id', id) : await supabase.from('findings_catalog').insert(row);
    if (res.error) return notify('No se pudo guardar', 'error', res.error.message);
    notify('Hallazgo guardado');
    setDraft(null);
    reload();
  };

  const nextCode = () => `H-${String(Math.max(0, ...(data?.list ?? []).map((f) => Number(f.code.replace(/\D/g, '')) || 0)) + 1).padStart(3, '0')}`;

  return (
    <Section title="Catálogo de hallazgos y recomendaciones"
      actions={admin && <Button appearance="primary" icon={<Add20Regular />} onClick={() => setDraft({ code: nextCode(), priority: 'Media' })}>Nuevo hallazgo</Button>}>
      <ErrorBar error={error} />
      <div className={s.filters}>
        <Field label="Buscar"><Input contentBefore={<Search20Regular />} placeholder="Hallazgo o causa…" value={q} onChange={(_, d) => setQ(d.value)} style={{ width: 240 }} /></Field>
        <Field label="Tipo de equipo">
          <Dropdown value={type ? cat.typeName(type) : 'Todos'} selectedOptions={[type]} onOptionSelect={(_, d) => setType(d.optionValue ?? '')}>
            <Option value="">Todos</Option>
            {cat.equipmentTypes.map((t) => <Option key={t.id} value={t.id}>{t.name}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Prioridad sugerida">
          <Dropdown value={prio || 'Todas'} selectedOptions={[prio]} onOptionSelect={(_, d) => setPrio(d.optionValue ?? '')}>
            <Option value="">Todas</Option>
            {['Alta', 'Media', 'Baja'].map((p) => <Option key={p}>{p}</Option>)}
          </Dropdown>
        </Field>
      </div>
      <Table size="small">
        <TableHeader>
          <TableRow>
            <TableHeaderCell style={{ width: 70 }}>Código</TableHeaderCell>
            <TableHeaderCell>Hallazgo</TableHeaderCell>
            <TableHeaderCell>Categoría</TableHeaderCell>
            <TableHeaderCell>Causa probable</TableHeaderCell>
            <TableHeaderCell>Acción sugerida</TableHeaderCell>
            <TableHeaderCell>Recomendación</TableHeaderCell>
            <TableHeaderCell style={{ width: 90 }}>Prioridad</TableHeaderCell>
            <TableHeaderCell style={{ width: 60 }}>Usos</TableHeaderCell>
            {admin && <TableHeaderCell style={{ width: 110 }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((f) => (
            <TableRow key={f.id}>
              <TableCell>{f.code}</TableCell>
              <TableCell><Text weight="semibold">{f.finding}</Text></TableCell>
              <TableCell>{f.category}</TableCell>
              <TableCell><Caption1>{f.probable_cause}</Caption1></TableCell>
              <TableCell><Caption1>{f.suggested_action}</Caption1></TableCell>
              <TableCell><Caption1>{f.recommendation}</Caption1></TableCell>
              <TableCell><StatusBadge status={f.priority} /></TableCell>
              <TableCell>{data?.count.get(f.id) ?? 0}</TableCell>
              {admin && (
                <TableCell>
                  <Link onClick={() => setDraft(f)}>Editar</Link>
                  {!data?.count.get(f.id) && <> · <Link onClick={() => setToDelete(f)}>Quitar</Link></>}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {loading && !data && <Spinner style={{ padding: 24 }} />}
      <Caption1 block style={{ marginTop: 12, color: tokens.colorNeutralForeground3 }}>
        Estos textos alimentan automáticamente las secciones 6 (Hallazgos) y 7 (Conclusiones y recomendaciones) del informe.
      </Caption1>

      <Dialog open={!!draft} onOpenChange={(_, d) => !d.open && setDraft(null)}>
        <DialogSurface style={{ maxWidth: 640 }}>
          <DialogBody>
            <DialogTitle>{draft?.id ? `Editar ${draft.code}` : 'Nuevo hallazgo'}</DialogTitle>
            {draft && (
              <DialogContent>
                <div className={s.form}>
                  <Field label="Código" required><Input value={draft.code ?? ''} onChange={(_, d) => setDraft({ ...draft, code: d.value })} /></Field>
                  <Field label="Categoría"><Input value={draft.category ?? ''} onChange={(_, d) => setDraft({ ...draft, category: d.value })} placeholder="Eléctrico, Drenaje…" /></Field>
                  <Field label="Hallazgo" required className={s.span2}><Input value={draft.finding ?? ''} onChange={(_, d) => setDraft({ ...draft, finding: d.value })} /></Field>
                  <Field label="Tipo de equipo (opcional)">
                    <Dropdown value={draft.equipment_type_id ? cat.typeName(draft.equipment_type_id) : 'Todos'} selectedOptions={[draft.equipment_type_id ?? '']}
                      onOptionSelect={(_, d) => setDraft({ ...draft, equipment_type_id: d.optionValue || null })}>
                      <Option value="">Todos</Option>
                      {cat.equipmentTypes.map((t) => <Option key={t.id} value={t.id}>{t.name}</Option>)}
                    </Dropdown>
                  </Field>
                  <Field label="Prioridad sugerida">
                    <RadioGroup layout="horizontal" value={draft.priority} onChange={(_, d) => setDraft({ ...draft, priority: d.value as Priority })}>
                      {['Alta', 'Media', 'Baja'].map((p) => <Radio key={p} value={p} label={p} />)}
                    </RadioGroup>
                  </Field>
                  <Field label="Causa probable" className={s.span2}><Textarea value={draft.probable_cause ?? ''} onChange={(_, d) => setDraft({ ...draft, probable_cause: d.value })} /></Field>
                  <Field label="Acción sugerida" className={s.span2}><Textarea value={draft.suggested_action ?? ''} onChange={(_, d) => setDraft({ ...draft, suggested_action: d.value })} /></Field>
                  <Field label="Recomendación" className={s.span2}><Textarea value={draft.recommendation ?? ''} onChange={(_, d) => setDraft({ ...draft, recommendation: d.value })} /></Field>
                </div>
              </DialogContent>
            )}
            <DialogActions>
              <Button onClick={() => setDraft(null)}>Cancelar</Button>
              <Button appearance="primary" onClick={save}>Guardar</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <ConfirmDialog open={!!toDelete} title={`¿Quitar ${toDelete?.code}?`} body={`Se eliminará “${toDelete?.finding}” del catálogo.`} danger confirmLabel="Quitar"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const { error } = await supabase.from('findings_catalog').delete().eq('id', toDelete!.id);
          if (error) notify('No se pudo quitar', 'error', error.message);
          setToDelete(null);
          reload();
        }} />
    </Section>
  );
}

/* ───────────────────────── Clientes y sedes ───────────────────────── */

function ClientsSites({ admin }: { admin: boolean }) {
  const s = useStyles();
  const cat = useCatalogs();
  const notify = useNotify();
  const [clientId, setClientId] = useState('');
  const [newClient, setNewClient] = useState<string | null>(null);
  const [site, setSite] = useState<Partial<Site> | null>(null);

  useEffect(() => { if (!clientId && cat.clients[0]) setClientId(cat.clients[0].id); }, [cat.clients, clientId]);

  const createClient = async () => {
    const { data, error } = await supabase.from('clients').insert({ name: newClient!.trim() }).select('id').single();
    if (error) return notify('No se pudo crear', 'error', error.message);
    setNewClient(null);
    await cat.reload();
    setClientId(data.id);
  };

  const saveSite = async () => {
    if (!site?.name) return notify('Escribe el nombre de la sede', 'warning');
    const { id, ...row } = site;
    const payload = { ...row, client_id: clientId, equipment_prefix: row.equipment_prefix?.toUpperCase() || null };
    const res = id ? await supabase.from('sites').update(payload).eq('id', id) : await supabase.from('sites').insert(payload);
    if (res.error) return notify('No se pudo guardar', 'error', res.error.message);
    notify('Sede guardada');
    setSite(null);
    cat.reload();
  };

  const clientRail = cat.clients.map((c) => ({ id: c.id, code: c.name, equipment_type_id: null } as any));

  return (
    <div className={s.grid}>
      <Section title="Clientes" actions={admin && <Button size="small" icon={<Add20Regular />} aria-label="Nuevo cliente" onClick={() => setNewClient('')} />}>
        {cat.loading ? <Spinner size="small" style={{ padding: 16 }} /> : (
          <EquipmentRail equipment={clientRail} selected={clientId} onSelect={setClientId} sub={() => null}
            right={(c) => <Caption1>{cat.sites.filter((x) => x.client_id === c.id).length} sedes</Caption1>} />
        )}
      </Section>
      <Section title={`Sedes de ${cat.clientName(clientId)}`}
        actions={admin && clientId && <Button appearance="primary" icon={<Add20Regular />} onClick={() => setSite({})}>Nueva sede</Button>}>
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Sede</TableHeaderCell>
              <TableHeaderCell>Nombre corto</TableHeaderCell>
              <TableHeaderCell>Dirección</TableHeaderCell>
              <TableHeaderCell>Prefijo de equipos</TableHeaderCell>
              <TableHeaderCell>Contacto</TableHeaderCell>
              {admin && <TableHeaderCell style={{ width: 70 }} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cat.sites.filter((x) => x.client_id === clientId).map((x) => (
              <TableRow key={x.id}>
                <TableCell><Text weight="semibold">{x.name}</Text></TableCell>
                <TableCell>{x.short_name ?? '—'}</TableCell>
                <TableCell><Caption1>{x.address ?? '—'}</Caption1></TableCell>
                <TableCell>{x.equipment_prefix ?? '—'}</TableCell>
                <TableCell>{x.contact_name ?? '—'}</TableCell>
                {admin && <TableCell><Link onClick={() => setSite(x)}>Editar</Link></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {cat.loading && <Spinner style={{ padding: 24 }} />}
      </Section>

      <Dialog open={newClient !== null} onOpenChange={(_, d) => !d.open && setNewClient(null)}>
        <DialogSurface style={{ maxWidth: 420 }}>
          <DialogBody>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogContent>
              <Field label="Nombre del cliente" required><Input value={newClient ?? ''} onChange={(_, d) => setNewClient(d.value)} /></Field>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setNewClient(null)}>Cancelar</Button>
              <Button appearance="primary" disabled={!newClient?.trim()} onClick={createClient}>Crear</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog open={!!site} onOpenChange={(_, d) => !d.open && setSite(null)}>
        <DialogSurface style={{ maxWidth: 600 }}>
          <DialogBody>
            <DialogTitle>{site?.id ? `Editar ${site.name}` : 'Nueva sede'}</DialogTitle>
            {site && (
              <DialogContent>
                <div className={s.form}>
                  <Field label="Nombre de la sede" required><Input value={site.name ?? ''} onChange={(_, d) => setSite({ ...site, name: d.value })} placeholder="TAF Santa Anita" /></Field>
                  <Field label="Nombre corto / centro comercial"><Input value={site.short_name ?? ''} onChange={(_, d) => setSite({ ...site, short_name: d.value })} /></Field>
                  <Field label="Dirección" className={s.span2}><Input value={site.address ?? ''} onChange={(_, d) => setSite({ ...site, address: d.value })} /></Field>
                  <Field label="Prefijo de códigos de equipo" hint="Ej.: TAFSA → TAFSA-01, TAFSA-02…"><Input value={site.equipment_prefix ?? ''} onChange={(_, d) => setSite({ ...site, equipment_prefix: d.value })} /></Field>
                  <Field label="Contacto de tienda"><Input value={site.contact_name ?? ''} onChange={(_, d) => setSite({ ...site, contact_name: d.value })} /></Field>
                </div>
              </DialogContent>
            )}
            <DialogActions>
              <Button onClick={() => setSite(null)}>Cancelar</Button>
              <Button appearance="primary" onClick={saveSite}>Guardar</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

/* ───────────────────────── Tipos de servicio y especialidades ───────────────────────── */

function OptionsCatalog({ admin, table, column, title, singular, female, placeholder }: {
  admin: boolean; table: 'service_types' | 'specialties'; column: 'service_type' | 'specialty';
  title: string; singular: string; female: boolean; placeholder: string;
}) {
  const g = (fem: string, masc: string) => (female ? fem : masc);
  const s = useStyles();
  const cat = useCatalogs();
  const notify = useNotify();
  const list = table === 'service_types' ? cat.serviceTypes : cat.specialties;
  const [draft, setDraft] = useState<{ id?: string; name: string } | null>(null);
  const [toDelete, setToDelete] = useState<CatalogOption | null>(null);
  const [busy, setBusy] = useState(false);
  // En celular la columna de orden se oculta: subir/bajar pasan al menú de acciones
  const narrow = useMediaQuery('(max-width: 600px)');

  // Usos por nombre: los servicios guardan el texto, no el id
  const { data: uses } = useAsync(async () => {
    const rows = must(await supabase.from('services').select(column)) as Record<string, string>[];
    const count = new Map<string, number>();
    for (const r of rows) count.set(r[column], (count.get(r[column]) ?? 0) + 1);
    return count;
  }, [column]);
  const templatesFor = (name: string) => (table === 'service_types' ? cat.reportTemplates.filter((t) => t.service_type === name).length : 0);

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, fail: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      notify(fail, 'error', error.message.includes('duplicate') ? `Ya existe ${g('una', 'un')} ${singular} con ese nombre.` : error.message);
      return false;
    }
    await cat.reload();
    return true;
  };

  const save = async () => {
    const name = draft!.name.trim();
    if (!name) return;
    const ok = draft!.id
      ? await run(async () => supabase.from(table).update({ name }).eq('id', draft!.id!), 'No se pudo renombrar')
      : await run(async () => supabase.from(table).insert({ name, position: Math.max(0, ...list.map((o) => o.position)) + 1 }), 'No se pudo crear');
    if (ok) setDraft(null);
  };

  const move = (i: number, d: number) => {
    const a = list[i], b = list[i + d];
    // Posiciones explícitas por índice: corrige empates si alguna vez se repitieron
    return run(async () => {
      const r1 = await supabase.from(table).update({ position: i + d + 1 }).eq('id', a.id);
      if (r1.error) return r1;
      return supabase.from(table).update({ position: i + 1 }).eq('id', b.id);
    }, 'No se pudo reordenar');
  };

  return (
    <Section title={title} subtitle={`${list.filter((o) => o.active).length} ${g('activas', 'activos')}`}
      actions={admin && <Button size="small" icon={<Add20Regular />} onClick={() => setDraft({ name: '' })}>Agregar</Button>}>
      <Table size="small">
        <TableHeader>
          <TableRow>
            {admin && <TableHeaderCell className={s.wideOnly} style={{ width: 70 }}>Orden</TableHeaderCell>}
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell className={s.wideOnly} style={{ width: 80 }}>Servicios</TableHeaderCell>
            <TableHeaderCell style={{ width: 64 }}>{g('Activa', 'Activo')}</TableHeaderCell>
            {admin && <TableHeaderCell style={{ width: 44 }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((o, i) => {
            const used = (uses?.get(o.name) ?? 0) + templatesFor(o.name);
            return (
              <TableRow key={o.id}>
                {admin && (
                  <TableCell className={s.wideOnly}>
                    <Button size="small" appearance="subtle" icon={<ArrowUp16Regular />} aria-label="Subir" disabled={busy || i === 0} onClick={() => move(i, -1)} />
                    <Button size="small" appearance="subtle" icon={<ArrowDown16Regular />} aria-label="Bajar" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} />
                  </TableCell>
                )}
                <TableCell>
                  <Text weight="semibold" style={{ color: o.active ? undefined : tokens.colorNeutralForeground4 }}>{o.name}</Text>
                  <Caption1 className={s.narrowOnly} style={{ color: tokens.colorNeutralForeground3 }}>
                    {uses ? `${uses.get(o.name) ?? 0} ${uses.get(o.name) === 1 ? 'servicio' : 'servicios'}` : '…'}
                  </Caption1>
                </TableCell>
                <TableCell className={s.wideOnly}>{uses ? uses.get(o.name) ?? 0 : '…'}</TableCell>
                <TableCell>
                  <Switch checked={o.active} disabled={!admin || busy} aria-label={`${g('Activa', 'Activo')}: ${o.name}`}
                    onChange={(_, d) => run(async () => supabase.from(table).update({ active: d.checked }).eq('id', o.id), 'No se pudo actualizar')} />
                </TableCell>
                {admin && (
                  <TableCell>
                    <Menu>
                      <MenuTrigger>
                        <Button size="small" appearance="subtle" icon={<MoreHorizontal20Regular />} aria-label={`Acciones: ${o.name}`} disabled={busy} />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem icon={<Edit20Regular />} onClick={() => setDraft({ id: o.id, name: o.name })}>Renombrar</MenuItem>
                          {narrow && i > 0 && <MenuItem icon={<ArrowUp20Regular />} onClick={() => move(i, -1)}>Subir</MenuItem>}
                          {narrow && i < list.length - 1 && <MenuItem icon={<ArrowDown20Regular />} onClick={() => move(i, 1)}>Bajar</MenuItem>}
                          {uses && !used && <MenuItem icon={<Delete20Regular />} onClick={() => setToDelete(o)}>Quitar</MenuItem>}
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {cat.loading && <Spinner style={{ padding: 24 }} />}
      <Caption1 block style={{ marginTop: 12, color: tokens.colorNeutralForeground3 }}>
        Solo {g('las activas aparecen', 'los activos aparecen')} al registrar un servicio. Renombrar o desactivar no cambia los servicios ya registrados;
        {g(' las que ya se usaron', ' los que ya se usaron')} no se pueden quitar, solo desactivar.
        {table === 'service_types' && ' Al renombrar un tipo de servicio, sus plantillas de informe se actualizan.'}
      </Caption1>

      <Dialog open={!!draft} onOpenChange={(_, d) => !d.open && setDraft(null)}>
        <DialogSurface style={{ maxWidth: 420 }}>
          <DialogBody>
            <DialogTitle>{draft?.id ? `Renombrar ${singular}` : `${g('Nueva', 'Nuevo')} ${singular}`}</DialogTitle>
            <DialogContent>
              <Field label="Nombre" required>
                <Input value={draft?.name ?? ''} autoFocus placeholder={placeholder} onChange={(_, d) => setDraft({ ...draft!, name: d.value })}
                  onKeyDown={(e) => e.key === 'Enter' && save()} />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDraft(null)}>Cancelar</Button>
              <Button appearance="primary" disabled={!draft?.name.trim() || busy} onClick={save}>{draft?.id ? 'Guardar' : 'Crear'}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <ConfirmDialog open={!!toDelete} title={`¿Quitar “${toDelete?.name}”?`} body={`Se eliminará del catálogo de ${title.toLowerCase()}.`} danger confirmLabel="Quitar"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          await run(async () => supabase.from(table).delete().eq('id', toDelete!.id), 'No se pudo quitar');
          setToDelete(null);
        }} />
    </Section>
  );
}
