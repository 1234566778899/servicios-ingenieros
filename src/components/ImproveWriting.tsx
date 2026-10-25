import { useState } from 'react';
import {
  Button, Caption1, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner, Text,
  Tooltip, makeStyles, tokens,
} from '@fluentui/react-components';
import { Wand20Regular } from '@fluentui/react-icons';
import { supabase } from '../lib/supabase';
import { useNotify } from '../lib/toast';

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '60vh', overflow: 'auto' },
  row: { display: 'grid', gridTemplateColumns: '28px 1fr', gap: '8px', alignItems: 'start', paddingBottom: '12px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  before: { color: tokens.colorNeutralForeground3, textDecorationLine: 'line-through', display: 'block', marginBottom: '4px' },
  after: { display: 'block' },
});

/** Pide a la Edge Function (Gemini) una versión mejor redactada de cada texto, en el mismo orden. */
export async function improveWriting(texts: string[], kind: string, specialty: string): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke('mejorar-redaccion', { body: { texts, kind, specialty } });
  if (error) {
    // El detalle del error viene en el cuerpo de la respuesta
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  return data.texts as string[];
}

/**
 * Botón "Mejorar redacción": muestra cada texto con su versión sugerida para aceptarla o no.
 * Nunca reemplaza sin revisión: el informe lo firma la empresa.
 */
export function ImproveButton({ texts, kind, specialty, onApply, size = 'medium', tooltip = 'Mejorar redacción con IA' }: {
  texts: string[]; kind: string; specialty: string; onApply: (texts: string[]) => void;
  size?: 'small' | 'medium'; tooltip?: string;
}) {
  const s = useStyles();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const items = texts.map((t) => t.trim());
  const usable = items.filter(Boolean);

  const run = async () => {
    setBusy(true);
    try {
      const out = await improveWriting(usable, kind, specialty);
      // Vuelve a ubicar cada sugerencia en su posición original (los vacíos no se envían)
      let k = 0;
      const full = items.map((t) => (t ? out[k++] : t));
      const changed = full.map((t, i) => (t !== items[i] ? i : -1)).filter((i) => i >= 0);
      if (!changed.length) return notify('La redacción ya está bien', 'info', 'Gemini no sugirió cambios.');
      setKeep(new Set(changed));
      setResult(full);
    } catch (e: any) {
      notify('No se pudo mejorar la redacción', 'error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const changed = result ? result.map((t, i) => (t !== items[i] ? i : -1)).filter((i) => i >= 0) : [];

  return (
    <>
      <Tooltip content={tooltip} relationship="label">
        <Button size={size} appearance="subtle" icon={busy ? <Spinner size="tiny" /> : <Wand20Regular />}
          disabled={busy || !usable.length} onClick={run} />
      </Tooltip>
      <Dialog open={!!result} onOpenChange={(_, d) => !d.open && setResult(null)}>
        <DialogSurface style={{ maxWidth: 760 }}>
          <DialogBody>
            <DialogTitle>Redacción sugerida</DialogTitle>
            <DialogContent>
              <Caption1 block style={{ marginBottom: 12, color: tokens.colorNeutralForeground3 }}>
                Revisa cada sugerencia: la IA solo corrige la redacción, pero verifica que no haya cambiado ningún dato.
              </Caption1>
              <div className={s.list}>
                {changed.map((i) => (
                  <label key={i} className={s.row}>
                    <Checkbox checked={keep.has(i)} aria-label={`Aplicar cambio ${i + 1}`}
                      onChange={(_, d) => setKeep((x) => { const n = new Set(x); if (d.checked) n.add(i); else n.delete(i); return n; })} />
                    <div>
                      <Text size={200} className={s.before}>{items[i]}</Text>
                      <Text className={s.after}>{result![i]}</Text>
                    </div>
                  </label>
                ))}
              </div>
              {changed.length < usable.length && (
                <Caption1 block style={{ marginTop: 8 }}>{usable.length - changed.length} texto(s) ya estaban bien y no cambian.</Caption1>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setResult(null)}>Descartar</Button>
              <Button appearance="primary" disabled={!keep.size}
                onClick={() => { onApply(texts.map((t, i) => (keep.has(i) ? result![i] : t))); setResult(null); }}>
                Aplicar {keep.size} {keep.size === 1 ? 'cambio' : 'cambios'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
