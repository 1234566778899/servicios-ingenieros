import { Toast, ToastBody, ToastTitle, useToastController } from '@fluentui/react-components';
import { friendlyError } from './errors';

export const TOASTER_ID = 'app-toaster';

export function useNotify() {
  const { dispatchToast } = useToastController(TOASTER_ID);
  return (title: string, intent: 'success' | 'error' | 'info' | 'warning' = 'success', body?: string) =>
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
        {body && <ToastBody>{friendlyError(body)}</ToastBody>}
      </Toast>,
      { intent, timeout: intent === 'error' ? 8000 : 4000 },
    );
}
