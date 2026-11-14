import current from './art-frames.json';
import legacy from './art-frames-v2.json';
import {setShapeOutlines} from './geometry';
import {setShapeOutlines as setLegacyOutlines} from './geometry-v2';
import type {BoardShape,Vec2} from './types';

export function installShapeOutlines(): void {
  setShapeOutlines(current.outlines as Partial<Record<BoardShape,Vec2[]>>);
  setShapeOutlines(current.outlines as Partial<Record<BoardShape,Vec2[]>>,'v3');
  setShapeOutlines(current.outlines as Partial<Record<BoardShape,Vec2[]>>,'v4');
  setShapeOutlines(legacy.outlines as Partial<Record<BoardShape,Vec2[]>>,'v2');
  setLegacyOutlines(legacy.outlines as Partial<Record<BoardShape,Vec2[]>>);
}

function packedMiniApp(): boolean {
  try { return Boolean(import.meta.env.DORO_MAPP); }
  catch { return false; }
}

if (!packedMiniApp()) installShapeOutlines();
