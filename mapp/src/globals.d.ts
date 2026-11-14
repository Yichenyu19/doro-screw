var __DORO_CHECK__: boolean | undefined;

interface Window {
  __DORO_MAPP__?: {
    saveFile?(name: string, data: string): Promise<void> | void;
    loadAsset?(path: string): Promise<string>;
    readBytes?(path: string): Promise<Uint8Array>;
    releaseAsset?(path?: string): void;
  };
}

declare module "phaser/src/physics/matter-js/lib/factory/Bodies.js";
declare module "phaser/src/physics/matter-js/lib/body/Body.js";
declare module "phaser/src/physics/matter-js/lib/core/Engine.js";
declare module "phaser/src/physics/matter-js/lib/body/Composite.js";
declare module "phaser/src/physics/matter-js/lib/constraint/Constraint.js";
declare module "phaser/src/physics/matter-js/lib/core/Common.js";
declare module "phaser/src/physics/matter-js/poly-decomp/index.js";
