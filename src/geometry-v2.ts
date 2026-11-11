import type { BoardDef, BoardShape, BoardState, GameState, ScrewState, Vec2 } from './types';

/** 轮廓只用于点击、遮挡和物理，不绘制可见美术。 */
export const SCREW_RADIUS = 14;

function ellipse(count = 32): Vec2[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count;
    return { x: Math.cos(angle) * .5, y: Math.sin(angle) * .5 };
  });
}

function roundedRect(radius: number): Vec2[] {
  const points: Vec2[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const angle = corner * Math.PI / 2;
    const cx = (corner === 0 || corner === 3 ? 1 : -1) * (.5 - radius);
    const cy = (corner < 2 ? 1 : -1) * (.5 - radius);
    for (let j = 0; j <= 5; j++) {
      const a = angle + j * Math.PI / 10;
      points.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
  }
  return points;
}

function radial(radii: number[], startAngle = -Math.PI / 2): Vec2[] {
  return radii.map((radius, index) => {
    const angle = startAngle + index * Math.PI * 2 / radii.length;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function cOutline(): Vec2[] {
  const outer = Array.from({ length: 25 }, (_, index) => {
    const angle = Math.PI / 4 + index * Math.PI * 1.5 / 24;
    return { x: Math.cos(angle) * .5, y: Math.sin(angle) * .5 };
  });
  const inner = Array.from({ length: 25 }, (_, index) => {
    const angle = Math.PI * 1.75 - index * Math.PI * 1.5 / 24;
    return { x: Math.cos(angle) * .23, y: Math.sin(angle) * .23 };
  });
  return [...outer, ...inner];
}

const outlines: Record<BoardShape, Vec2[]> = {
  capsule: roundedRect(.32),
  disc: ellipse(),
  triangle: [{ x: 0, y: -.5 }, { x: .5, y: .5 }, { x: -.5, y: .5 }],
  square: roundedRect(.09),
  diamond: [{ x: 0, y: -.5 }, { x: .5, y: 0 }, { x: 0, y: .5 }, { x: -.5, y: 0 }],
  heart: [
    { x: 0, y: -.28 }, { x: .12, y: -.45 }, { x: .3, y: -.5 },
    { x: .45, y: -.36 }, { x: .5, y: -.15 }, { x: .45, y: .03 },
    { x: .3, y: .23 }, { x: 0, y: .5 }, { x: -.3, y: .23 },
    { x: -.45, y: .03 }, { x: -.5, y: -.15 }, { x: -.45, y: -.36 },
    { x: -.3, y: -.5 }, { x: -.12, y: -.45 },
  ],
  cloud: [
    { x: -.5, y: .03 }, { x: -.46, y: -.16 }, { x: -.31, y: -.25 },
    { x: -.3, y: -.4 }, { x: -.16, y: -.5 }, { x: .03, y: -.45 },
    { x: .16, y: -.3 }, { x: .32, y: -.37 }, { x: .46, y: -.25 },
    { x: .48, y: -.05 }, { x: .5, y: .17 }, { x: .35, y: .4 },
    { x: .12, y: .47 }, { x: -.16, y: .5 }, { x: -.4, y: .34 },
  ],
  bow: [
    { x: -.5, y: -.5 }, { x: -.3, y: -.48 }, { x: 0, y: -.25 },
    { x: .3, y: -.48 }, { x: .5, y: -.5 }, { x: .5, y: .5 },
    { x: .3, y: .48 }, { x: 0, y: .25 }, { x: -.3, y: .48 }, { x: -.5, y: .5 },
  ],
  star: radial([.5, .3, .5, .3, .5, .3, .5, .3, .5, .3]),
  elbow: [
    { x: -.5, y: -.5 }, { x: .05, y: -.5 }, { x: .05, y: -.04 },
    { x: .5, y: -.04 }, { x: .5, y: .5 }, { x: -.5, y: .5 },
  ],
  leaf: [
    { x: -.5, y: .5 }, { x: -.48, y: .05 }, { x: -.34, y: -.28 },
    { x: -.08, y: -.44 }, { x: .5, y: -.5 }, { x: .48, y: -.06 },
    { x: .34, y: .26 }, { x: .07, y: .43 },
  ],
  doro: [
    { x: -.46, y: -.13 }, { x: -.47, y: -.4 }, { x: -.27, y: -.5 },
    { x: -.08, y: -.38 }, { x: .15, y: -.4 }, { x: .35, y: -.28 },
    { x: .47, y: -.03 }, { x: .5, y: .23 }, { x: .4, y: .27 },
    { x: .39, y: .5 }, { x: .2, y: .5 }, { x: .17, y: .32 },
    { x: -.1, y: .34 }, { x: -.12, y: .5 }, { x: -.32, y: .5 },
    { x: -.35, y: .25 }, { x: -.5, y: .16 },
  ],
  cross: [
    { x: -.19, y: -.5 }, { x: .19, y: -.5 }, { x: .19, y: -.19 },
    { x: .5, y: -.19 }, { x: .5, y: .19 }, { x: .19, y: .19 },
    { x: .19, y: .5 }, { x: -.19, y: .5 }, { x: -.19, y: .19 },
    { x: -.5, y: .19 }, { x: -.5, y: -.19 }, { x: -.19, y: -.19 },
  ],
  flower: radial(Array.from({ length: 64 }, (_, index) => .405 + .095 * Math.cos(index * Math.PI / 4))),
  crescent: [
    { x: .45, y: -.46 }, { x: .04, y: -.5 }, { x: -.28, y: -.38 },
    { x: -.46, y: -.17 }, { x: -.5, y: .08 }, { x: -.35, y: .34 },
    { x: -.06, y: .49 }, { x: .42, y: .46 }, { x: .12, y: .28 },
    { x: -.02, y: .08 }, { x: -.03, y: -.12 }, { x: .12, y: -.33 },
  ],
  cshape: cOutline(),
  notchedSquare: [
    { x: -.5, y: -.5 }, { x: -.16, y: -.5 }, { x: -.16, y: -.3 }, { x: .16, y: -.3 },
    { x: .16, y: -.5 }, { x: .5, y: -.5 }, { x: .5, y: -.16 }, { x: .3, y: -.16 },
    { x: .3, y: .16 }, { x: .5, y: .16 }, { x: .5, y: .5 }, { x: .16, y: .5 },
    { x: .16, y: .3 }, { x: -.16, y: .3 }, { x: -.16, y: .5 }, { x: -.5, y: .5 },
    { x: -.5, y: .16 }, { x: -.3, y: .16 }, { x: -.3, y: -.16 }, { x: -.5, y: -.16 },
  ],
  zigzag: [
    { x: -.5, y: -.5 }, { x: .5, y: -.5 }, { x: .5, y: -.24 }, { x: -.1, y: .24 },
    { x: .5, y: .24 }, { x: .5, y: .5 }, { x: -.5, y: .5 }, { x: -.5, y: .22 },
    { x: .1, y: -.24 }, { x: -.5, y: -.24 },
  ],
};

let shapeOverrides: Partial<Record<BoardShape, Vec2[]>> = {};
let outlineRevision = 0;

interface CachedGeometry {
  x: number; y: number; angle: number; width: number; height: number; shape: BoardShape; revision: number;
  polygon: Vec2[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}
const boardGeometry = new WeakMap<BoardDef | BoardState, CachedGeometry>();
interface StateIndex {
  boards: GameState['boards']; screws: GameState['screws']; boardCount: number; screwCount: number;
  boardById: Map<string, { board: BoardState; index: number }>;
  screwById: Map<string, ScrewState>;
  screwsByBoard: Map<string, ScrewState[]>;
}
const stateIndices = new WeakMap<GameState, StateIndex>();

function indexOf(state: GameState): StateIndex {
  const cached = stateIndices.get(state);
  if (cached && cached.boards === state.boards && cached.screws === state.screws &&
      cached.boardCount === state.boards.length && cached.screwCount === state.screws.length) return cached;
  const index: StateIndex = { boards: state.boards, screws: state.screws, boardCount: state.boards.length, screwCount: state.screws.length,
    boardById: new Map(state.boards.map((board, order) => [board.id, { board, index: order }])),
    screwById: new Map(state.screws.map(screw => [screw.id, screw])), screwsByBoard: new Map() };
  for (const screw of state.screws) {
    const group = index.screwsByBoard.get(screw.boardId) ?? [];
    group.push(screw); index.screwsByBoard.set(screw.boardId, group);
  }
  stateIndices.set(state, index);
  return index;
}

/** 图集加载后可传入由透明通道提取的轮廓；空对象恢复全部默认轮廓。 */
export function setShapeOutlines(replacements: Partial<Record<BoardShape, Vec2[]>>): void {
  const next: Partial<Record<BoardShape, Vec2[]>> = {};
  for (const [key, points] of Object.entries(replacements)) {
    if (!(key in outlines) || !points || points.length < 3 || points.some(point =>
      !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > .500001 || Math.abs(point.y) > .500001)) {
      throw new Error(`无效板件轮廓：${key}`);
    }
    next[key as BoardShape] = points.map(point => ({ ...point }));
  }
  shapeOverrides = next;
  outlineRevision++;
}

export function localOutline(shape: BoardShape): Vec2[] {
  return (shapeOverrides[shape] ?? outlines[shape]).map(point => ({ ...point }));
}

function cachedGeometry(board: BoardDef | BoardState): CachedGeometry {
  const cached = boardGeometry.get(board);
  if (cached && cached.x === board.x && cached.y === board.y && cached.angle === board.angle &&
      cached.width === board.width && cached.height === board.height && cached.shape === board.shape && cached.revision === outlineRevision) return cached;
  const cos = Math.cos(board.angle), sin = Math.sin(board.angle);
  const polygon = (shapeOverrides[board.shape] ?? outlines[board.shape]).map(point => {
    const x = point.x * board.width, y = point.y * board.height;
    return { x: board.x + x * cos - y * sin, y: board.y + x * sin + y * cos };
  });
  const result: CachedGeometry = { x: board.x, y: board.y, angle: board.angle, width: board.width, height: board.height,
    shape: board.shape, revision: outlineRevision, polygon,
    bounds: { minX: Math.min(...polygon.map(point => point.x)), maxX: Math.max(...polygon.map(point => point.x)),
      minY: Math.min(...polygon.map(point => point.y)), maxY: Math.max(...polygon.map(point => point.y)) } };
  boardGeometry.set(board, result);
  return result;
}

export function boardPolygon(board: BoardDef | BoardState): Vec2[] {
  // 对外返回副本，避免调用方修改缓存；遮挡热路径直接读取内部缓存。
  return cachedGeometry(board).polygon.map(point => ({ ...point }));
}

export function boardBounds(board: BoardDef | BoardState): CachedGeometry['bounds'] {
  return { ...cachedGeometry(board).bounds };
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    const dot = (point.x - a.x) * (point.x - b.x) + (point.y - a.y) * (point.y - b.y);
    if (Math.abs(cross) < 1e-7 && dot <= 1e-7) return true;
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function screwPosition(screw: ScrewState, board: BoardDef | BoardState): Vec2 {
  if (screw.detached) return { x: screw.x, y: screw.y };
  const cos = Math.cos(board.angle), sin = Math.sin(board.angle);
  return { x: board.x + screw.localX * cos - screw.localY * sin,
    y: board.y + screw.localX * sin + screw.localY * cos };
}

export function remainingOnBoard(state: GameState, boardId: string): ScrewState[] {
  return (indexOf(state).screwsByBoard.get(boardId) ?? []).filter(screw => screw.place === 'board' && !screw.detached);
}

function distanceToSegmentSquared(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}

export function isScrewExposed(state: GameState, id: string): boolean {
  const lookup = indexOf(state);
  const screw = lookup.screwById.get(id);
  if (!screw || screw.place !== 'board') return false;
  const own = lookup.boardById.get(screw.boardId);
  const ownIndex = own?.index ?? -1;
  const ownBoard = own?.board;
  if (!ownBoard || (ownBoard.gone && !screw.detached)) return false;
  const position = screwPosition(screw, ownBoard);
  for (let index = 0; index < state.boards.length; index++) {
    const board = state.boards[index];
    if (index === ownIndex || board.melted || board.gone) continue;
    if (board.depth < ownBoard.depth || (board.depth === ownBoard.depth && index < ownIndex)) continue;
    const geometry = cachedGeometry(board), { minX, minY, maxX, maxY } = geometry.bounds;
    if (position.x + SCREW_RADIUS < minX || position.x - SCREW_RADIUS > maxX ||
        position.y + SCREW_RADIUS < minY || position.y - SCREW_RADIUS > maxY) continue;
    const polygon = geometry.polygon;
    if (pointInPolygon(position, polygon)) return false;
    // 按完整螺丝头判断，避免中心未遮挡而边缘仍埋在玻璃下时穿透点击。
    for (let i = 0; i < polygon.length; i++) {
      if (distanceToSegmentSquared(position, polygon[i], polygon[(i + 1) % polygon.length]) <= SCREW_RADIUS ** 2) return false;
    }
  }
  return true;
}
