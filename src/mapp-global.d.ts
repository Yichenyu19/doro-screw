export {};
declare global {
  interface Window {
    __DORO_MAPP__?: {
      saveFile?(name: string, data: string): Promise<void> | void;
      /** 按需读取包内文件并返回 Blob URL。同一时间只保留一张高清图。 */
      loadAsset?(path: string): Promise<string>;
      releaseAsset?(): void;
    };
    miniApp?: unknown;
  }
}

interface ImportMetaEnv {
  readonly DORO_MAPP?: boolean;
}
