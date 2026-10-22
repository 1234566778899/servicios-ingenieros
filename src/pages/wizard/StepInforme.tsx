import { useEffect, useMemo, useState } from 'react';
import {
  Button, Caption1, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field,
  MessageBar, MessageBarBody, Option, ProgressBar, Spinner, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import {
  ArrowDownload20Regular, ArrowLeft20Regular, CheckmarkCircle24Filled, DocumentText24Regular,
  Open20Regular, DocumentArrowRight20Regular, Print20Regular,
} from '@fluentui/react-icons';
import { AsyncButton, Section } from '../../components/common';
import { DateInput } from '../../components/DateInput';
import { useAuth } from '../../lib/auth';
import { useCatalogs } from '../../lib/catalogs';
import { useRouter } from '../../lib/router';
import { today, fmtSize } from '../../lib/format';
import { useNotify } from '../../lib/toast';
import { photoStagesDone } from '../../lib/services';
import type { Report } from '../../lib/types';
import { buildReportModel, type ReportModel } from '../../report/model';
import { renderReportHtml } from '../../report/html';
import { generateReport, openReportFile, printReportHtml, saveReportFile } from '../../report/generate';
import type { StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '420px 1fr', gap: '16px', alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  col: { display: 'flex', flexDirection: 'column', gap: '16px' },
  secRow: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '6px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  preview: { width: '100%', height: 'calc(100vh - 330px)', minHeight: '480px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: '#e8e8e8' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' },
  file: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, marginTop: '8px' },
});

export function StepInforme({ bundle, reload, readOnly, goTo }: StepProps) {
  const s = useStyles();
  const cat = useCatalogs();
  const { can } = useAuth();
  const { navigate } = useRouter();
  const notify = useNotify();
  const svc = bundle.service;

  const [templateId, setTemplateId] = useState(svc.report_template_id ?? cat.reportTemplates[0]?.id ?? '');
  const [issueDate, setIssueDate] = useState(today());
  const canWord = can('informes.word');
  const [model, setModel] = useState<ReportModel | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tpl = cat.reportTemplates.find((t) => t.id === templateId);
  const site = cat.sites.find((x) => x.id === svc.site_id);

  useEffect(() => {
    if (!tpl) return;
    let live = true;
    setModel(null);
    buildReportModel(bundle, tpl, issueDate, { ...cat, site }, (d, t) => live && setProgress(t ? d / t : 1))
      .then((m) => live && setModel(m))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, issueDate, bundle]);

  const html = useMemo(() => (model ? renderReportHtml(model) : ''), [model]);
  const pages = (html.match(/class="page"/g) ?? []).length;

  // Validación previa (RF-04): checklist completo, fotos y hallazgos para cada "No conforme"
  const eqs = bundle.equipment;
  const checklistOk = eqs.filter((e) => e.final_status !== 'Pendiente').length;
  const stagesOk = eqs.reduce((n, e) => n + photoStagesDone(bundle.photos, e.id), 0);
  const ncWithout = bundle.results.filter((r) => r.result === 'NC' && !bundle.findings.some((f) => f.service_equipment_id === r.service_equipment_id && f.template_item_id === r.template_item_id)).length;
  const issues = [
    !eqs.length && 'el servicio no tiene equipos',
    checklistOk < eqs.length && `checklist completo en ${checklistOk} de ${eqs.length} equipos`,
    stagesOk < eqs.length * 3 && `${eqs.length * 3 - stagesOk} etapa(s) sin fotografías`,
    ncWithout > 0 && `${ncWithout} actividad(es) “No conforme” sin hallazgo`,
  ].filter(Boolean) as string[];

  const ncCount = bundle.results.filter((r) => r.result === 'NC').length;
  const activities = eqs.reduce((n, e) => n + (e.checklist_template_id ? bundle.items[e.checklist_template_id]?.length ?? 0 : 0), 0);
  const highs = bundle.findings.filter((f) => f.priority === 'Alta').length;
  const sections: [string, string, string][] = [
    ['portada', 'Portada', `${svc.service_type} · ${svc.specialty} · ${cat.siteName(svc.site_id)}`],
    ['memoria', '1. Memoria descriptiva', `Fecha de ejecución ${model?.executionDate ?? ''}`],
    ['detalles', '2. Detalles previos', `${svc.prev_details.length} detalles + resumen de equipos`],
    ['equipos', '3. Lista de equipos', `${eqs.length} equipos`],
    ['checklist', '4. Checklist de mantenimiento', `${activities} actividades · ${ncCount} No conforme`],
    ['fotos', '5. Registro fotográfico', `${model?.equipment.reduce((n, e) => n + e.photos.reduce((k, st) => k + st.rows.length, 0), 0) ?? '…'} filas · ${bundle.photos.length} fotos`],
    ['hallazgos', '6. Hallazgos y deficiencias', `${bundle.findings.length} hallazgos${highs ? ` · ${highs} prioridad Alta` : ''}`],
    ['conclusiones', '7. Conclusiones y recomendaciones', `${model?.conclusions.length ?? 0} conclusiones · ${model?.recommendations.length ?? 0} recomendaciones`],
  ];

  const generate = async () => {
    if (!model || !tpl) return;
    setBusy(true);
    setError(null);
    try {
      const r = await generateReport(svc.id, tpl.id, issueDate, model);
      setResult(r.report);
      reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e: any) {
      notify('No se pudo abrir el archivo', 'error', e.message);
    }
  };

  return (
    <>
      <div className={s.grid}>
        <div className={s.col}>
          <Section title="Plantilla y formato">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Plantilla del informe" required>
                <Dropdown value={tpl ? `${tpl.code} · ${tpl.name} · Versión ${String(tpl.version).padStart(2, '0')}` : ''} selectedOptions={[templateId]}
                  onOptionSelect={(_, d) => setTemplateId(d.optionValue!)}>
                  {cat.reportTemplates.filter((t) => t.status !== 'Inactiva').map((t) => (
                    <Option key={t.id} value={t.id} text={`${t.code} · ${t.name}`}>{t.code} · {t.name} · v{String(t.version).padStart(2, '0')} ({t.status})</Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Fecha de emisión" required>
                <DateInput value={issueDate} onChange={setIssueDate} />
              </Field>
              {!canWord && <Caption1>Tu rol no permite generar el informe en Word.</Caption1>}
              {can('informes.pdf')
                ? <Caption1>El Word se guarda en la nube. El PDF se obtiene con “Imprimir / Guardar como PDF”.</Caption1>
                : <Caption1>Tu rol no permite generar el PDF final.</Caption1>}
            </div>
          </Section>
          <Section title="Contenido del informe" subtitle={`${sections.filter(([k]) => tpl?.sections.includes(k)).length} secciones`}>
            {sections.filter(([k]) => tpl?.sections.includes(k)).map(([k, label, note]) => (
              <div key={k} className={s.secRow}>
                <Text size={300} weight="semibold">{label}</Text>
                <Caption1 style={{ textAlign: 'right' }}>{note}</Caption1>
              </div>
            ))}
            <MessageBar intent={issues.length ? 'warning' : 'success'} style={{ marginTop: 12 }}>
              <MessageBarBody>
                {issues.length
                  ? `Revisa antes de generar: ${issues.join(', ')}. Puedes generar igualmente un borrador.`
                  : `Validación completa: checklist en ${eqs.length} de ${eqs.length} equipos, ${bundle.photos.length} fotos con las 3 etapas cubiertas y hallazgos registrados para cada “No conforme”.`}
              </MessageBarBody>
            </MessageBar>
          </Section>
        </div>
        <Section title="Vista previa" subtitle={model ? `${pages} páginas` : ''}>
          {!model && !error && (
            <div style={{ padding: 32 }}>
              <Spinner label="Preparando vista previa…" />
              {progress > 0 && <ProgressBar value={progress} style={{ marginTop: 12 }} />}
            </div>
          )}
          {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
          {model && <iframe className={s.preview} title="Vista previa del informe" srcDoc={html} sandbox="" />}
        </Section>
      </div>
      <div className={s.footer}>
        <AsyncButton icon={<ArrowLeft20Regular />} onClick={() => goTo(5)}>Anterior</AsyncButton>
        <span style={{ flex: 1 }} />
        {can('informes.pdf') && (
          <Button icon={<Print20Regular />} disabled={!model} style={{ marginRight: 8 }}
            onClick={() => { try { printReportHtml(html); } catch (e: any) { notify('No se pudo imprimir', 'error', e.message); } }}>
            Imprimir / Guardar como PDF
          </Button>
        )}
        {!readOnly && canWord && (
          <Button appearance="primary" icon={busy ? <Spinner size="tiny" /> : <DocumentArrowRight20Regular />} disabled={!model || busy} onClick={generate}>
            {busy ? 'Generando…' : 'Generar informe'}
          </Button>
        )}
      </div>

      <Dialog open={!!result} onOpenChange={(_, d) => !d.open && setResult(null)}>
        <DialogSurface style={{ maxWidth: 620 }}>
          <DialogBody>
            <DialogTitle>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckmarkCircle24Filled color={tokens.colorPaletteGreenForeground1} /> Informe generado correctamente
              </span>
            </DialogTitle>
            <DialogContent>
              <Text block weight="semibold">{result?.number} · {svc.code}</Text>
              <Caption1>Guardado en la nube y disponible en el Historial de informes.</Caption1>
              {result?.docx_path && (
                <div className={s.file}>
                  <DocumentText24Regular />
                  <div style={{ flex: 1 }}>
                    <Text block size={200} weight="semibold">{result.file_base_name}.docx</Text>
                    <Caption1>Word editable · {fmtSize(result.docx_size)}</Caption1>
                  </div>
                  <Button size="small" icon={<Open20Regular />} onClick={() => act(() => openReportFile(result, 'docx'))}>Abrir</Button>
                  <Button size="small" icon={<ArrowDownload20Regular />} onClick={() => act(() => saveReportFile(result, 'docx'))}>Descargar</Button>
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => navigate('/historial')}>Ir al historial</Button>
              <Button appearance="primary" onClick={() => navigate(`/servicios/${svc.id}`)}>Volver al servicio</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
