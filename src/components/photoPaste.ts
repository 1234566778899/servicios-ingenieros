import { useEffect, useRef, useState } from 'react';

/**
 * Pegar fotos con Ctrl+V (captura de pantalla, imagen copiada de WhatsApp, del navegador…).
 * Van a la etapa o sección «activa»: la última que se tocó o sobre la que está el ratón (por defecto la primera).
 * No interfiere al pegar texto en un campo, ni cuando hay un diálogo abierto.
 */
export function usePhotoPaste(enabled: boolean, defaultTarget: string, onPaste: (target: string, files: File[]) => void) {
  const [target, setTarget] = useState('');
  const current = target || defaultTarget;
  const latest = useRef({ current, onPaste });
  latest.current = { current, onPaste };

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data || !latest.current.current) return;
      const files = [...data.files].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      // Diálogos (visor de fotos, confirmaciones): ahí no se pegan fotos al servicio
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      // En un campo de texto, si también se copió texto (p. ej. desde Word) se deja pegar el texto
      const el = document.activeElement as HTMLElement | null;
      const editable = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName));
      if (editable && data.types.includes('text/plain')) return;
      e.preventDefault();
      // El portapapeles da nombres genéricos («image.png»): se renombran para que se distingan
      const named = files.map((f, i) => new File([f], `pegada-${Date.now()}-${i + 1}.${f.type.split('/')[1] || 'png'}`, { type: f.type }));
      latest.current.onPaste(latest.current.current, named);
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [enabled]);

  /** Props para el contenedor de cada etapa o sección: al pasar el ratón o tocar algo dentro, pasa a ser el destino. */
  const zone = (key: string) => ({
    onMouseEnter: () => setTarget(key),
    onFocusCapture: () => setTarget(key),
    onPointerDown: () => setTarget(key),
  });

  return { target: current, zone };
}
