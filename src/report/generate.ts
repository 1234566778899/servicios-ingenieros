import { supabase, must } from '../lib/supabase';
import { logActivity } from '../lib/services';
import type { Report } from '../lib/types';
import type { ReportModel } from './model';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Genera el Word, lo sube al bucket "reports" y registra el informe en el historial. */
export async function generateReport(serviceId: string, templateId: string, issueDate: string, model: ReportModel) {
  // La librería de Word es pesada: se descarga solo al generar, no al abrir la app
  const { renderReportDocx } = await import('./docx');
  const docx = await renderReportDocx(model);

  // Regenerar conserva el número del informe y sube la versión (v1, v2…)
  const { data: prev } = await supabase
    .from('reports')
    .select('number, version')
    .eq('service_id', serviceId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const report = must(
    await supabase
      .from('reports')
      .insert({
        service_id: serviceId, template_id: templateId, issue_date: issueDate, file_base_name: model.baseName,
        number: prev?.number ?? null, version: (prev?.version ?? 0) + 1,
      })
      .select('*')
      .single(),
  ) as Report;

  try {
    const base = `${serviceId}/${report.number}-v${report.version}`;
    const up = await supabase.storage.from('reports').upload(`${base}.docx`, docx, { contentType: DOCX, upsert: true });
    if (up.error) throw new Error(up.error.message);
    const patch: Partial<Report> = { docx_path: `${base}.docx`, docx_size: docx.byteLength };
    must(await supabase.from('reports').update(patch).eq('id', report.id));
    await supabase.from('services').update({ status: 'Informe generado' }).eq('id', serviceId);
    await logActivity(serviceId, `generó Word ${report.number}`);
    return { report: { ...report, ...patch } as Report, docx };
  } catch (e) {
    // Sin archivos el registro no sirve: lo borramos (la política lo permite si no tiene rutas)
    await supabase.from('reports').delete().eq('id', report.id);
    throw e;
  }
}

export async function fetchReportFile(r: Report, kind: 'docx' | 'pdf') {
  const path = kind === 'docx' ? r.docx_path : r.pdf_path;
  if (!path) throw new Error('El archivo no existe.');
  const { data, error } = await supabase.storage.from('reports').download(path);
  if (error) throw new Error(error.message);
  return {
    name: `${r.file_base_name ?? r.number}.${kind}`,
    data: new Uint8Array(await data.arrayBuffer()),
  };
}

export async function openReportFile(r: Report, kind: 'docx' | 'pdf') {
  const f = await fetchReportFile(r, kind);
  window.open(URL.createObjectURL(new Blob([f.data as BlobPart])));
}

export async function saveReportFile(r: Report, kind: 'docx' | 'pdf') {
  const f = await fetchReportFile(r, kind);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([f.data as BlobPart]));
  a.download = f.name;
  a.click();
  return f.name;
}

/** Abre el informe en una pestaña y lanza el diálogo de impresión ("Guardar como PDF"). */
export function printReportHtml(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) throw new Error('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.');
  w.addEventListener('load', () => {
    w.focus();
    w.print();
  });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
