import { useRef, useState } from 'react';
import {
  Badge, Button, Caption1, Spinner, Text, Tooltip, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import {
  Add24Regular, ArrowLeft20Regular, ArrowRight20Regular, CheckmarkCircle16Filled, ChevronLeft20Regular, ChevronRight20Regular,
} from '@fluentui/react-icons';
import { AsyncButton, Section } from '../../components/common';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EquipmentRail } from '../../components/EquipmentRail';
import { PhotoThumb } from '../../components/PhotoThumb';
import { PhotoViewer } from '../../components/PhotoViewer';
import { useCatalogs } from '../../lib/catalogs';
import { supabase, must } from '../../lib/supabase';
import { compressImage, logActivity, photoStagesDone, syncPhotoStatus } from '../../lib/services';
import { useNotify } from '../../lib/toast';
import { STAGES, type Photo, type Stage } from '../../lib/types';
import type { StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px', alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  stage: { marginBottom: '20px' },
  stageHead: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' },
  // Tantas columnas como quepan: 4–5 en escritorio, 2 en celular
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', '@media (max-width: 600px)': { gridTemplateColumns: '1fr 1fr', gap: '8px' } },
  slot: {
    border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '6px',
    display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: tokens.colorNeutralBackground1, minWidth: 0,
  },
  add: {
    border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium, minHeight: '150px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
    backgroundColor: tokens.colorNeutralBackground2, cursor: 'pointer', color: tokens.colorNeutralForeground3,
    font: 'inherit', padding: '8px', textAlign: 'center',
  },
  drop: { border: `2px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  slotBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  thumbBtn: { padding: 0, border: 0, background: 'none', cursor: 'zoom-in', display: 'block', width: '100%' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '8px', flexWrap: 'wrap' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' },
});

const byPosition = (a: Photo, b: Photo) => a.position - b.position;

export function StepFotos({ bundle, reload, readOnly, goTo }: StepProps) {
  const s = useStyles();
  const cat = useCatalogs();
  const notify = useNotify();
  const [selId, setSelId] = useState(bundle.equipment[0]?.id ?? '');
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const [toDelete, setToDelete] = useState<Photo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<Stage>('antes');

  const svc = bundle.service;
  const eq = bundle.equipment.find((e) => e.id === selId);
  const photosOf = (seId: string) => bundle.photos.filter((p) => p.service_equipment_id === seId);
  const stagePhotos = (seId: string, st: Stage) => photosOf(seId).filter((p) => p.stage === st).sort(byPosition);
  const stagesDone = bundle.equipment.reduce((n, e) => n + photoStagesDone(bundle.photos, e.id), 0);
  const stagesTotal = bundle.equipment.length * 3;

  const upload = async (stage: Stage, files: File[]) => {
    const imgs = files.filter((f) => /^image\/(jpeg|png|webp|heic)$/.test(f.type));
    if (!imgs.length) return notify('Formato no admitido', 'warning', 'Usa archivos JPG o PNG.');
    // Las nuevas fotos van al final de la etapa
    const start = Math.max(0, ...stagePhotos(selId, stage).map((p) => p.position)) + 1;
    setUploading(stage);
    setProgress({ done: 0, total: imgs.length });
    try {
      const results = await Promise.allSettled(
        imgs.map(async (file, i) => {
          const blob = await compressImage(file);
          const path = `${svc.id}/${selId}/${crypto.randomUUID()}.jpg`;
          const up = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
          if (up.error) throw new Error(up.error.message);
          const caption = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
          const ins = await supabase.from('photos').insert({ service_id: svc.id, service_equipment_id: selId, stage, position: start + i, storage_path: path, caption });
          if (ins.error) {
            await supabase.storage.from('photos').remove([path]);
            throw new Error(ins.error.message);
          }
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length) notify(`${failed.length} foto(s) no se pudieron subir`, 'error', failed[0].reason?.message);
      await logActivity(svc.id, `subió ${imgs.length - failed.length} foto(s) (${stage}) de ${eq?.code}`);
      await syncPhotoStatus(svc.id);
      await reload();
    } catch (e: any) {
      notify('No se pudo subir la foto', 'error', e.message);
    } finally {
      setUploading(null);
    }
  };

  /** Guarda el orden 1..n de una etapa (solo las filas que cambian). */
  const persistOrder = async (list: Photo[], stage: Stage) => {
    await Promise.all(
      list.map((p, i) => (p.position !== i + 1 || p.stage !== stage
        ? supabase.from('photos').update({ position: i + 1, stage }).eq('id', p.id)
        : null)),
    );
  };

  /** Mueve la foto a otra etapa y/o posición, renumerando las etapas afectadas. */
  const move = async (p: Photo, stage: Stage, position: number) => {
    if (p.stage === stage && p.position === position) return;
    const dest = stagePhotos(p.service_equipment_id!, stage).filter((x) => x.id !== p.id);
    dest.splice(Math.min(Math.max(position - 1, 0), dest.length), 0, p);
    await persistOrder(dest, stage);
    if (p.stage !== stage) await persistOrder(stagePhotos(p.service_equipment_id!, p.stage!).filter((x) => x.id !== p.id), p.stage!);
    await reload();
  };

  const remove = async () => {
    const p = toDelete!;
    must(await supabase.from('photos').delete().eq('id', p.id));
    await supabase.storage.from('photos').remove([p.storage_path]);
    await persistOrder(stagePhotos(p.service_equipment_id!, p.stage!).filter((x) => x.id !== p.id), p.stage!);
    await logActivity(svc.id, `eliminó una foto de ${eq?.code}`);
    await syncPhotoStatus(svc.id);
    setToDelete(null);
    setViewer(null);
    notify('Fotografía eliminada');
    await reload();
  };

  const pick = (stage: Stage) => {
    target.current = stage;
    fileRef.current?.click();
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple hidden
        onChange={(e) => { upload(target.current, [...(e.target.files ?? [])]); e.target.value = ''; }} />
      <div className={s.grid}>
        <Section title="Equipos">
          <EquipmentRail equipment={bundle.equipment} selected={selId} onSelect={setSelId}
            right={(e) => {
              const done = photoStagesDone(bundle.photos, e.id) === 3;
              return (
                <Caption1 style={{ display: 'flex', alignItems: 'center', gap: 4, color: done ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteMarigoldForeground1 }}>
                  {done && <CheckmarkCircle16Filled />}{photosOf(e.id).length} fotos
                </Caption1>
              );
            }} />
        </Section>
        <Section>
          <div className={s.head}>
            <div>
              <Text size={500} weight="semibold" block>Registro fotográfico</Text>
              <Caption1>Sección 5 · por equipo y etapa · al menos 1 foto por etapa, sin límite máximo</Caption1>
            </div>
            <Caption1>{bundle.photos.length} fotos · {stagesDone} de {stagesTotal} etapas con fotos</Caption1>
          </div>
          {eq && <Text weight="semibold" block style={{ marginBottom: 12 }}>{eq.code} · {cat.typeName(eq.equipment_type_id)}</Text>}
          {STAGES.map((st) => {
            const list = stagePhotos(selId, st.id);
            const key = st.id;
            return (
              <div key={st.id} className={s.stage}>
                <div className={s.stageHead}>
                  <Text weight="semibold">{st.label.toUpperCase()}</Text>
                  <Badge appearance="tint" color={list.length ? 'success' : 'warning'}>{list.length} {list.length === 1 ? 'foto' : 'fotos'}</Badge>
                  {uploading === st.id && <Spinner size="tiny" label={`Subiendo ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…`} />}
                </div>
                <div className={s.tiles}>
                  {list.map((p, i) => (
                    <div key={p.id} className={s.slot}>
                      <button className={s.thumbBtn} onClick={() => setViewer(p)} aria-label={`Ver ${p.caption ?? 'foto'}`}>
                        <PhotoThumb path={p.storage_path} alt={p.caption ?? ''} height={120} />
                      </button>
                      <div className={s.slotBar}>
                        <Tooltip content="Mover antes" relationship="label">
                          <Button size="small" appearance="subtle" icon={<ChevronLeft20Regular />} disabled={readOnly || i === 0} onClick={() => move(p, st.id, i)} />
                        </Tooltip>
                        <Caption1 truncate wrap={false} style={{ flex: 1, textAlign: 'center', minWidth: 0 }} title={p.caption ?? ''}>
                          {i + 1}. {p.caption || 'Foto'}
                        </Caption1>
                        <Tooltip content="Mover después" relationship="label">
                          <Button size="small" appearance="subtle" icon={<ChevronRight20Regular />} disabled={readOnly || i === list.length - 1} onClick={() => move(p, st.id, i + 2)} />
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                  {!readOnly && (
                    <button disabled={!!uploading}
                      className={mergeClasses(s.add, dropOn === key && s.drop)}
                      onClick={() => pick(st.id)}
                      onDragOver={(e) => { e.preventDefault(); setDropOn(key); }}
                      onDragLeave={() => setDropOn(null)}
                      onDrop={(e) => { e.preventDefault(); setDropOn(null); upload(st.id, [...e.dataTransfer.files]); }}>
                      <Add24Regular />
                      <Text size={200}>Agregar fotos</Text>
                      <Caption1>o arrastra aquí (varias a la vez)</Caption1>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
            En el informe cada etapa se muestra en filas de 3 fotos (FOTO 1 · FOTO 2 · FOTO 3…). Formatos JPG/PNG · se comprimen al subir.
          </Caption1>
        </Section>
      </div>
      <div className={s.footer}>
        <AsyncButton icon={<ArrowLeft20Regular />} onClick={() => goTo('checklist')}>Anterior</AsyncButton>
        <AsyncButton appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" onClick={() => goTo('hallazgos', () => syncPhotoStatus(svc.id))}>
          Siguiente: Hallazgos
        </AsyncButton>
      </div>

      {viewer && (
        <PhotoViewer
          photo={viewer}
          photos={photosOf(viewer.service_equipment_id!).sort((a, b) => STAGES.findIndex((x) => x.id === a.stage) - STAGES.findIndex((x) => x.id === b.stage) || a.position - b.position)}
          slots={STAGES}
          slotOf={(p) => p.stage!}
          slotLabel="Etapa"
          slotCount={(st) => stagePhotos(viewer.service_equipment_id!, st as Stage).length}
          code={eq?.code ?? ''}
          readOnly={readOnly}
          onNavigate={setViewer}
          onClose={() => setViewer(null)}
          onDelete={() => setToDelete(viewer)}
          onSave={async (caption, stage, position) => {
            must(await supabase.from('photos').update({ caption }).eq('id', viewer.id));
            await move(viewer, stage as Stage, position);
            await reload();
            setViewer(null);
            notify('Cambios guardados');
          }}
        />
      )}
      <ConfirmDialog open={!!toDelete} title="¿Eliminar fotografía?" danger confirmLabel="Eliminar"
        body={`Se eliminará “${toDelete?.caption ?? 'la foto'}” de la etapa ${STAGES.find((x) => x.id === toDelete?.stage)?.label}. Ya no aparecerá en el informe generado.`}
        onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  );
}
