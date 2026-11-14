export {};
declare global {
  interface Window {
    __DORO_MAPP__?: {
      saveFile?(name: string, data: string): Promise<void> | void;
      /** 按需读取包内文件并返回 Blob URL。不碰启动时已经读入的图。 */
      loadAsset?(path: string): Promise<string>;
      readBytes?(path: string): Promise<Uint8Array>;
      /** 不传路径则释放全部按需 Blob；传入路径只释放这一张。 */
      releaseAsset?(path?: string): void;
    };
    miniApp?: unknown;
    __DORO_GAME_CHUNK__?: boolean;
    DoroGame?: {readonly boot:()=>Promise<void>};
  }
  var DoroGame: {readonly boot:()=>Promise<void>} | undefined;
  var __DORO_GAME_CHUNK__: boolean | undefined;
}

interface ImportMetaEnv {
  readonly DORO_MAPP?: boolean;
}
