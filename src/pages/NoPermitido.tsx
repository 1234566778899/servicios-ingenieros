import { Button, MessageBar, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';
import { useRouter } from '../lib/router';

export function NoPermitido({ accion }: { accion: string }) {
  const { navigate } = useRouter();
  return (
    <MessageBar intent="warning" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>Acción no permitida</MessageBarTitle>
        No tienes permiso para “{accion}”. Contacta a un Supervisor o Administrador.
        <div style={{ marginTop: 8 }}>
          <Button onClick={() => navigate('/')}>Volver al inicio</Button>
        </div>
      </MessageBarBody>
    </MessageBar>
  );
}
