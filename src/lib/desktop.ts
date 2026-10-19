interface DesktopApi {
  htmlToPdf(html: string): Promise<Uint8Array>;
  saveFile(name: string, data: Uint8Array): Promise<string | null>;
  openFile(name: string, data: Uint8Array): Promise<string | null>;
  onNavigate(cb: (route: string) => void): () => void;
  onLogout(cb: () => void): () => void;
}

declare global {
  interface Window { desktop?: DesktopApi }
}

export const desktop = window.desktop;
