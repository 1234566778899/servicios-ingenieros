import { useRef, useState } from 'react';
import {
  Button, Caption1, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field,
  Input, Option, ProgressBar, Spinner, Text, Tooltip, makeStyles, tokens,
} from '@fluentui/react-components';
import {
  Add24Regular, ArrowLeft20Regular, ArrowRight20Regular, ChevronLeft20Regular, ChevronRight20Regular,
  Delete20Regular, Dismiss20Regular, Save20Regular,
} from '@fluentui/react-icons';
import { Section } from '../../components/common';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EquipmentRail } from '../../components/EquipmentRail';
import { PhotoThumb } from '../../components/PhotoThumb';
import { useCatalogs } from '../../lib/catalogs';
import { supabase, must } from '../../lib/supabase';
import { compressImage, logActivity, syncPhotoStatus } from '../../lib/services';
import { useNotify } from '../../lib/toast';
import { STAGES, type Photo, type Stage } from '../../lib/types';
import type { StepProps } from './ServicioWizard';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px', alignItems: 'start' },
  stage: { display: 'grid', gridTemplateColumns: '110px repeat(3, 1fr)', gap: '12px', alignItems: 'stretch', marginBottom: '16px' },
  stageLabel: { display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  slot: {
    border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '6px',
    display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: tokens.colorNeutralBackground1, minWidth: 0,
  },
  empty: {
    border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium, minHeight: '170px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
    backgroundColor: tokens.colorNeutralBackground2, cursor: 'pointer', color: tokens.colorNeutralForeground3,
    font: 'inherit',
  },
  drop: { border: `2px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  slotBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  thumbBtn: { padding: 0, border: 0, background: 'none', cursor: 'zoom-in', display: 'block', width: '100%' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px' },
});

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
  const stagePhotos = (st: Stage) => photosOf(selId).filter((p) => p.stage === st).sort((a, b) => a.position - b.position);
  const total = bundle.photos.length;
  const expected = bundle.equipment.length * 9;

  const upload = async (stage: Stage, files: File[]) => {
    const taken = new Set(stagePhotos(stage).map((p) => p.position));
    const free = [1, 2, 3].filter((p) => !taken.has(p));
    const imgs = files.filter((f) => /^image\/(jpeg|png|webp|heic)$/.test(f.type));
    if (!imgs.length) return notify('Formato no admitido', 'warning', 'Usa archivos JPG o PNG.');
    if (imgs.length > free.length) notify(`Solo hay ${free.length} espacio(s) libre(s) en esta etapa`, 'warning', 'Máximo 3 fotos por etapa.');
    const batch = imgs.slice(0, free.length);
    setUploading(stage);
    setProgress({ done: 0, total: batch.length });
    try {
      // En paralelo: comprimir + subir + registrar cada foto en su posición libre
      const results = await Promise.allSettled(
        batch.map(async (file, i) => {
          const blob = await compressImage(file);
          const path = `${svc.id}/${selId}/${crypto.randomUUID()}.jpg`;
          const up = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
          if (up.error) throw new Error(up.error.message);
          const caption = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
          const ins = await supabase.from('photos').insert({ service_equipment_id: selId, stage, position: free[i], storage_path: path, caption });
          if (ins.error) {
            await supabase.storage.from('photos').remove([path]);
            throw new Error(ins.error.message);
          }
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (failed.length) notify(`${failed.length} foto(s) no se pudieron subir`, 'error', failed[0].reason?.message);
      await logActivity(svc.id, `subió fotos (${stage}) de ${eq?.code}`);
      await syncPhotoStatus(svc.id);
      await reload();
    } catch (e: any) {
      notify('No se pudo subir la foto', 'error', e.message);
    } finally {
      setUploading(null);
    }
  };

  /** Mueve la foto a otra posición/etapa; si está ocupada, intercambia. */
  const move = async (p: Photo, stage: Stage, position: number) => {
    if (p.stage === stage && p.position === position) return;
    const other = photosOf(p.service_equipment_id).find((x) => x.stage === stage && x.position === position);
    if (other) must(await supabase.from('photos').update({ stage: p.stage, position: p.position }).eq('id', other.id));
    must(await supabase.from('photos').update({ stage, position }).eq('id', p.id));
    await reload();
  };

  const remove = async () => {
    const p = toDelete!;
    must(await supabase.from('photos').delete().eq('id', p.id));
    await supabase.storage.from('photos').remove([p.storage_path]);
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
              const n = photosOf(e.id).length;
              return <Caption1 style={{ color: n >= 9 ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteMarigoldForeground1 }}>{n}/9</Caption1>;
            }} />
        </Section>
        <Section>
          <div className={s.head}>
            <div>
              <Text size={500} weight="semibold" block>Registro fotográfico</Text>
              <Caption1>Sección 5 · por equipo y etapa · máximo 3 fotos por etapa</Caption1>
            </div>
            <div style={{ width: 220 }}>
              <Caption1>{total} de {expected} fotos</Caption1>
              <ProgressBar value={expected ? total / expected : 0} thickness="large" color={total >= expected ? 'success' : 'brand'} />
            </div>
          </div>
          {eq && <Text weight="semibold" block style={{ marginBottom: 12 }}>{eq.code} · {cat.typeName(eq.equipment_type_id)}</Text>}
          {STAGES.map((st) => {
            const list = stagePhotos(st.id);
            return (
              <div key={st.id} className={s.stage}>
                <div className={s.stageLabel}>
                  <Text weight="semibold">{st.label.toUpperCase()}</Text>
                  <Caption1>{list.length} de 3</Caption1>
                  {uploading === st.id && <Spinner size="tiny" label={`Subiendo ${progress.done + 1 > progress.total ? progress.total : progress.done + 1} de ${progress.total}…`} />}
                </div>
                {[1, 2, 3].map((pos) => {
                  const p = list.find((x) => x.position === pos);
                  if (p) {
                    return (
                      <div key={pos} className={s.slot}>
                        <button className={s.thumbBtn} onClick={() => setViewer(p)} aria-label={`Ver ${p.caption ?? 'foto'}`}>
                          <PhotoThumb path={p.storage_path} alt={p.caption ?? ''} height={130} />
                        </button>
                        <div className={s.slotBar}>
                          <Tooltip content="Mover a la izquierda" relationship="label">
                            <Button size="small" appearance="subtle" icon={<ChevronLeft20Regular />} disabled={readOnly || pos === 1} onClick={() => move(p, st.id, pos - 1)} />
                          </Tooltip>
                          <Caption1 truncate wrap={false} style={{ flex: 1, textAlign: 'center' }} title={p.caption ?? ''}>{p.caption || `Foto ${pos}`}</Caption1>
                          <Tooltip content="Mover a la derecha" relationship="label">
                            <Button size="small" appearance="subtle" icon={<ChevronRight20Regular />} disabled={readOnly || pos === 3} onClick={() => move(p, st.id, pos + 1)} />
                          </Tooltip>
                        </div>
                      </div>
                    );
                  }
                  const key = `${st.id}-${pos}`;
                  return (
                    <button key={pos} disabled={readOnly || !!uploading}
                      className={`${s.empty} ${dropOn === key ? s.drop : ''}`}
                      onClick={() => pick(st.id)}
                      onDragOver={(e) => { e.preventDefault(); setDropOn(key); }}
                      onDragLeave={() => setDropOn(null)}
                      onDrop={(e) => { e.preventDefault(); setDropOn(null); upload(st.id, [...e.dataTransfer.files]); }}>
                      <Add24Regular />
                      <Text size={200}>Agregar foto</Text>
                      <Caption1>o arrastra aquí</Caption1>
                    </button>
                  );
                })}
              </div>
            );
          })}
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
            En el informe cada etapa ocupa una fila con FOTO 1 · FOTO 2 · FOTO 3. Formatos JPG/PNG · se comprimen al subir.
          </Caption1>
        </Section>
      </div>
      <div className={s.footer}>
        <Button icon={<ArrowLeft20Regular />} onClick={() => goTo(3)}>Anterior</Button>
        <Button appearance="primary" icon={<ArrowRight20Regular />} iconPosition="after" onClick={async () => { await syncPhotoStatus(svc.id); goTo(5); }}>
          Siguiente: Hallazgos
        </Button>
      </div>

      {viewer && (
        <PhotoViewer
          photo={viewer}
          photos={photosOf(viewer.service_equipment_id).sort((a, b) => STAGES.findIndex((x) => x.id === a.stage) - STAGES.findIndex((x) => x.id === b.stage) || a.position - b.position)}
          code={eq?.code ?? ''}
          readOnly={readOnly}
          onNavigate={setViewer}
          onClose={() => setViewer(null)}
          onDelete={() => setToDelete(viewer)}
          onSave={async (caption, stage, position) => {
            must(await supabase.from('photos').update({ caption }).eq('id', viewer.id));
            await move(viewer, stage, position);
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

function PhotoViewer({ photo, photos, code, readOnly, onNavigate, onClose, onDelete, onSave }: {
  photo: Photo; photos: Photo[]; code: string; readOnly: boolean; onNavigate: (p: Photo) => void; onClose: () => void;
  onDelete: () => void; onSave: (caption: string, stage: Stage, position: number) => Promise<void>;
}) {
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [stage, setStage] = useState<Stage>(photo.stage);
  const [position, setPosition] = useState(photo.position);
  const [busy, setBusy] = useState(false);
  const idx = photos.findIndex((p) => p.id === photo.id);
  const stageLabel = STAGES.find((x) => x.id === photo.stage)?.label;

  const go = (p?: Photo) => {
    if (!p) return;
    setCaption(p.caption ?? '');
    setStage(p.stage);
    setPosition(p.position);
    onNavigate(p);
  };

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 920, width: '90vw' }}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} aria-label="Cerrar" onClick={onClose} />}>
            {code} · {stageLabel} · Foto {photo.position} de 3
          </DialogTitle>
          <DialogContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8 }}>
              <Button icon={<ChevronLeft20Regular />} disabled={idx <= 0} onClick={() => go(photos[idx - 1])} aria-label="Anterior" />
              <PhotoThumb path={photo.storage_path} alt={photo.caption ?? ''} height="52vh" fit="contain" />
              <Button icon={<ChevronRight20Regular />} disabled={idx >= photos.length - 1} onClick={() => go(photos[idx + 1])} aria-label="Siguiente" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginTop: 16 }}>
              <Field label="Pie de foto / comentario">
                <Input value={caption} disabled={readOnly} onChange={(_, d) => setCaption(d.value)} />
              </Field>
              <Field label="Etapa">
                <Dropdown disabled={readOnly} value={STAGES.find((x) => x.id === stage)?.label} selectedOptions={[stage]} onOptionSelect={(_, d) => setStage(d.optionValue as Stage)}>
                  {STAGES.map((x) => <Option key={x.id} value={x.id}>{x.label}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Posición">
                <Dropdown disabled={readOnly} value={String(position)} selectedOptions={[String(position)]} onOptionSelect={(_, d) => setPosition(Number(d.optionValue))}>
                  {[1, 2, 3].map((n) => <Option key={n} value={String(n)}>{String(n)}</Option>)}
                </Dropdown>
              </Field>
            </div>
          </DialogContent>
          <DialogActions fluid>
            {!readOnly && <Button icon={<Delete20Regular />} onClick={onDelete} style={{ marginRight: 'auto' }}>Eliminar fotografía</Button>}
            <Button onClick={onClose}>Cancelar</Button>
            {!readOnly && (
              <Button appearance="primary" icon={<Save20Regular />} disabled={busy}
                onClick={async () => { setBusy(true); try { await onSave(caption, stage, position); } finally { setBusy(false); } }}>
                Guardar cambios
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
