export {};
declare global {
  interface Window {
    __DORO_MAPP__?: {
      saveFile?(name: string, data: string): Promise<void> | void;
    };
    miniApp?: unknown;
  }
}

interface ImportMetaEnv {
  readonly DORO_MAPP?: boolean;
}
