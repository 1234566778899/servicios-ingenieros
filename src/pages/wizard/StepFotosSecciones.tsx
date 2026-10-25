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
import { supabase, must } from '../../lib/supabase';
import { compressImage, logActivity, rememberConcepts, syncPhotoStatus } from '../../lib/services';
import { useNotify } from '../../lib/toast';
import type { Photo, PhotoGroup } from '../../lib/types';
import type { StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  col: { display: 'flex', flexDirection: 'column', gap: '16px' },
  meta: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px', '@media (max-width: 700px)': { gridTemplateColumns: '1fr' } },
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
  newGroup: { display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '8px', flexWrap: 'wrap' },
});

const DEFAULT_GROUPS = ['Antes del servicio', 'Durante el servicio', 'Después del servicio'];
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/** Servicios sin equipos: el registro fotográfico se arma por secciones (antes, durante, después o las que se necesiten). */
export function StepFotosSecciones({ bundle, reload, readOnly, goTo }: StepProps) {
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
    const patch: Partial<PhotoGroup> = {};
    if (d.title !== undefined && d.title.trim() && d.title.trim() !== g.title) patch.title = d.title.trim();
    if (d.description !== undefined && (d.description.trim() || null) !== g.description) patch.description = d.description.trim() || null;
    setDrafts(({ [g.id]: _, ...rest }) => rest);
    if (!Object.keys(patch).length) return;
    const { error } = await supabase.from('service_photo_groups').update(patch).eq('id', g.id);
    if (error) return notify('No se pudo guardar la sección', 'error', error.message);
    if (patch.description) {
      await rememberConcepts('foto', svc.specialty, [patch.description]);
      invalidateConcepts('foto');
    }
    await reload();
  };

  const addGroup = async () => {
    const title = newTitle.trim();
    if (!title) return;
    must(await supabase.from('service_photo_groups').insert({
      service_id: svc.id, title, position: Math.max(0, ...groups.map((g) => g.position)) + 1,
    }));
    setNewTitle('');
    await reload();
  };

  const moveGroup = async (i: number, d: number) => {
    const a = groups[i], b = groups[i + d];
    await Promise.all([
      supabase.from('service_photo_groups').update({ position: i + d + 1 }).eq('id', a.id),
      supabase.from('service_photo_groups').update({ position: i + 1 }).eq('id', b.id),
    ]);
    await reload();
  };

  const removeGroup = async () => {
    const g = groupToDelete!;
    const paths = photosOf(g.id).map((p) => p.storage_path);
    must(await supabase.from('service_photo_groups').delete().eq('id', g.id));
    if (paths.length) await supabase.storage.from('photos').remove(paths);
    await logActivity(svc.id, `quitó la sección de fotos “${g.title}”`);
    await syncPhotoStatus(svc.id);
    setGroupToDelete(null);
    await reload();
  };

  const upload = async (groupId: string, files: File[]) => {
    const imgs = files.filter((f) => /^image\/(jpeg|png|webp|heic)$/.test(f.type));
    if (!imgs.length) return notify('Formato no admitido', 'warning', 'Usa archivos JPG o PNG.');
    const start = Math.max(0, ...photosOf(groupId).map((p) => p.position)) + 1;
    setUploading(groupId);
    setProgress({ done: 0, total: imgs.length });
    try {
      const results = await Promise.allSettled(
        imgs.map(async (file, i) => {
          const blob = await compressImage(file);
          const path = `${svc.id}/secciones/${groupId}/${crypto.randomUUID()}.jpg`;
          const up = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
          if (up.error) throw new Error(up.error.message);
          const caption = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
          const ins = await supabase.from('photos').insert({ service_id: svc.id, group_id: groupId, stage: null, position: start + i, storage_path: path, caption });
          if (ins.error) {
            await supabase.storage.from('photos').remove([path]);
            throw new Error(ins.error.message);
          }
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }),
      );
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

  /** Guarda el orden 1..n de una sección (solo las filas que cambian). */
  const persistOrder = async (list: Photo[], groupId: string) => {
    await Promise.all(list.map((p, i) => (p.position !== i + 1 || p.group_id !== groupId
      ? supabase.from('photos').update({ position: i + 1, group_id: groupId }).eq('id', p.id)
      : null)));
  };

  const move = async (p: Photo, groupId: string, position: number) => {
    if (p.group_id === groupId && p.position === position) return;
    const dest = photosOf(groupId).filter((x) => x.id !== p.id);
    dest.splice(Math.min(Math.max(position - 1, 0), dest.length), 0, p);
    await persistOrder(dest, groupId);
    if (p.group_id !== groupId) await persistOrder(photosOf(p.group_id!).filter((x) => x.id !== p.id), p.group_id!);
    await reload();
  };

  const remove = async () => {
    const p = toDelete!;
    must(await supabase.from('photos').delete().eq('id', p.id));
    await supabase.storage.from('photos').remove([p.storage_path]);
    await persistOrder(photosOf(p.group_id!).filter((x) => x.id !== p.id), p.group_id!);
    await logActivity(svc.id, 'eliminó una foto');
    await syncPhotoStatus(svc.id);
    setToDelete(null);
    setViewer(null);
    notify('Fotografía eliminada');
    await reload();
  };

  const allPhotos = groups.flatMap((g) => photosOf(g.id));
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
                  <div key={p.id} className={s.slot}>
                    <button className={s.thumbBtn} onClick={() => setViewer(p)} aria-label={`Ver ${p.caption ?? 'foto'}`}>
                      <PhotoThumb path={p.storage_path} alt={p.caption ?? ''} height={120} />
                    </button>
                    <div className={s.slotBar}>
                      <Tooltip content="Mover antes" relationship="label">
                        <Button size="small" appearance="subtle" icon={<ChevronLeft20Regular />} disabled={readOnly || i === 0} onClick={() => move(p, g.id, i)} />
                      </Tooltip>
                      <Caption1 truncate wrap={false} style={{ flex: 1, textAlign: 'center', minWidth: 0 }} title={p.caption ?? ''}>
                        {i + 1}. {p.caption || 'Foto'}
                      </Caption1>
                      <Tooltip content="Mover después" relationship="label">
                        <Button size="small" appearance="subtle" icon={<ChevronRight20Regular />} disabled={readOnly || i === list.length - 1} onClick={() => move(p, g.id, i + 2)} />
                      </Tooltip>
                    </div>
                  </div>
                ))}
                {!readOnly && (
                  <button disabled={!!uploading}
                    className={mergeClasses(s.add, dropOn === g.id && s.drop)}
                    onClick={() => { target.current = g.id; fileRef.current?.click(); }}
                    onDragOver={(e) => { e.preventDefault(); setDropOn(g.id); }}
                    onDragLeave={() => setDropOn(null)}
                    onDrop={(e) => { e.preventDefault(); setDropOn(null); upload(g.id, [...e.dataTransfer.files]); }}>
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
          photo={viewer}
          photos={allPhotos}
          slots={groups.map((g) => ({ id: g.id, label: g.title }))}
          slotOf={(p) => p.group_id!}
          slotLabel="Sección"
          slotCount={(id) => photosOf(id).length}
          code=""
          readOnly={readOnly}
          onNavigate={setViewer}
          onClose={() => setViewer(null)}
          onDelete={() => setToDelete(viewer)}
          onSave={async (caption, groupId, position) => {
            must(await supabase.from('photos').update({ caption }).eq('id', viewer.id));
            await move(viewer, groupId, position);
            await reload();
            setViewer(null);
            notify('Cambios guardados');
          }}
        />
      )}
      <ConfirmDialog open={!!toDelete} title="¿Eliminar fotografía?" danger confirmLabel="Eliminar"
        body={`Se eliminará “${toDelete?.caption ?? 'la foto'}”. Ya no aparecerá en el informe generado.`}
        onConfirm={remove} onCancel={() => setToDelete(null)} />
      <ConfirmDialog open={!!groupToDelete} title={`¿Quitar la sección “${groupToDelete?.title}”?`} danger confirmLabel="Quitar"
        body={groupToDelete && photosOf(groupToDelete.id).length
          ? `Se eliminarán también sus ${photosOf(groupToDelete.id).length} fotografía(s).`
          : 'La sección no tiene fotos.'}
        onConfirm={removeGroup} onCancel={() => setGroupToDelete(null)} />
    </>
  );
}
