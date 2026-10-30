import { useEffect, useRef, useState } from 'react';
import {
  Badge, Button, Caption1, Field, Input, Spinner, Text, Tooltip, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import {
  Add20Regular, Add24Regular, ArrowDown16Regular, ArrowLeft20Regular, ArrowRight20Regular, ArrowUp16Regular,
  ChevronLeft20Regular, ChevronRight20Regular, Delete16Regular,
} from '@fluentui/react-icons';
import { AsyncButton, Section } from '../../components/common';
import { ConceptInput, invalidateConcepts } from '../../components/Concepts';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PhotoThumb } from '../../components/PhotoThumb';
import { PhotoViewer } from '../../components/PhotoViewer';
import { usePhotoDrag } from '../../components/photoDrag';
import { supabase, must } from '../../lib/supabase';
import { logActivity, rememberConcepts, removePhotoFiles, savePhotoOrder, settleLimited, syncPhotoStatus, uploadPhoto } from '../../lib/services';
import { useNotify } from '../../lib/toast';
import type { Photo, PhotoGroup } from '../../lib/types';
import type { StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  col: { display: 'flex', flexDirection: 'column', gap: '16px' },
  meta: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px', '@media (max-width: 700px)': { gridTemplateColumns: '1fr' } },
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
  newGroup: { display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '8px', flexWrap: 'wrap' },
});

const DEFAULT_GROUPS = ['Antes del servicio', 'Durante el servicio', 'Después del servicio'];
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/** Servicios sin equipos: el registro fotográfico se arma por secciones (antes, durante, después o las que se necesiten). */
export function StepFotosSecciones({ bundle, reload, patch, readOnly, goTo }: StepProps) {
  const s = useStyles();
  const notify = useNotify();
  const svc = bundle.service;
  const groups = [...bundle.photoGroups].sort(byPosition);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const [toDelete, setToDelete] = useState<Photo | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<PhotoGroup | null>(null);
  const [newTitle, setNewTitle] = useState('');
  // Ediciones de título / descripción aún sin guardar (se guardan al salir del campo)
  const [drafts, setDrafts] = useState<Record<string, { title?: string; description?: string }>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef('');
  const seeded = useRef(false);

  const photosOf = (groupId: string) => bundle.photos.filter((p) => p.group_id === groupId).sort(byPosition);

  // Primera vez: secciones Antes / Durante / Después
  useEffect(() => {
    if (readOnly || seeded.current || bundle.photoGroups.length) return;
    seeded.current = true;
    supabase.from('service_photo_groups')
      .insert(DEFAULT_GROUPS.map((title, i) => ({ service_id: svc.id, position: i + 1, title })))
      .then(({ error }) => (error ? notify('No se pudieron crear las secciones', 'error', error.message) : reload()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveGroup = async (g: PhotoGroup) => {
    const d = drafts[g.id];
    if (!d) return;
    const changes: Partial<PhotoGroup> = {};
    if (d.title !== undefined && d.title.trim() && d.title.trim() !== g.title) changes.title = d.title.trim();
    if (d.description !== undefined && (d.description.trim() || null) !== g.description) changes.description = d.description.trim() || null;
    setDrafts(({ [g.id]: _, ...rest }) => rest);
    if (!Object.keys(changes).length) return;
    const setGroup = (fields: Partial<PhotoGroup>) =>
      patch((b) => ({ ...b, photoGroups: b.photoGroups.map((x) => (x.id === g.id ? { ...x, ...fields } : x)) }));
    setGroup(changes);
    const { error } = await supabase.from('service_photo_groups').update(changes).eq('id', g.id);
    if (error) {
      // Se devuelve el texto escrito al campo para no perderlo
      setGroup({ title: g.title, description: g.description });
      setDrafts((all) => ({ ...all, [g.id]: d }));
      return notify('No se pudo guardar la sección', 'error', error.message);
    }
    if (changes.description) {
      await rememberConcepts('foto', svc.specialty, [changes.description]);
      invalidateConcepts('foto');
    }
  };

  const adding = useRef(false);
  const addGroup = async () => {
    const title = newTitle.trim();
    // Enter dos veces seguidas no crea la sección dos veces
    if (!title || adding.current) return;
    adding.current = true;
    try {
      const row = must(await supabase.from('service_photo_groups').insert({
        service_id: svc.id, title, position: Math.max(0, ...groups.map((g) => g.position)) + 1,
      }).select('*').single()) as PhotoGroup;
      patch((b) => ({ ...b, photoGroups: [...b.photoGroups, row] }));
      setNewTitle('');
    } catch (e: any) {
      notify('No se pudo agregar la sección', 'error', e.message);
    } finally {
      adding.current = false;
    }
  };

  const moveGroup = async (i: number, d: number) => {
    const a = groups[i], b = groups[i + d];
    patch((x) => ({
      ...x,
      photoGroups: x.photoGroups.map((g) => (g.id === a.id ? { ...g, position: b.position } : g.id === b.id ? { ...g, position: a.position } : g)),
    }));
    const res = await Promise.all([
      supabase.from('service_photo_groups').update({ position: b.position }).eq('id', a.id),
      supabase.from('service_photo_groups').update({ position: a.position }).eq('id', b.id),
    ]);
    const error = res.find((r) => r.error)?.error;
    if (error) {
      notify('No se pudo cambiar el orden', 'error', error.message);
      await reload();
    }
  };

  const removeGroup = async () => {
    const g = groupToDelete!;
    const paths = photosOf(g.id).map((p) => p.storage_path);
    setGroupToDelete(null);
    patch((b) => ({ ...b, photoGroups: b.photoGroups.filter((x) => x.id !== g.id), photos: b.photos.filter((p) => p.group_id !== g.id) }));
    try {
      must(await supabase.from('service_photo_groups').delete().eq('id', g.id));
      await Promise.all([removePhotoFiles(paths), logActivity(svc.id, `quitó la sección de fotos “${g.title}”`), syncPhotoStatus(svc.id)]);
    } catch (e: any) {
      notify('No se pudo quitar la sección', 'error', e.message);
      await reload();
    }
  };

  const upload = async (groupId: string, files: File[]) => {
    const imgs = files.filter((f) => /^image\/(jpeg|png|webp|heic)$/.test(f.type));
    if (!imgs.length) return notify('Formato no admitido', 'warning', 'Usa archivos JPG o PNG.');
    const start = Math.max(0, ...photosOf(groupId).map((p) => p.position)) + 1;
    setUploading(groupId);
    setProgress({ done: 0, total: imgs.length });
    try {
      const results = await settleLimited(imgs, 3, async (file, i) => {
          const path = `${svc.id}/secciones/${groupId}/${crypto.randomUUID()}.jpg`;
          await uploadPhoto(path, file);
          const ins = await supabase.from('photos').insert({ service_id: svc.id, group_id: groupId, stage: null, position: start + i, storage_path: path });
          if (ins.error) {
            await removePhotoFiles([path]);
            throw new Error(ins.error.message);
          }
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        });
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length) notify(`${failed.length} foto(s) no se pudieron subir`, 'error', failed[0].reason?.message);
      await logActivity(svc.id, `subió ${imgs.length - failed.length} foto(s) en “${groups.find((g) => g.id === groupId)?.title}”`);
      await syncPhotoStatus(svc.id);
      await reload();
    } catch (e: any) {
      notify('No se pudo subir la foto', 'error', e.message);
    } finally {
      setUploading(null);
    }
  };

  /** Mueve la foto a otra sección y/o posición: se ve al instante y se guardan solo las fotos que cambian. */
  const move = async (p: Photo, groupId: string, position: number) => {
    const dest = photosOf(groupId).filter((x) => x.id !== p.id);
    dest.splice(Math.min(Math.max(position - 1, 0), dest.length), 0, p);
    const changes: Photo[] = dest.map((x, i) => ({ ...x, position: i + 1, group_id: groupId }));
    if (p.group_id !== groupId) {
      changes.push(...photosOf(p.group_id!).filter((x) => x.id !== p.id).map((x, i) => ({ ...x, position: i + 1 })));
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

  const dnd = usePhotoDrag((id, groupId, position) => {
    const p = bundle.photos.find((x) => x.id === id);
    if (p) move(p, groupId, position);
  }, !readOnly);

  /** Desaparece al instante; el borrado en la nube sigue por detrás. */
  const remove = async () => {
    const p = toDelete!;
    setToDelete(null);
    patch((b) => ({ ...b, photos: b.photos.filter((x) => x.id !== p.id) }));
    try {
      must(await supabase.from('photos').delete().eq('id', p.id));
      notify('Fotografía eliminada');
      await Promise.all([removePhotoFiles([p.storage_path]), logActivity(svc.id, 'eliminó una foto'), syncPhotoStatus(svc.id)]);
    } catch (e: any) {
      notify('No se pudo eliminar la foto', 'error', e.message);
      await reload();
    }
  };

  // Al cambiar de paso se guardan los títulos / descripciones que sigan en edición
  const flush = () => Promise.all(groups.filter((g) => drafts[g.id]).map(saveGroup));

  return (
    <>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple hidden
        onChange={(e) => { upload(target.current, [...(e.target.files ?? [])]); e.target.value = ''; }} />
      <div className={s.col}>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          Sección “Registro fotográfico” del informe · {bundle.photos.length} fotos en {groups.length} secciones. Cada sección sale con su título,
          sus fotos (2 por fila) y la descripción debajo. Puedes renombrarlas, reordenarlas o agregar otras (p. ej. “Limpieza de letrero”).
        </Caption1>
        {!groups.length && <Spinner label="Preparando secciones…" />}
        {groups.map((g, gi) => {
          const list = photosOf(g.id);
          const d = drafts[g.id] ?? {};
          return (
            <Section key={g.id}
              title={`${gi + 1}. ${g.title}`}
              actions={!readOnly && (
                <>
                  <Badge appearance="tint" color={list.length ? 'success' : 'warning'}>{list.length} {list.length === 1 ? 'foto' : 'fotos'}</Badge>
                  <Button size="small" appearance="subtle" icon={<ArrowUp16Regular />} aria-label="Subir sección" disabled={gi === 0} onClick={() => moveGroup(gi, -1)} />
                  <Button size="small" appearance="subtle" icon={<ArrowDown16Regular />} aria-label="Bajar sección" disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, 1)} />
                  <Button size="small" appearance="subtle" icon={<Delete16Regular />} aria-label="Quitar sección" onClick={() => setGroupToDelete(g)} />
                </>
              )}>
              <div className={s.meta} onBlur={() => saveGroup(g)}>
                <Field label="Título de la sección">
                  <Input value={d.title ?? g.title} disabled={readOnly}
                    onChange={(_, x) => setDrafts((all) => ({ ...all, [g.id]: { ...all[g.id], title: x.value } }))} />
                </Field>
                <Field label="Descripción (debajo de las fotos)">
                  <ConceptInput kind="foto" specialty={svc.specialty} disabled={readOnly} value={d.description ?? g.description ?? ''}
                    placeholder="Ej.: Estado inicial de las puertas antes del servicio"
                    onChange={(v) => setDrafts((all) => ({ ...all, [g.id]: { ...all[g.id], description: v } }))} />
                </Field>
              </div>
              {uploading === g.id && <Spinner size="tiny" label={`Subiendo ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…`} style={{ marginBottom: 8 }} />}
              <div className={s.tiles}>
                {list.map((p, i) => (
                  <div key={p.id} className={s.slot} {...dnd.tile(p.id, g.id, i)}>
                    <button className={s.thumbBtn} onClick={() => setViewer(p)} aria-label={`Ver foto ${i + 1}`}>
                      <PhotoThumb path={p.storage_path} alt={p.caption ?? ''} height={120} annotations={p.annotations} />
                    </button>
                    <div className={s.slotBar}>
                      <Tooltip content="Mover antes" relationship="label">
                        <Button size="small" appearance="subtle" icon={<ChevronLeft20Regular />} disabled={readOnly || i === 0} onClick={() => move(p, g.id, i)} />
                      </Tooltip>
                      <Caption1 truncate wrap={false} style={{ flex: 1, textAlign: 'center', minWidth: 0 }} title={p.caption ?? ''}>
                        {i + 1}. {p.caption || 'Sin comentario'}
                      </Caption1>
                      <Tooltip content="Mover después" relationship="label">
                        <Button size="small" appearance="subtle" icon={<ChevronRight20Regular />} disabled={readOnly || i === list.length - 1} onClick={() => move(p, g.id, i + 2)} />
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
                    className={mergeClasses(s.add, dropOn === g.id && s.drop)}
                    onClick={() => { target.current = g.id; fileRef.current?.click(); }}
                    onDragOver={(e) => { e.preventDefault(); setDropOn(g.id); }}
                    onDragLeave={() => setDropOn(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDropOn(null);
                      if (dnd.isPhoto(e)) dnd.dropAtEnd(g.id, list.length);
                      else upload(g.id, [...e.dataTransfer.files]);
                    }}>
                    <Add24Regular />
                    <Text size={200}>Agregar fotos</Text>
                    <Caption1>o arrastra aquí (varias a la vez)</Caption1>
                  </button>
                )}
              </div>
              {readOnly && !list.length && <Caption1>Sin fotos.</Caption1>}
            </Section>
          );
        })}
        {!readOnly && groups.length > 0 && (
          <Section title="Nueva sección">
            <div className={s.newGroup}>
              <Field label="Título" style={{ flex: 1, minWidth: 220 }}>
                <Input value={newTitle} placeholder="Ej.: Limpieza de letrero (no incluye desmontaje)" onChange={(_, d) => setNewTitle(d.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addGroup()} />
              </Field>
              <Button icon={<Add20Regular />} disabled={!newTitle.trim()} onClick={addGroup}>Agregar sección</Button>
            </div>
          </Section>
        )}
      </div>
      <div className={s.footer}>
        <AsyncButton icon={<ArrowLeft20Regular />} onClick={() => goTo('trabajos', flush)}>Anterior</AsyncButton>
        <AsyncButton appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" onClick={() => goTo('cierre', async () => { await flush(); await syncPhotoStatus(svc.id); })}>
          Siguiente: Conclusiones
        </AsyncButton>
      </div>

      {viewer && (
        <PhotoViewer
          key={viewer.id}
          photo={viewer}
          title={`${groups.find((g) => g.id === viewer.group_id)?.title ?? ''} · Foto ${photosOf(viewer.group_id!).findIndex((x) => x.id === viewer.id) + 1}`}
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
        body={`Se eliminará “${toDelete?.caption || 'la foto'}”. Ya no aparecerá en el informe generado.`}
        onConfirm={remove} onCancel={() => setToDelete(null)} />
      <ConfirmDialog open={!!groupToDelete} title={`¿Quitar la sección “${groupToDelete?.title}”?`} danger confirmLabel="Quitar"
        body={groupToDelete && photosOf(groupToDelete.id).length
          ? `Se eliminarán también sus ${photosOf(groupToDelete.id).length} fotografía(s).`
          : 'La sección no tiene fotos.'}
        onConfirm={removeGroup} onCancel={() => setGroupToDelete(null)} />
    </>
  );
}
