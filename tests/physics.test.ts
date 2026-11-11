import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { GameEngine } from '../src/core';
import { localOutline, pointInPolygon, remainingOnBoard, setShapeOutlines } from '../src/geometry';
import { capturePlatePhysics, configurePlatePhysics, createPlatePhysics, polygonCentroid, polygonInertia, rotate } from '../src/physics';
import type { PlatePhysicsAdapter } from '../src/physics';
import { SHAPES } from '../src/types';
import type { BoardShape, BoardState, LevelDef, Vec2 } from '../src/types';
import artMetadata from '../src/art-frames.json';
import { getLevel } from '../src/levels';

// 使用 Phaser 实际绑定的 Matter 核心与随包提供的分解器，避开浏览器外壳。
const require = createRequire(import.meta.url);
const root = 'phaser/src/physics/matter-js/';
const Bodies = require(root + 'lib/factory/Bodies.js');
const Body = require(root + 'lib/body/Body.js');
const Engine = require(root + 'lib/core/Engine.js');
const Composite = require(root + 'lib/body/Composite.js');
const Constraint = require(root + 'lib/constraint/Constraint.js');
const Vertices = require(root + 'lib/geometry/Vertices.js');
const Common = require(root + 'lib/core/Common.js');
Common.setDecomp(require(root + 'poly-decomp/index.js'));
setShapeOutlines(artMetadata.outlines);

function simulation() {
  const engine = Engine.create({ positionIterations: 8, velocityIterations: 8, constraintIterations: 4, enableSleeping: false });
  engine.gravity.x = 0; engine.gravity.y = .75;
  const adapter: PlatePhysicsAdapter = {
    fromVertices: (...args) => {
      const body = Bodies.fromVertices(...args);
      Composite.add(engine.world, body);
      return body;
    },
    setAngle: Body.setAngle, setVelocity: Body.setVelocity, setAngularVelocity: Body.setAngularVelocity, setStatic: Body.setStatic,
    addPin: (body, pointA, pointB) => {
      const pin = Constraint.create({ bodyB: body, pointA, pointB, length: 0, stiffness: .97, damping: .14 });
      Composite.add(engine.world, pin);
      return pin;
    },
    removePin: pin => { Composite.remove(engine.world, pin); },
  };
  return { engine, adapter, step: () => Engine.update(engine, 1000 / 60) };
}

function boardFor(shape: BoardShape, width = 176, height = 152, angle = .71): BoardState {
  return { id: shape, shape, color: 'rose', x: 190, y: 180, width, height, angle, depth: 0,
    screws: [], vx: 0, vy: 0, angularVelocity: 0, melted: false, gone: false, falling: false };
}

function assertFinite(body: MatterJS.BodyType): void {
  assert.ok([body.position.x, body.position.y, body.angle, body.velocity.x, body.velocity.y, body.angularVelocity].every(Number.isFinite));
  for (const part of body.parts) assert.ok(part.vertices.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  if (!body.isStatic) assert.ok(Number.isFinite(body.mass) && body.mass > 0 && Number.isFinite(body.inertia) && body.inertia > 0);
}

function distanceSquared(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}

test('18种实际生图轮廓的旋转、非等比缩放、面积与凹口均和物理体重合', () => {
  for (const shape of SHAPES) for (const [width, height, angle] of [[176, 152, .71], [93, 165, -1.12], [182, 113, 0]]) {
    const board = boardFor(shape, width, height, angle), sim = simulation();
    const view = createPlatePhysics(board, sim.adapter);
    const parts = view.body.parts.length > 1 ? view.body.parts.slice(1) : view.body.parts;
    const outline = localOutline(shape).map(point => ({ x: point.x * width, y: point.y * height }));
    const expectedArea = Math.abs(outline.reduce((sum, point, i) => {
      const next = outline[(i + 1) % outline.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2);
    assert.ok(Math.abs(parts.reduce((sum, part) => sum + part.area, 0) - expectedArea) < 1e-5, `${shape} 面积发生变化`);
    const toWorld = (point: Vec2) => {
      const rotated = rotate(point, angle);
      return { x: board.x + rotated.x, y: board.y + rotated.y };
    };
    for (const original of outline) {
      const point = toWorld(original);
      const minimum = Math.min(...parts.flatMap(part => part.vertices.map((a, i) => distanceSquared(point, a, part.vertices[(i + 1) % part.vertices.length]))));
      assert.ok(minimum < 1e-10, `${shape} 原始顶点偏离物理轮廓`);
    }
    // 对凹口和实体同时采样，凸包替代或三角片重叠会被这个检查识别。
    for (let x = -.42; x <= .42; x += .07) for (let y = -.42; y <= .42; y += .07) {
      const local = { x: x * width, y: y * height }, point = toWorld(local);
      const nearBoundary = outline.some((a, i) => distanceSquared(local, a, outline[(i + 1) % outline.length]) < 1e-7);
      if (nearBoundary) continue;
      assert.equal(parts.some(part => Vertices.contains(part.vertices, point)), pointInPolygon(local, outline), `${shape} 凹部或外形失真`);
    }
    capturePlatePhysics(board, view);
    assert.ok(Math.abs(board.x - 190) < 1e-8 && Math.abs(board.y - 180) < 1e-8);
    assertFinite(view.body);
  }
});

for (const shape of SHAPES) {
  test(`${shape}：多钉固定→单钉真实摆动→零钉自由落下，全程有限`, () => {
    const board = boardFor(shape), sim = simulation();
    const view = createPlatePhysics(board, sim.adapter);
    // 首个锚点相对真实质心有确定的重力力矩，避免恰好垂直悬挂的自然平衡局面。
    const pins = [{ x: view.offset.x - .2 * board.width, y: view.offset.y - .1 * board.height }, { x: .15 * board.width, y: .1 * board.height }, { x: -.1 * board.width, y: .2 * board.height }];
    configurePlatePhysics(view, pins, sim.adapter);
    const original = { x: view.body.position.x, y: view.body.position.y, angle: view.body.angle };
    for (let i = 0; i < 30; i++) { sim.step(); assertFinite(view.body); }
    configurePlatePhysics(view, pins.slice(0, 2), sim.adapter);
    for (let i = 0; i < 10; i++) sim.step();
    assert.deepEqual({ x: view.body.position.x, y: view.body.position.y, angle: view.body.angle }, original);
    configurePlatePhysics(view, pins.slice(0, 1), sim.adapter);
    const anchor = { ...view.pin!.pointA };
    let maxAngle = 0, maxError = 0;
    for (let i = 0; i < 180; i++) {
      sim.step(); assertFinite(view.body);
      maxAngle = Math.max(maxAngle, Math.abs(view.body.angle - original.angle));
      const relative = rotate({ x: pins[0].x - view.offset.x, y: pins[0].y - view.offset.y }, view.body.angle);
      const attachment = { x: view.body.position.x + relative.x, y: view.body.position.y + relative.y };
      maxError = Math.max(maxError, Math.hypot(attachment.x - anchor.x, attachment.y - anchor.y));
    }
    assert.ok(maxAngle > .05, `${shape} 没有产生真实摆动`);
    assert.ok(maxError < .02, `${shape} 单钉锚点移动 ${maxError}px`);
    configurePlatePhysics(view, [], sim.adapter);
    assert.equal(view.pin, null);
    assert.equal(Composite.allConstraints(sim.engine.world).length, 0);
    for (let i = 0; i < 180; i++) { sim.step(); assertFinite(view.body); }
    capturePlatePhysics(board, view);
    assert.ok(board.y - Math.hypot(board.width, board.height) / 2 > 440, `${shape} 没有自由落出盘面`);
  });
}

test('单钉摆动存档重建保持坐标和速度，撤回最后一钉后恢复真实约束', () => {
  const board = boardFor('elbow');
  board.screws = [
    { id: 's0', color: 'rose', x: -35, y: -24 },
    { id: 's1', color: 'rose', x: -35, y: 35 },
    { id: 's2', color: 'rose', x: 34, y: 35 },
  ];
  const level: LevelDef = { id: 1, name: '物理恢复', subtitle: '', seed: 1, boards: [board], boxQueue: ['rose'], witness: [] };
  const game = new GameEngine(level), sim = simulation();
  const stateBoard = game.state.boards[0];
  const view = createPlatePhysics(stateBoard, sim.adapter);
  const pins = () => remainingOnBoard(game.state, board.id).map(screw => ({ x: screw.localX, y: screw.localY }));
  configurePlatePhysics(view, pins(), sim.adapter);
  for (const id of ['s0', 's1']) {
    assert.equal(game.dispatch({ type: 'pick', screwId: id }).ok, true);
    configurePlatePhysics(view, pins(), sim.adapter);
  }
  for (let i = 0; i < 43; i++) sim.step();
  capturePlatePhysics(stateBoard, view);
  const saved = game.snapshot();
  const resumed = new GameEngine(level, JSON.parse(JSON.stringify(saved)));
  const resumedSim = simulation(), resumedBoard = resumed.state.boards[0];
  const resumedView = createPlatePhysics(resumedBoard, resumedSim.adapter);
  configurePlatePhysics(resumedView, [{ x: 34, y: 35 }], resumedSim.adapter);
  capturePlatePhysics(resumedBoard, resumedView);
  for (const key of ['x', 'y', 'angle', 'vx', 'vy', 'angularVelocity'] as const) assert.ok(Math.abs(resumedBoard[key] - saved.boards[0][key]) < 1e-9, `重建改变 ${key}`);
  for (let i = 0; i < 20; i++) { sim.step(); resumedSim.step(); }
  assert.ok(Math.hypot(view.body.position.x - resumedView.body.position.x, view.body.position.y - resumedView.body.position.y) < .1);
  capturePlatePhysics(stateBoard, view);
  const beforeLast = game.snapshot();
  assert.equal(game.dispatch({ type: 'pick', screwId: 's2' }).ok, true);
  configurePlatePhysics(view, [], sim.adapter);
  for (let i = 0; i < 12; i++) sim.step();
  assert.equal(game.undo(), true);
  assert.deepEqual({...game.snapshot(),stats:beforeLast.stats,actionRevision:beforeLast.actionRevision}, beforeLast);
  assert.equal(game.state.stats.undos,beforeLast.stats.undos+1);
  const undoSim = simulation(), undoView = createPlatePhysics(game.state.boards[0], undoSim.adapter);
  configurePlatePhysics(undoView, [{ x: 34, y: 35 }], undoSim.adapter);
  const anchor = { ...undoView.pin!.pointA };
  for (let i = 0; i < 120; i++) { undoSim.step(); assertFinite(undoView.body); }
  const attachment = Constraint.pointBWorld(undoView.pin);
  assert.ok(Math.hypot(attachment.x - anchor.x, attachment.y - anchor.y) < .02);
  assert.equal(game.state.phase, 'playing');
});

test('capture先拒绝NaN，不把非有限姿态写进规则存档', () => {
  const board = boardFor('heart'), before = JSON.stringify(board), sim = simulation();
  const view = createPlatePhysics(board, sim.adapter);
  view.body.position.x = NaN;
  assert.throws(() => capturePlatePhysics(board, view), /非有限值/);
  assert.equal(JSON.stringify(board), before);
});

test('整体轮廓惯性满足矩形解析值、平移与绕序不变性', () => {
  const rectangle = [{ x: -60, y: -40 }, { x: 60, y: -40 }, { x: 60, y: 40 }, { x: -60, y: 40 }];
  const mass = 12, expected = 4 * mass * (120 ** 2 + 80 ** 2) / 12;
  assert.ok(Math.abs(polygonInertia(rectangle, polygonCentroid(rectangle), mass) - expected) < 1e-8);
  const translated = rectangle.map(point => ({ x: point.x + 171, y: point.y - 85 }));
  assert.ok(Math.abs(polygonInertia(translated, polygonCentroid(translated), mass) - expected) < 1e-8);
  assert.ok(Math.abs(polygonInertia([...rectangle].reverse(), polygonCentroid(rectangle), mass) - expected) < 1e-8);
});

test('所有战役板件每一个真实末钉位置，3→2→1后600帧图形锚点稳定', () => {
  let testedPins = 0;
  for (let id = 1; id <= 30; id++) for (const definition of getLevel(id).boards) {
    for (const remaining of definition.screws) {
      const board: BoardState = { ...definition, vx: 0, vy: 0, angularVelocity: 0, melted: false, gone: false, falling: false };
      const sim = simulation(), view = createPlatePhysics(board, sim.adapter);
      const otherPins = definition.screws.filter(screw => screw.id !== remaining.id);
      configurePlatePhysics(view, [...otherPins, remaining], sim.adapter);
      sim.step();
      configurePlatePhysics(view, [otherPins[0], remaining], sim.adapter);
      sim.step();
      configurePlatePhysics(view, [remaining], sim.adapter);
      const fixed = { ...view.pin!.pointA };
      let maxDrift = 0;
      for (let frame = 0; frame < 600; frame++) {
        sim.step();
        assertFinite(view.body);
        capturePlatePhysics(board, view);
        // 验收真正随图片绘制的位置，不能只读取 Constraint 缓存的 pointB。
        const relative = rotate(remaining, board.angle);
        maxDrift = Math.max(maxDrift, Math.hypot(board.x + relative.x - fixed.x, board.y + relative.y - fixed.y));
      }
      assert.ok(maxDrift < .05, `${remaining.id} 的真实图形锚点漂移 ${maxDrift}px`);
      assert.ok(Math.abs(board.angle - definition.angle) < Math.PI * 2, `${remaining.id} 产生无外力持续旋转`);
      testedPins++;
    }
  }
  assert.ok(testedPins > 1000);
});
