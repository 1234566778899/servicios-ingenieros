import { useState, type ReactNode } from 'react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner, tokens,
} from '@fluentui/react-components';

export function ConfirmDialog({ open, title, body, confirmLabel = 'Aceptar', danger, onConfirm, onCancel, children }: {
  open: boolean; title: ReactNode; body?: ReactNode; confirmLabel?: string; danger?: boolean;
  onConfirm: () => Promise<void> | void; onCancel: () => void; children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onCancel()}>
      <DialogSurface style={{ maxWidth: 480 }}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            {body}
            {children}
          </DialogContent>
          <DialogActions>
            <Button onClick={onCancel} disabled={busy}>Cancelar</Button>
            <Button
              appearance="primary"
              disabled={busy}
              style={danger ? { backgroundColor: tokens.colorPaletteRedBackground3 } : undefined}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Spinner size="tiny" /> : confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
