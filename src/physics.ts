import { localOutline } from './geometry';
import type { BoardState, Vec2 } from './types';

export interface PlatePhysics {
  body: MatterJS.BodyType;
  offset: Vec2;
  pin: MatterJS.ConstraintType | null;
  remaining: number;
}

interface PlateOptions {
  isStatic: boolean;
  frictionAir: number;
  restitution: number;
  collisionFilter: { category: number; mask: number; group: number };
}

export interface PlatePhysicsAdapter {
  fromVertices(x: number, y: number, vertices: Vec2[][], options: PlateOptions, flagInternal: boolean, removeCollinear: number, minimumArea: number): MatterJS.BodyType;
  setAngle(body: MatterJS.BodyType, angle: number): unknown;
  setVelocity(body: MatterJS.BodyType, velocity: Vec2): unknown;
  setAngularVelocity(body: MatterJS.BodyType, velocity: number): unknown;
  setStatic(body: MatterJS.BodyType, value: boolean): unknown;
  addPin(body: MatterJS.BodyType, pointA: Vec2, pointB: Vec2): MatterJS.ConstraintType;
  removePin(pin: MatterJS.ConstraintType): void;
}

export const rotate = (point: Vec2, angle: number): Vec2 => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});

export function polygonCentroid(points: Vec2[]): Vec2 {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const cross = p.x * q.y - q.x * p.y;
    area += cross; x += (p.x + q.x) * cross; y += (p.y + q.y) * cross;
  }
  return Math.abs(area) < 1e-8 ? { x: 0, y: 0 } : { x: x / (3 * area), y: y / (3 * area) };
}

export function polygonInertia(points: Vec2[], center: Vec2, mass: number): number {
  let numerator = 0, denominator = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i], next = points[(i + 1) % points.length];
    const a = { x: point.x - center.x, y: point.y - center.y };
    const b = { x: next.x - center.x, y: next.y - center.y };
    const cross = a.x * b.y - b.x * a.y;
    numerator += cross * (a.x * a.x + a.x * b.x + b.x * b.x + a.y * a.y + a.y * b.y + b.y * b.y);
    denominator += cross;
  }
  // 有符号面积积分在凹轮廓上仍成立；4 与当前 Phaser Matter 的 Body._inertiaScale 一致。
  const inertia = 4 * mass * numerator / (6 * denominator);
  if (!Number.isFinite(inertia) || inertia <= 0) throw new Error('板件的质心转动惯量无效');
  return inertia;
}

export function createPlatePhysics(board: BoardState, adapter: PlatePhysicsAdapter): PlatePhysics {
  const outline = localOutline(board.shape,board.geometryVersion).map(point => ({ x: point.x * board.width, y: point.y * board.height }));
  const offset = polygonCentroid(outline);
  const rotated = rotate(offset, board.angle);
  // Phaser 内置 poly-decomp；整体凹轮廓必须一次输入，保留各分片之间的位置关系。
  // 先动态创建，再通过 setStatic 固定，Matter 才能保存可恢复的有限质量和转动惯量。
  const body = adapter.fromVertices(board.x + rotated.x, board.y + rotated.y, [outline], {
    isStatic: false, frictionAir: .025, restitution: .1,
    collisionFilter: { category: 1, mask: 0, group: -1 },
  }, true, 0, 0);
  if (!body) throw new Error(`板件物理轮廓创建失败：${board.id}`);
  // Matter 对复合体只累加分片自身惯量，缺少平行轴项；使用完整轮廓积分避免边缘钉位数值增能。
  // 这与 Body.setInertia 的两个字段写入相同，并发生在首次 setStatic 备份之前。
  body.inertia = polygonInertia(outline, offset, body.mass);
  body.inverseInertia = 1 / body.inertia;
  adapter.setAngle(body, board.angle);
  adapter.setVelocity(body, { x: board.vx, y: board.vy });
  adapter.setAngularVelocity(body, board.angularVelocity);
  return { body, offset, pin: null, remaining: -1 };
}

export function configurePlatePhysics(view: PlatePhysics, localPins: Vec2[], adapter: PlatePhysicsAdapter): void {
  const count = localPins.length;
  if (view.remaining === count) return;
  if (view.pin) { adapter.removePin(view.pin); view.pin = null; }
  adapter.setStatic(view.body, count >= 2);
  if (count === 1) {
    const pointB = rotate({ x: localPins[0].x - view.offset.x, y: localPins[0].y - view.offset.y }, view.body.angle);
    const pointA = { x: view.body.position.x + pointB.x, y: view.body.position.y + pointB.y };
    // Matter 会按后续 angle 差增量旋转 pointB，因此初始化时需要当前已旋转的偏移。
    view.pin = adapter.addPin(view.body, pointA, pointB);
  }
  view.remaining = count;
}

export function capturePlatePhysics(board: BoardState, view: PlatePhysics): void {
  const { body } = view;
  if (![body.position.x, body.position.y, body.angle, body.velocity.x, body.velocity.y, body.angularVelocity].every(Number.isFinite)) {
    throw new Error(`板件物理状态出现非有限值：${board.id}`);
  }
  const offset = rotate(view.offset, body.angle);
  board.x = body.position.x - offset.x; board.y = body.position.y - offset.y;
  board.angle = body.angle;
  board.vx = body.velocity.x; board.vy = body.velocity.y; board.angularVelocity = body.angularVelocity;
}
