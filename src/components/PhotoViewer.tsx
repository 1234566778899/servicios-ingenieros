import { useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field, Input, Option,
} from '@fluentui/react-components';
import { ChevronLeft20Regular, ChevronRight20Regular, Delete20Regular, Dismiss20Regular, Save20Regular } from '@fluentui/react-icons';
import { PhotoThumb } from './PhotoThumb';
import type { Photo } from '../lib/types';

/** Dónde puede ir una foto: una etapa del equipo (antes/durante/después) o una sección del servicio. */
export interface PhotoSlot { id: string; label: string }

export function PhotoViewer({ photo, photos, slots, slotOf, slotLabel, slotCount, code, readOnly, onNavigate, onClose, onDelete, onSave }: {
  photo: Photo; photos: Photo[]; slots: PhotoSlot[]; slotOf: (p: Photo) => string;
  /** Rótulo del selector: "Etapa" o "Sección" */
  slotLabel: string;
  slotCount: (slot: string) => number; code: string; readOnly: boolean;
  onNavigate: (p: Photo) => void; onClose: () => void; onDelete: () => void;
  onSave: (caption: string, slot: string, position: number) => Promise<void>;
}) {
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [slot, setSlot] = useState(slotOf(photo));
  const [position, setPosition] = useState(photo.position);
  const [busy, setBusy] = useState(false);
  const idx = photos.findIndex((p) => p.id === photo.id);
  const own = slotOf(photo);
  const inSlot = photos.filter((p) => slotOf(p) === own);
  const name = slots.find((x) => x.id === own)?.label;
  // Si cambia de etapa o sección puede ir al final de la nueva (n + 1)
  const maxPos = slot === own ? slotCount(slot) : slotCount(slot) + 1;

  const go = (p?: Photo) => {
    if (!p) return;
    setCaption(p.caption ?? '');
    setSlot(slotOf(p));
    setPosition(p.position);
    onNavigate(p);
  };

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 920, width: '92vw' }}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} aria-label="Cerrar" onClick={onClose} />}>
            {code ? `${code} · ` : ''}{name} · Foto {inSlot.findIndex((p) => p.id === photo.id) + 1} de {inSlot.length}
          </DialogTitle>
          <DialogContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8 }}>
              <Button icon={<ChevronLeft20Regular />} disabled={idx <= 0} onClick={() => go(photos[idx - 1])} aria-label="Anterior" />
              <PhotoThumb path={photo.storage_path} alt={photo.caption ?? ''} height="52vh" fit="contain" full />
              <Button icon={<ChevronRight20Regular />} disabled={idx >= photos.length - 1} onClick={() => go(photos[idx + 1])} aria-label="Siguiente" />
            </div>
            <div className="r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginTop: 16 }}>
              <Field label="Pie de foto / comentario">
                <Input value={caption} disabled={readOnly} onChange={(_, d) => setCaption(d.value)} />
              </Field>
              <Field label={slotLabel}>
                <Dropdown disabled={readOnly} value={slots.find((x) => x.id === slot)?.label} selectedOptions={[slot]}
                  onOptionSelect={(_, d) => {
                    const v = d.optionValue!;
                    setSlot(v);
                    setPosition(v === own ? photo.position : slotCount(v) + 1);
                  }}>
                  {slots.map((x) => <Option key={x.id} value={x.id}>{x.label}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Posición">
                <Dropdown disabled={readOnly} value={String(position)} selectedOptions={[String(position)]} onOptionSelect={(_, d) => setPosition(Number(d.optionValue))}>
                  {Array.from({ length: Math.max(1, maxPos) }, (_, i) => i + 1).map((n) => <Option key={n} value={String(n)}>{String(n)}</Option>)}
                </Dropdown>
              </Field>
            </div>
          </DialogContent>
          <DialogActions fluid>
            {!readOnly && <Button icon={<Delete20Regular />} onClick={onDelete} style={{ marginRight: 'auto' }}>Eliminar fotografía</Button>}
            <Button onClick={onClose}>Cancelar</Button>
            {!readOnly && (
              <Button appearance="primary" icon={<Save20Regular />} disabled={busy}
                onClick={async () => { setBusy(true); try { await onSave(caption, slot, position); } finally { setBusy(false); } }}>
                Guardar cambios
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
