import { useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input,
} from '@fluentui/react-components';
import { Dismiss20Regular, Save20Regular } from '@fluentui/react-icons';
import { PhotoEditor } from './PhotoEditor';
import type { Annotation } from '../lib/annotations';
import type { Photo } from '../lib/types';

/** Foto abierta: se dibuja encima y se escribe su comentario. El orden y el borrado están en cada miniatura. */
export function PhotoViewer({ photo, title, readOnly, onClose, onSave }: {
  photo: Photo; title: string; readOnly: boolean; onClose: () => void;
  onSave: (caption: string, annotations: Annotation[]) => Promise<void>;
}) {
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [annotations, setAnnotations] = useState<Annotation[]>(photo.annotations ?? []);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 960, width: '94vw' }}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} aria-label="Cerrar" onClick={onClose} />}>
            {title}
          </DialogTitle>
          <DialogContent>
            <PhotoEditor path={photo.storage_path} value={annotations} onChange={setAnnotations} readOnly={readOnly} />
            <Field label="Comentario (va debajo de la foto en el informe)" style={{ marginTop: 12 }}>
              <Input value={caption} disabled={readOnly} placeholder={readOnly ? '' : 'Ej.: Limpieza de serpentín del condensador'}
                onChange={(_, d) => setCaption(d.value)} />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</Button>
            {!readOnly && (
              <Button appearance="primary" icon={<Save20Regular />} disabled={busy}
                onClick={async () => { setBusy(true); try { await onSave(caption.trim(), annotations); } finally { setBusy(false); } }}>
                Guardar
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
