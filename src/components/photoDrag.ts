import { useState, type CSSProperties, type DragEvent } from 'react';
import { tokens } from '@fluentui/react-components';

// Tipo propio en dataTransfer: distingue mover una foto de soltar archivos para subir
const MIME = 'application/x-nordico-photo';
const isPhoto = (e: DragEvent) => e.dataTransfer.types.includes(MIME);

/** Reordenar fotos arrastrándolas, dentro de una etapa/sección o hacia otra. `target` es la etapa o la sección.
 *  `onMove(id, target, position)` recibe la posición final (1…n), igual que los botones de mover antes/después. */
export function usePhotoDrag(onMove: (id: string, target: string, position: number) => void, enabled: boolean) {
  const [drag, setDrag] = useState<{ id: string; target: string; index: number } | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);

  const end = () => { setDrag(null); setOver(null); };

  /** Al soltar sobre la foto `index` de `target`: antes o después según la mitad donde esté el puntero. */
  const drop = (target: string, index: number, after: boolean) => {
    if (!drag) return;
    let position = index + (after ? 2 : 1);
    // En la misma lista la foto arrastrada deja su hueco: las de después corren un lugar
    if (drag.target === target && drag.index < index + (after ? 1 : 0)) position--;
    if (drag.target !== target || position !== drag.index + 1) onMove(drag.id, target, position);
  };

  /** Props para cada foto */
  const tile = (id: string, target: string, index: number) => {
    if (!enabled) return {};
    const side = over?.id === id && drag?.id !== id ? (over.after ? 'right' : 'left') : null;
    const style: CSSProperties = {
      cursor: 'grab',
      opacity: drag?.id === id ? 0.4 : undefined,
      boxShadow: side ? `${side === 'left' ? '-' : ''}4px 0 0 ${tokens.colorBrandStroke1}` : undefined,
    };
    return {
      draggable: true,
      style,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(MIME, id);
        e.dataTransfer.effectAllowed = 'move';
        setDrag({ id, target, index });
      },
      onDragEnd: end,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!isPhoto(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = e.currentTarget.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        if (over?.id !== id || over.after !== after) setOver({ id, after });
      },
      onDragLeave: () => setOver((o) => (o?.id === id ? null : o)),
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!isPhoto(e)) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        drop(target, index, e.clientX > r.left + r.width / 2);
        end();
      },
    };
  };

  return {
    tile,
    isPhoto,
    /** Soltar en el recuadro «Agregar fotos»: la foto va al final de esa etapa/sección */
    dropAtEnd: (target: string, count: number) => {
      if (drag) drop(target, count - 1, true);
      end();
    },
  };
}
