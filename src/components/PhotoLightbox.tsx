import { useEffect } from 'react';
import {
  Button, Caption1, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, Text, tokens,
} from '@fluentui/react-components';
import { ChevronLeft24Regular, ChevronRight24Regular, Dismiss20Regular } from '@fluentui/react-icons';
import { PhotoThumb } from './PhotoThumb';
import type { Photo } from '../lib/types';

/** Visor de solo lectura: la foto completa (con sus anotaciones) y flechas ‹ › o del teclado para pasar a la siguiente. */
export function PhotoLightbox({ photos, index, label, onIndex, onClose }: {
  photos: Photo[]; index: number; label: (p: Photo) => string; onIndex: (i: number) => void; onClose: () => void;
}) {
  const photo = photos[index];
  const prev = () => index > 0 && onIndex(index - 1);
  const next = () => index < photos.length - 1 && onIndex(index + 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const arrow = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: tokens.colorNeutralBackground1 } as const;

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 1200, width: '96vw' }}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} aria-label="Cerrar" onClick={onClose} />}>
            {label(photo)}
          </DialogTitle>
          <DialogContent>
            <div style={{ position: 'relative', background: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium }}>
              <PhotoThumb key={photo.id} path={photo.storage_path} alt={photo.caption ?? label(photo)} full fit="contain"
                height="72vh" annotations={photo.annotations} maxPx={2400} />
              {index > 0 && (
                <Button shape="circular" size="large" icon={<ChevronLeft24Regular />} aria-label="Foto anterior" onClick={prev} style={{ ...arrow, left: 8 }} />
              )}
              {index < photos.length - 1 && (
                <Button shape="circular" size="large" icon={<ChevronRight24Regular />} aria-label="Foto siguiente" onClick={next} style={{ ...arrow, right: 8 }} />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
              <Text>{photo.caption || <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>Sin comentario</Caption1>}</Text>
              <Caption1 style={{ color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' }}>{index + 1} de {photos.length}</Caption1>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
