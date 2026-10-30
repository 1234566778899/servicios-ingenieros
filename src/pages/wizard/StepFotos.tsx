import { useRef, useState } from 'react';
import {
  Badge, Button, Caption1, Spinner, Text, Tooltip, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import {
  Add24Regular, ArrowLeft20Regular, Delete16Regular, ArrowRight20Regular, CheckmarkCircle16Filled, ChevronLeft20Regular, ChevronRight20Regular,
} from '@fluentui/react-icons';
import { AsyncButton, Section } from '../../components/common';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EquipmentRail } from '../../components/EquipmentRail';
import { PhotoThumb } from '../../components/PhotoThumb';
import { PhotoViewer } from '../../components/PhotoViewer';
import { usePhotoDrag } from '../../components/photoDrag';
import { useCatalogs } from '../../lib/catalogs';
import { supabase, must } from '../../lib/supabase';
import { logActivity, photoStagesDone, removePhotoFiles, savePhotoOrder, settleLimited, syncPhotoStatus, uploadPhoto } from '../../lib/services';
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
    display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: tokens.colorNeutralBackground1, minWidth: 0, cursor: 'pointer',
  },
  add: {
    border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium, minHeight: '150px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
    backgroundColor: tokens.colorNeutralBackground2, cursor: 'pointer', color: tokens.colorNeutralForeground3,
    font: 'inherit', padding: '8px', textAlign: 'center',
  },
  drop: { border: `2px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  slotBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  thumbBtn: { padding: 0, border: 0, background: 'none', cursor: 'inherit', display: 'block', width: '100%' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '8px', flexWrap: 'wrap' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' },
});

const byPosition = (a: Photo, b: Photo) => a.position - b.position;

export function StepFotos({ bundle, reload, patch, readOnly, goTo }: StepProps) {
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
      const results = await settleLimited(imgs, 3, async (file, i) => {
          const path = `${svc.id}/${selId}/${crypto.randomUUID()}.jpg`;
          await uploadPhoto(path, file);
          const ins = await supabase.from('photos').insert({ service_id: svc.id, service_equipment_id: selId, stage, position: start + i, storage_path: path });
          if (ins.error) {
            await removePhotoFiles([path]);
            throw new Error(ins.error.message);
          }
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        });
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

  /** Mueve la foto a otra etapa y/o posición: se ve al instante y se guardan solo las fotos que cambian. */
  const move = async (p: Photo, stage: Stage, position: number) => {
    const dest = stagePhotos(p.service_equipment_id!, stage).filter((x) => x.id !== p.id);
    dest.splice(Math.min(Math.max(position - 1, 0), dest.length), 0, p);
    const changes: Photo[] = dest.map((x, i) => ({ ...x, position: i + 1, stage }));
    if (p.stage !== stage) {
      changes.push(...stagePhotos(p.service_equipment_id!, p.stage!).filter((x) => x.id !== p.id).map((x, i) => ({ ...x, position: i + 1 })));
    }
    const before = bundle.photos;
    patch((b) => ({ ...b, photos: b.photos.map((x) => changes.find((c) => c.id === x.id) ?? x) }));
    try {
      await savePhotoOrder(before, changes);
    } catch (e: any) {
      notify('No se pudo guardar el orden de las fotos', 'error', e.message);
      await reload();
    }
  };

  /** Desaparece al instante; el borrado en la nube sigue por detrás (sin renumerar: el orden se muestra por posición). */
  const remove = async () => {
    const p = toDelete!;
    setToDelete(null);
    patch((b) => ({ ...b, photos: b.photos.filter((x) => x.id !== p.id) }));
    try {
      must(await supabase.from('photos').delete().eq('id', p.id));
      notify('Fotografía eliminada');
      await Promise.all([removePhotoFiles([p.storage_path]), logActivity(svc.id, `eliminó una foto de ${eq?.code}`), syncPhotoStatus(svc.id)]);
    } catch (e: any) {
      notify('No se pudo eliminar la foto', 'error', e.message);
      await reload();
    }
  };

  const dnd = usePhotoDrag((id, stage, position) => {
    const p = bundle.photos.find((x) => x.id === id);
    if (p) move(p, stage as Stage, position);
  }, !readOnly);

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
                    <div key={p.id} className={s.slot} {...dnd.tile(p.id, st.id, i)}>
                      <button className={s.thumbBtn} onClick={() => setViewer(p)} aria-label={`Ver foto ${i + 1}`}>
                        <PhotoThumb path={p.storage_path} alt={p.caption ?? ''} height={120} annotations={p.annotations} />
                      </button>
                      <div className={s.slotBar}>
                        <Tooltip content="Mover antes" relationship="label">
                          <Button size="small" appearance="subtle" icon={<ChevronLeft20Regular />} disabled={readOnly || i === 0} onClick={() => move(p, st.id, i)} />
                        </Tooltip>
                        <Caption1 truncate wrap={false} style={{ flex: 1, textAlign: 'center', minWidth: 0 }} title={p.caption ?? ''}>
                          {i + 1}. {p.caption || 'Sin comentario'}
                        </Caption1>
                        <Tooltip content="Mover después" relationship="label">
                          <Button size="small" appearance="subtle" icon={<ChevronRight20Regular />} disabled={readOnly || i === list.length - 1} onClick={() => move(p, st.id, i + 2)} />
                        </Tooltip>
                        {!readOnly && (

                          <Tooltip content="Eliminar foto" relationship="label">

                            <Button size="small" appearance="subtle" icon={<Delete16Regular />} onClick={() => setToDelete(p)} />

                          </Tooltip>

                        )}
                      </div>
                    </div>
                  ))}
                  {!readOnly && (
                    <button disabled={!!uploading}
                      className={mergeClasses(s.add, dropOn === key && s.drop)}
                      onClick={() => pick(st.id)}
                      onDragOver={(e) => { e.preventDefault(); setDropOn(key); }}
                      onDragLeave={() => setDropOn(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropOn(null);
                        if (dnd.isPhoto(e)) dnd.dropAtEnd(st.id, list.length);
                        else upload(st.id, [...e.dataTransfer.files]);
                      }}>
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
            En el informe cada etapa se muestra en filas de 3 fotos (FOTO 1 · FOTO 2 · FOTO 3…). Arrastra una foto para cambiar su orden o pasarla a otra etapa.
            Formatos JPG/PNG · se comprimen al subir.
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
          key={viewer.id}
          photo={viewer}
          title={`${eq?.code ? `${eq.code} · ` : ''}${STAGES.find((x) => x.id === viewer.stage)?.label} · Foto ${stagePhotos(viewer.service_equipment_id!, viewer.stage!).findIndex((x) => x.id === viewer.id) + 1}`}
          readOnly={readOnly}
          onClose={() => setViewer(null)}
          onSave={async (caption, annotations) => {
            must(await supabase.from('photos').update({ caption: caption || null, annotations }).eq('id', viewer.id));
            patch((b) => ({ ...b, photos: b.photos.map((x) => (x.id === viewer.id ? { ...x, caption: caption || null, annotations } : x)) }));
            setViewer(null);
            notify('Cambios guardados');
          }}
        />
      )}
      <ConfirmDialog open={!!toDelete} title="¿Eliminar fotografía?" danger confirmLabel="Eliminar"
        body={`Se eliminará “${toDelete?.caption || 'la foto'}” de la etapa ${STAGES.find((x) => x.id === toDelete?.stage)?.label}. Ya no aparecerá en el informe generado.`}
        onConfirm={remove} onCancel={() => setToDelete(null)} />
    </>
  );
}
