import { useState } from 'react';
import {
  Button, Caption1, Card, CardHeader, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface,
  DialogTitle, Dropdown, Field, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, MessageBar, MessageBarBody,
  Option, Spinner, Tab, TabList, Text, Textarea, makeStyles, tokens,
} from '@fluentui/react-components';
import { Add20Regular, MoreHorizontal20Regular } from '@fluentui/react-icons';
import { PageHeader, StatusBadge } from '../components/common';
import { DateInput } from '../components/DateInput';
import { useAuth } from '../lib/auth';
import { optionNames, useCatalogs } from '../lib/catalogs';
import { useRouter } from '../lib/router';
import { supabase, must } from '../lib/supabase';
import { fmtDate } from '../lib/format';
import { useNotify } from '../lib/toast';
import type { ReportTemplate } from '../lib/types';

const SECTIONS: [string, string][] = [
  ['portada', 'Portada'], ['memoria', '1. Memoria descriptiva'], ['detalles', '2. Detalles previos'], ['equipos', '3. Lista de equipos'],
  ['checklist', '4. Checklist'], ['fotos', '5. Registro fotográfico'], ['hallazgos', '6. Hallazgos'], ['conclusiones', '7. Conclusiones'],
];

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' },
  preview: {
    border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '12px', backgroundColor: '#fff',
    display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '130px',
  },
  form: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', '@media (max-width: 600px)': { gridTemplateColumns: '1fr' } },
  span2: { gridColumn: 'span 2', '@media (max-width: 600px)': { gridColumn: 'auto' } },
});

type Draft = Omit<ReportTemplate, 'id'> & { id?: string };

export function Plantillas() {
  const s = useStyles();
  const cat = useCatalogs();
  const { can } = useAuth();
  const { navigate } = useRouter();
  const notify = useNotify();
  const [draft, setDraft] = useState<Draft | null>(null);
  const admin = can('plantillas.admin');

  const blank = (): Draft => ({
    code: 'F-SGC-100-01', name: '', service_type: optionNames(cat.serviceTypes)[0] ?? null, version: 1, issued_at: new Date().toISOString().slice(0, 10),
    status: 'Borrador', sections: SECTIONS.map(([k]) => k), notes: '',
  });

  const save = async () => {
    if (!draft?.name || !draft.code) return notify('Completa código y nombre', 'warning');
    const { id, ...row } = draft;
    const res = id ? await supabase.from('report_templates').update(row).eq('id', id) : await supabase.from('report_templates').insert(row);
    if (res.error) return notify('No se pudo guardar', 'error', res.error.message);
    notify('Plantilla guardada');
    setDraft(null);
    cat.reload();
  };

  const setStatus = async (t: ReportTemplate, status: ReportTemplate['status']) => {
    must(await supabase.from('report_templates').update({ status }).eq('id', t.id));
    cat.reload();
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Historial de informes', to: '/historial' }, { label: 'Plantillas' }]}
        title="Plantillas de informe"
        actions={admin && <Button appearance="primary" icon={<Add20Regular />} onClick={() => setDraft(blank())}>Nueva versión de plantilla</Button>}
      />
      <TabList selectedValue="plantillas" onTabSelect={(_, d) => d.value === 'informes' && navigate('/historial')} style={{ marginBottom: 12 }}>
        <Tab value="informes">Informes generados</Tab>
        <Tab value="plantillas">Plantillas</Tab>
      </TabList>
      <MessageBar style={{ marginBottom: 16 }}>
        <MessageBarBody>
          Plantilla base del cliente: formato F-SGC-100-01. Cada plantilla define qué secciones se incluyen en el informe y su versión de emisión.
        </MessageBarBody>
      </MessageBar>
      {cat.loading && <Spinner style={{ padding: 24 }} />}
      <div className={s.grid}>
        {cat.reportTemplates.map((t) => (
          <Card key={t.id}>
            <div className={s.preview}>
              <Caption1 style={{ color: tokens.colorBrandForeground1, fontWeight: 600 }}>nórdico ingenieros · {t.code} v{String(t.version).padStart(2, '0')}</Caption1>
              <Text weight="semibold" size={200}>SERVICIO DE {(t.service_type ?? t.name).toUpperCase()}</Text>
              <Caption1>{SECTIONS.filter(([k]) => t.sections.includes(k)).map(([, l]) => l).join(' · ')}</Caption1>
            </div>
            <CardHeader
              header={<Text weight="semibold">{t.code} · {t.name}</Text>}
              description={<Caption1>Versión {String(t.version).padStart(2, '0')} · emitida {fmtDate(t.issued_at)} · {t.sections.length} secciones</Caption1>}
              action={admin ? (
                <Menu>
                  <MenuTrigger><Button appearance="subtle" icon={<MoreHorizontal20Regular />} aria-label="Acciones" /></MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      <MenuItem onClick={() => setDraft({ ...t })}>Editar</MenuItem>
                      <MenuItem onClick={() => setDraft({ ...t, id: undefined, version: t.version + 1, status: 'Borrador', issued_at: new Date().toISOString().slice(0, 10) })}>Crear nueva versión</MenuItem>
                      {t.status !== 'Activa' && <MenuItem onClick={() => setStatus(t, 'Activa')}>Activar</MenuItem>}
                      {t.status !== 'Inactiva' && <MenuItem onClick={() => setStatus(t, 'Inactiva')}>Desactivar</MenuItem>}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              ) : undefined}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={t.status} />
              {t.notes && <Caption1 truncate wrap={false}>{t.notes}</Caption1>}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!draft} onOpenChange={(_, d) => !d.open && setDraft(null)}>
        <DialogSurface style={{ maxWidth: 640 }}>
          <DialogBody>
            <DialogTitle>{draft?.id ? 'Editar plantilla' : 'Nueva versión de plantilla'}</DialogTitle>
            {draft && (
              <DialogContent>
                <div className={s.form}>
                  <Field label="Código" required><Input value={draft.code} onChange={(_, d) => setDraft({ ...draft, code: d.value })} /></Field>
                  <Field label="Nombre" required><Input value={draft.name} onChange={(_, d) => setDraft({ ...draft, name: d.value })} placeholder="Mantenimiento preventivo" /></Field>
                  <Field label="Tipo de servicio">
                    <Dropdown value={draft.service_type ?? ''} selectedOptions={[draft.service_type ?? '']} onOptionSelect={(_, d) => setDraft({ ...draft, service_type: d.optionValue! })}>
                      {optionNames(cat.serviceTypes, draft.service_type).map((t) => <Option key={t}>{t}</Option>)}
                    </Dropdown>
                  </Field>
                  <Field label="Versión"><Input type="number" min={1} value={String(draft.version)} onChange={(_, d) => setDraft({ ...draft, version: Number(d.value) || 1 })} /></Field>
                  <Field label="Fecha de emisión"><DateInput value={draft.issued_at} onChange={(v) => setDraft({ ...draft, issued_at: v })} /></Field>
                  <Field label="Estado">
                    <Dropdown value={draft.status} selectedOptions={[draft.status]} onOptionSelect={(_, d) => setDraft({ ...draft, status: d.optionValue as any })}>
                      {['Activa', 'Borrador', 'Inactiva'].map((x) => <Option key={x}>{x}</Option>)}
                    </Dropdown>
                  </Field>
                  <Field label="Secciones incluidas" className={s.span2}>
                    <div className="r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                      {SECTIONS.map(([k, l]) => (
                        <Checkbox key={k} label={l} checked={draft.sections.includes(k)}
                          onChange={(_, d) => setDraft({ ...draft, sections: d.checked ? SECTIONS.map(([x]) => x).filter((x) => x === k || draft.sections.includes(x)) : draft.sections.filter((x) => x !== k) })} />
                      ))}
                    </div>
                  </Field>
                  <Field label="Notas" className={s.span2}><Textarea value={draft.notes ?? ''} onChange={(_, d) => setDraft({ ...draft, notes: d.value })} /></Field>
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
    </>
  );
}
