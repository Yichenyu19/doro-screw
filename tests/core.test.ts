import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, assertConservation, occupiedBuffer } from '../src/core';
import { boardPolygon, isScrewExposed, localOutline, pointInPolygon, remainingOnBoard, screwPosition, setShapeOutlines } from '../src/geometry';
import { COLORS, SHAPES } from '../src/types';
import type { BoardDef, ColorId, GameEvent, GameState, LevelDef } from '../src/types';

function level(colors: ColorId[], queue: ColorId[]): LevelDef {
  return { id: 1, name: '规则验收', subtitle: '', seed: 1, boxQueue: queue, witness: [],
    boards: colors.map((color, index) => ({ id: `board-${index}`, shape: 'square', color,
      x: 100 + index * 100, y: 100, width: 50, height: 50, angle: 0, depth: index,
      screws: [{ id: `s-${index}`, color, x: 0, y: 0 }] })),
  };
}

function pick(engine: GameEngine, index: number): GameEvent[] {
  const result = engine.dispatch({ type: 'pick', screwId: `s-${index}` });
  assert.equal(result.ok, true, `第 ${index} 颗应当可拆：${result.reason}`);
  assertConservation(engine.state);
  return result.events;
}

test('初始两盒五孔、同色左优先、快速重复点击只收取一次', () => {
  const engine = new GameEngine(level(Array(6).fill('rose'), ['rose', 'rose']));
  assert.equal(engine.state.boxes.length, 2);
  assert.equal(engine.state.capacity, 5);
  assert.equal(engine.state.version, 3);
  assert.deepEqual(engine.state.buffer, Array(5).fill(null));
  pick(engine, 0);
  assert.deepEqual(engine.state.boxes[0].screws, ['s-0']);
  assert.deepEqual(engine.state.boxes[1].screws, []);
  assert.equal(engine.dispatch({ type: 'pick', screwId: 's-0' }).ok, false);
  assert.equal(engine.state.moves, 1);
  pick(engine, 1);
  pick(engine, 2);
  assert.equal(engine.state.boxes[0].completed, 1);
  assert.equal(engine.state.boxes[0].color, null);
  pick(engine, 3);
  assert.deepEqual(engine.state.boxes[1].screws, ['s-3']);
});

test('完成盒后链式回流，先回流再判断满格和胜负', () => {
  const engine = new GameEngine(level(
    ['green', 'green', 'green', 'orange', 'rose', 'rose', 'rose', 'blue', 'blue', 'blue', 'orange', 'orange'],
    ['rose', 'blue', 'green', 'orange']));
  for (const index of [0, 1, 2, 3]) pick(engine, index);
  assert.equal(occupiedBuffer(engine.state), 4);
  pick(engine, 4); pick(engine, 5);
  const events = pick(engine, 6);
  assert.equal(events.filter(event => event.type === 'box-completed').length, 2);
  assert.equal(events.some(event => event.type === 'stuck'), false);
  assert.equal(occupiedBuffer(engine.state), 0);
  assert.equal(engine.state.boxes[0].color, 'orange');
  assert.deepEqual(engine.state.boxes[0].screws, ['s-3']);
  for (const index of [10, 11, 7, 8]) pick(engine, index);
  const final = pick(engine, 9);
  assert.equal(engine.state.phase, 'won');
  assert.equal(engine.state.collected.length, 12);
  assert.equal(final.filter(event => event.type === 'won').length, 1);
  assert.equal(engine.dispatch({ type: 'pick', screwId: 's-9' }).ok, false);
});

test('满五孔进入救场，扩盒立即回流而不丢螺丝', () => {
  const engine = new GameEngine(level(
    [...Array<ColorId>(6).fill('green'), ...Array<ColorId>(3).fill('rose'), ...Array<ColorId>(3).fill('blue')],
    ['rose', 'blue', 'green', 'green']));
  for (let index = 0; index < 5; index++) pick(engine, index);
  assert.equal(engine.state.phase, 'stuck');
  assert.equal(engine.canPick('s-5'), false);
  assert.deepEqual(engine.available(), []);
  assert.equal(engine.dispatch({ type: 'expand-box' }).ok, true);
  assert.equal(engine.state.boxes.length, 3);
  assert.equal(engine.state.phase, 'playing');
  assert.equal(occupiedBuffer(engine.state), 0);
  assert.equal(engine.state.collected.length, 3);
  assert.equal(engine.state.boxes[2].screws.length, 2);
  for (let index = 5; index < 12; index++) pick(engine, index);
  assert.equal(engine.state.phase, 'won');
});

test('清暂存进入口袋且后续按需求回填，暂存优先于口袋', () => {
  const engine = new GameEngine(level(
    ['green', 'green', 'green', 'rose', 'rose', 'rose', 'blue', 'blue', 'blue'],
    ['rose', 'blue', 'green']));
  pick(engine, 0); pick(engine, 1);
  assert.equal(engine.dispatch({ type: 'clear-buffer' }).ok, true);
  assert.deepEqual(engine.state.pocket, ['s-0', 's-1']);
  pick(engine, 2);
  pick(engine, 3); pick(engine, 4);
  const result = pick(engine, 5);
  const backflow = result.filter(event => event.type === 'routed' && event.destination === 'box');
  assert.deepEqual(backflow.map(event => 'screwId' in event ? event.screwId : ''), ['s-5', 's-2', 's-0', 's-1']);
  assert.deepEqual(engine.state.buffer, Array(5).fill(null));
  assert.deepEqual(engine.state.pocket, []);
  assert.equal(engine.state.collected.length, 6);
  for (let index = 6; index < 9; index++) pick(engine, index);
  assert.equal(engine.state.phase, 'won');
});

test('孔位最多七个、盒位最多四个，复活在上限仍能继续', () => {
  const engine = new GameEngine(level(
    [...Array<ColorId>(9).fill('green'), ...Array<ColorId>(3).fill('rose'), ...Array<ColorId>(3).fill('blue'), ...Array<ColorId>(3).fill('orange'), ...Array<ColorId>(3).fill('purple')],
    ['rose', 'blue', 'orange', 'purple', 'green', 'green', 'green']));
  assert.equal(engine.dispatch({ type: 'expand-buffer' }).ok, true);
  assert.equal(engine.dispatch({ type: 'expand-buffer' }).ok, true);
  assert.equal(engine.dispatch({ type: 'expand-buffer' }).ok, false);
  assert.equal(engine.dispatch({ type: 'expand-box' }).ok, true);
  assert.equal(engine.dispatch({ type: 'expand-box' }).ok, true);
  assert.equal(engine.dispatch({ type: 'expand-box' }).ok, false);
  for (let index = 0; index < 7; index++) pick(engine, index);
  assert.equal(engine.state.phase, 'stuck');
  assert.equal(engine.dispatch({ type: 'revive' }).ok, true);
  assert.equal(engine.state.phase, 'playing');
  assert.equal(engine.state.pocket.length, 7);
  assert.equal(occupiedBuffer(engine.state), 0);
  assert.equal(engine.state.buffer.length, 7);
  assert.equal(engine.state.toolsUsed, 5);
  assertConservation(engine.state);
});

test('撤回还原动作前的物理姿态、队列与口袋，辅助计数不回退', () => {
  const engine = new GameEngine(level(['green', 'green', 'green'], ['rose', 'blue', 'green']));
  engine.state.boards[0].x = 48;
  engine.state.boards[0].angle = .7;
  engine.state.boards[0].vx = .4;
  engine.state.elapsedMs = 1234;
  const original = engine.snapshot();
  pick(engine, 0);
  const picked = engine.snapshot();
  assert.equal(engine.dispatch({ type: 'clear-buffer' }).ok, true);
  engine.state.boards[0].x = 250;
  assert.equal(engine.undo(), true);
  assert.deepEqual({...engine.snapshot(),stats:picked.stats,actionRevision:picked.actionRevision,toolsUsed:picked.toolsUsed}, picked);
  assert.equal(engine.state.stats.assists['clear-buffer'],1);
  assert.equal(engine.state.stats.undos,1);
  assert.equal(engine.undo(), true);
  assert.deepEqual({...engine.snapshot(),stats:original.stats,actionRevision:original.actionRevision,toolsUsed:original.toolsUsed}, original);
  assert.equal(engine.state.stats.assists['clear-buffer'],1);
  assert.equal(engine.state.stats.undos,2);
  assert.equal(engine.undo(), false);
});

test('复活只扩一盒，自动回流仍然暂存优先于旧口袋', () => {
  const engine = new GameEngine(level(
    [...Array<ColorId>(6).fill('green'), ...Array<ColorId>(3).fill('rose'), ...Array<ColorId>(3).fill('blue')],
    ['rose', 'blue', 'green', 'green']));
  pick(engine, 0);
  assert.equal(engine.dispatch({ type: 'clear-buffer' }).ok, true);
  for (let index = 1; index <= 5; index++) pick(engine, index);
  assert.equal(engine.state.phase, 'stuck');
  const result = engine.dispatch({ type: 'revive' });
  assert.equal(result.ok, true);
  const routed = result.events.filter(event => event.type === 'routed' && event.destination === 'box');
  assert.deepEqual(routed.map(event => 'screwId' in event ? event.screwId : ''), ['s-1', 's-2', 's-3', 's-4', 's-5', 's-0']);
  assert.equal(engine.state.phase, 'playing');
  assert.equal(engine.state.collected.length, 6);
  assert.deepEqual(engine.state.pocket, []);
  assert.deepEqual(engine.state.buffer, Array(5).fill(null));
  assertConservation(engine.state);
});

test('单钉与最后一钉释放事件反映实际剩余数量', () => {
  const fixture = level(['rose', 'rose', 'rose'], ['rose']);
  fixture.boards = [{ ...fixture.boards[0], width: 160, height: 110,
    screws: [{ id: 's-0', color: 'rose', x: -35, y: 0 }, { id: 's-1', color: 'rose', x: 0, y: 0 }, { id: 's-2', color: 'rose', x: 35, y: 0 }] }];
  const engine = new GameEngine(fixture);
  const released = [0, 1, 2].map(index => pick(engine, index).find(event => event.type === 'board-released'));
  assert.deepEqual(released.map(event => event && 'remaining' in event ? event.remaining : null), [2, 1, 0]);
  assert.equal(engine.state.boards[0].falling, true);
  assert.equal(engine.state.phase, 'won');
});

test('透明、部分覆盖、同深度顺序、下落与gone状态都参与几何遮挡', () => {
  const fixture = level(['rose', 'rose', 'rose'], ['rose']);
  fixture.boards[1].x = 100;
  fixture.boards[1].y = 100;
  const engine = new GameEngine(fixture);
  assert.equal(engine.canPick('s-0'), false);
  assert.equal(engine.canPick('s-1'), true);
  engine.state.boards[1].x = 136;
  // 板从 x=111 开始，螺丝中心100未覆盖，但半径14的头部仍被覆盖。
  assert.equal(engine.canPick('s-0'), false);
  engine.state.boards[1].x = 140;
  assert.equal(engine.canPick('s-0'), true);
  engine.state.boards[1].x = 100;
  engine.state.boards[1].depth = 0;
  assert.equal(engine.canPick('s-0'), false);
  engine.state.boards[1].falling = true;
  assert.equal(engine.canPick('s-0'), false);
  engine.state.boards[1].gone = true;
  assert.equal(engine.canPick('s-0'), true);
});

test('熔玻璃取消遮挡，原螺丝固定在熔化瞬间世界位置', () => {
  const fixture = level(['rose', 'rose', 'rose'], ['rose']);
  fixture.boards[1].x = 100;
  fixture.boards[1].y = 100;
  fixture.boards[1].angle = Math.PI / 2;
  fixture.boards[1].screws[0].x = 10;
  const engine = new GameEngine(fixture);
  assert.equal(engine.canPick('s-0'), false);
  const position = engine.position('s-1');
  assert.equal(engine.dispatch({ type: 'melt', boardId: 'board-1' }).ok, true);
  assert.equal(engine.canPick('s-0'), true);
  assert.equal(engine.state.screws[1].detached, true);
  assert.deepEqual(remainingOnBoard(engine.state, 'board-1'), []);
  engine.state.boards[1].x = 800;
  engine.state.boards[1].angle = 2;
  assert.deepEqual(engine.position('s-1'), position);
  assert.equal(engine.dispatch({ type: 'melt', boardId: 'board-1' }).ok, false);
  for (let index = 0; index < 3; index++) pick(engine, index);
  assert.equal(engine.state.phase, 'won');
});

test('旋转位置、非矩形边界及十八个归一化轮廓', () => {
  const engine = new GameEngine(level(['rose', 'rose', 'rose'], ['rose']));
  const board = engine.state.boards[0];
  const screw = engine.state.screws[0];
  screw.localX = 10; screw.localY = 20; board.angle = Math.PI / 2;
  const position = screwPosition(screw, board);
  assert.ok(Math.abs(position.x - 80) < 1e-8);
  assert.ok(Math.abs(position.y - 110) < 1e-8);
  const triangle: BoardDef = { ...board, shape: 'triangle', width: 100, height: 100, angle: 0 };
  assert.equal(pointInPolygon({ x: 100, y: 100 }, boardPolygon(triangle)), true);
  assert.equal(pointInPolygon({ x: 60, y: 60 }, boardPolygon(triangle)), false);
  assert.equal(pointInPolygon({ x: 100, y: 50 }, boardPolygon(triangle)), true);
  for (const shape of SHAPES) {
    const polygon = localOutline(shape);
    assert.ok(polygon.length >= 3);
    assert.ok(polygon.every(point => Math.abs(point.x) <= .500001 && Math.abs(point.y) <= .500001));
    polygon[0].x = 999;
    assert.notEqual(localOutline(shape)[0].x, 999);
  }
});

test('提示只返回已重放完整续解的可拆候选，快照恢复不共享引用', () => {
  const fixture = level(['green', 'green', 'green', 'rose', 'rose', 'rose'], ['rose', 'green']);
  fixture.witness = fixture.boards.flatMap(board => board.screws.map(screw => ({ screwId: screw.id })));
  const engine = new GameEngine(fixture);
  const hint = engine.hint();
  assert.ok(hint && isScrewExposed(engine.state, hint));
  pick(engine, 0);
  const saved = JSON.parse(JSON.stringify(engine.snapshot()));
  const resumed = new GameEngine(fixture, saved);
  assert.deepEqual(resumed.snapshot(), engine.snapshot());
  saved.boards[0].x = -123;
  assert.notEqual(resumed.state.boards[0].x, -123);
  const copy = engine.snapshot();
  resumed.restore(copy);
  copy.boards[1].x = -456;
  assert.notEqual(resumed.state.boards[1].x, -456);
  assert.equal(resumed.undo(), false);
});

test('归属核验能拒绝丢失、重复和错色螺丝', () => {
  const engine = new GameEngine(level(['green', 'rose', 'rose'], ['rose', 'blue', 'green']));
  pick(engine, 0);
  const missing = engine.snapshot();
  missing.buffer[0] = null;
  assert.throws(() => assertConservation(missing), /归属不守恒/);
  const duplicated = engine.snapshot();
  duplicated.pocket.push('s-0');
  assert.throws(() => assertConservation(duplicated), /重复归属/);
  pick(engine, 1);
  const wrongColor = engine.snapshot();
  wrongColor.boxes[0].color = 'purple';
  assert.throws(() => assertConservation(wrongColor), /颜色不匹配/);
});

test('生图轮廓覆盖保持独立副本、验证输入，并可恢复默认轮廓', () => {
  const original = localOutline('heart');
  const triangle = [{ x: 0, y: -.5 }, { x: .5, y: .5 }, { x: -.5, y: .5 }];
  try {
    setShapeOutlines({ heart: triangle });
    assert.deepEqual(localOutline('heart'), triangle);
    triangle[0].x = .2;
    assert.equal(localOutline('heart')[0].x, 0);
    assert.deepEqual(localOutline('disc').length, 32);
    assert.throws(() => setShapeOutlines({ heart: [{ x: 1, y: 0 }, { x: .2, y: 0 }, { x: 0, y: .2 }] }), /无效板件轮廓/);
    assert.equal(localOutline('heart')[0].x, 0);
  } finally {
    setShapeOutlines({});
  }
  assert.deepEqual(localOutline('heart'), original);
});

test('拒绝非有限物理姿态及其JSON产生的null，防止损坏存档持续传播', () => {
  const fixture = level(['rose', 'rose', 'rose'], ['rose']);
  const engine = new GameEngine(fixture);
  const corrupted = engine.snapshot();
  corrupted.boards[0].x = NaN;
  assert.throws(() => assertConservation(corrupted), /物理状态无效/);
  assert.throws(() => engine.restore(corrupted), /物理状态无效/);
  assert.throws(() => new GameEngine(fixture, JSON.parse(JSON.stringify(corrupted))), /物理状态无效/);
  const badScrew = engine.snapshot();
  badScrew.screws[0].localY = Infinity;
  assert.throws(() => new GameEngine(fixture, badScrew), /位置无效/);
  engine.state.boards[0].angle = Infinity;
  assert.throws(() => engine.snapshot(), /物理状态无效/);
});

test('固定孔回流后不左移，新螺丝复用第一个空孔，事件保留源目标槽', () => {
  const fixture = level(
    ['green', 'orange', 'green', 'orange', 'green', 'blue', 'blue', 'blue', 'rose', 'rose', 'rose', 'orange'],
    ['rose', 'blue', 'green', 'orange']);
  const engine = new GameEngine(fixture);
  pick(engine, 0); pick(engine, 1); pick(engine, 2);
  assert.deepEqual(engine.state.buffer, ['s-0', 's-1', 's-2', null, null]);
  const expanded = engine.dispatch({ type: 'expand-box' });
  assert.equal(expanded.ok, true);
  assert.deepEqual(expanded.before!.buffer, ['s-0', 's-1', 's-2', null, null]);
  assert.deepEqual(engine.state.buffer, [null, 's-1', null, null, null]);
  const routes = expanded.events.filter(event => event.type === 'routed');
  assert.deepEqual(routes.map(event => event.sourceSlotIndex), [0, 2]);
  assert.deepEqual(routes.map(event => event.slotIndex), [0, 1]);
  assert.ok(routes.every(event => event.sourcePlace === 'buffer' && event.color === 'green'));
  const next = pick(engine, 3).find(event => event.type === 'routed');
  assert.deepEqual(engine.state.buffer, ['s-3', 's-1', null, null, null]);
  assert.equal(next?.slotIndex, 0);
});

test('三盒以内复活只加一盒，不清除其他颜色或压缩孔位', () => {
  const engine = new GameEngine(level(
    ['green', 'orange', 'green', 'orange', 'green', 'rose', 'rose', 'rose', 'blue', 'blue', 'blue', 'yellow', 'yellow', 'yellow', 'orange'],
    ['rose', 'blue', 'green', 'yellow', 'orange']));
  for (let index = 0; index < 5; index++) pick(engine, index);
  assert.equal(engine.state.phase, 'stuck');
  const result = engine.dispatch({ type: 'revive' });
  assert.equal(result.ok, true);
  assert.equal(engine.state.boxes.length, 3);
  assert.deepEqual(engine.state.buffer, [null, 's-1', null, 's-3', null]);
  assert.deepEqual(engine.state.pocket, []);
  assert.equal(engine.state.phase, 'playing');
  assert.equal(result.events.some(event => event.type === 'routed' && event.destination === 'pocket'), false);
  assertConservation(engine.state);
});

test('复活新盒没有匹配色时仍保持满孔，不偷偷附送清孔', () => {
  const engine = new GameEngine(level(
    [...Array<ColorId>(6).fill('green'), ...Array<ColorId>(3).fill('rose'), ...Array<ColorId>(3).fill('blue'), ...Array<ColorId>(3).fill('orange'), ...Array<ColorId>(3).fill('yellow')],
    ['rose', 'blue', 'orange', 'yellow', 'green', 'green']));
  for (let index = 0; index < 5; index++) pick(engine, index);
  assert.equal(engine.dispatch({ type: 'revive' }).ok, true);
  assert.equal(engine.state.boxes.length, 3);
  assert.equal(engine.state.phase, 'stuck');
  assert.equal(occupiedBuffer(engine.state), 5);
  assert.equal(engine.state.pocket.length, 0);
  assert.equal(engine.dispatch({ type: 'revive' }).ok, true);
  assert.equal(engine.state.boxes.length, 4);
  assert.equal(engine.state.phase, 'stuck');
  assert.equal(engine.dispatch({ type: 'revive' }).ok, true);
  assert.equal(engine.state.boxes.length, 4);
  assert.equal(engine.state.phase, 'playing');
  assert.equal(occupiedBuffer(engine.state), 0);
  assert.equal(engine.state.pocket.length, 5);
});

test('十色库存全部守恒，新增红灰不改变旧八色索引', () => {
  assert.deepEqual(COLORS.slice(0, 8), ['rose', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'brown']);
  assert.deepEqual(COLORS.slice(8), ['red', 'gray']);
  const engine = new GameEngine(level(COLORS.flatMap(color => [color, color, color]), [...COLORS]));
  for (let index = 0; index < 30; index++) pick(engine, index);
  assert.equal(engine.state.phase, 'won');
  assert.equal(engine.state.collected.length, 30);
  for (const color of COLORS) assert.equal(engine.state.screws.filter(screw => screw.color === color && screw.place === 'done').length, 3);
  assert.equal(engine.state.boxes.reduce((count, box) => count + box.completed, 0), 10);
});

test('版本一盘面被拒绝，新尝试重新获得两盒五孔与独立标识', () => {
  const fixture = level(['rose', 'rose', 'rose'], ['rose']);
  const first = new GameEngine(fixture);
  first.dispatch({ type: 'expand-box' }); first.dispatch({ type: 'expand-buffer' });
  const legacy = { ...first.snapshot(), version: 1 } as unknown as GameState;
  assert.throws(() => new GameEngine(fixture, legacy), /版本/);
  assert.throws(() => first.restore(legacy), /版本/);
  const next = new GameEngine({ ...fixture, seed: fixture.seed + 1, attempt: 1 });
  assert.equal(next.state.boxes.length, 2);
  assert.equal(next.state.capacity, 5);
  assert.deepEqual(next.state.buffer, Array(5).fill(null));
  assert.notEqual(next.state.attemptId, first.state.attemptId);
  assert.throws(() => next.restore(first.snapshot()), /尝试/);
});

test('动作before共享不可变前态，展示层不能修改撤回历史', () => {
  const engine = new GameEngine(level(['rose', 'rose', 'rose'], ['rose']));
  const before = engine.snapshot();
  const result = engine.dispatch({ type: 'pick', screwId: 's-0' });
  assert.deepEqual(result.before, before);
  assert.throws(()=>{result.before!.boards[0].x = 9999;},TypeError);
  assert.equal(engine.undo(), true);
  assert.deepEqual({...engine.snapshot(),stats:before.stats,actionRevision:before.actionRevision,toolsUsed:before.toolsUsed,elapsedMs:before.elapsedMs}, before);
});

test('四孔时提示须先验完整续解，推荐动作不直接塞满第五孔', () => {
  const fixture = level(
    ['green', 'green', 'orange', 'orange', 'rose', 'rose', 'rose', 'blue', 'blue', 'blue', 'green', 'orange', 'gray', 'gray', 'gray'],
    ['rose', 'blue', 'green', 'orange', 'gray']);
  fixture.witness = fixture.boards.flatMap(board => board.screws.map(screw => ({ screwId: screw.id })));
  const engine = new GameEngine(fixture);
  for (let index = 0; index < 4; index++) pick(engine, index);
  assert.equal(occupiedBuffer(engine.state), 4);
  const before = engine.snapshot(), info = engine.hintInfo();
  assert.deepEqual(engine.snapshot(), before);
  assert.equal(info.type, 'move');
  if (info.type !== 'move') throw new Error('测试需要已验证提示');
  assert.equal(info.model, 'static-current-pose');
  assert.equal(info.verifiedSteps, 11);
  assert.ok(['rose', 'blue'].includes(engine.state.screws.find(screw => screw.id === info.id)!.color));
  assert.equal(engine.dispatch({ type: 'pick', screwId: info.id }).ok, true);
  assert.notEqual(engine.state.phase, 'stuck');
  assertConservation(engine.state);
});

test('所有立即可点动作都会满孔时返回Unknown，不推荐危险第五颗', () => {
  const fixture = level([...Array<ColorId>(3).fill('rose'), ...Array<ColorId>(3).fill('blue'), ...Array<ColorId>(6).fill('green')], ['rose', 'blue', 'green', 'green']);
  fixture.boards = [
    { ...fixture.boards[0], id: 'base-rose', x: 100, y: 100, width: 180, height: 150, depth: 0, screws: Array.from({ length: 3 }, (_, i) => ({ id: `s-${i}`, color: 'rose', x: (i - 1) * 35, y: 0 })) },
    { ...fixture.boards[0], id: 'base-blue', x: 100, y: 100, width: 180, height: 150, depth: 1, screws: Array.from({ length: 3 }, (_, i) => ({ id: `s-${i + 3}`, color: 'blue', x: (i - 1) * 35, y: 0 })) },
    { ...fixture.boards[0], id: 'cover', x: 100, y: 100, width: 180, height: 150, depth: 2, screws: Array.from({ length: 6 }, (_, i) => ({ id: `s-${i + 6}`, color: 'green', x: (i % 3 - 1) * 40, y: i < 3 ? -25 : 25 })) },
  ];
  const engine = new GameEngine(fixture);
  for (let index = 6; index < 10; index++) pick(engine, index);
  assert.equal(occupiedBuffer(engine.state), 4);
  assert.equal(engine.hintInfo().type, 'unknown');
  assert.equal(engine.hint(), null);
  assert.equal(engine.state.phase, 'playing');
});

test('搜索预算耗尽或见证未验证完整时明确Unknown，不能直接信任见证前缀', () => {
  const fixture = level(['rose', 'rose', 'rose', 'blue', 'blue', 'blue'], ['rose', 'blue']);
  fixture.witness = [{ screwId: 's-0' }, { screwId: 's-1' }];
  const engine = new GameEngine(fixture), before = engine.snapshot();
  for (const options of [{ maxNodes: 0 }, { maxNodes: 2, maxMs: 1000 }]) {
    const info = engine.hintInfo(options);
    assert.equal(info.type, 'unknown');
    if (info.type === 'unknown') assert.equal(info.budgetExhausted, true);
  }
  assert.deepEqual(engine.snapshot(), before);
  const found = engine.hintInfo({ maxNodes: 5000, maxMs: 1000, beamWidth: 12 });
  assert.equal(found.type, 'move');
  if (found.type === 'move') assert.equal(found.verifiedSteps, 6);
});

test('空板尚未落下且全部目标被挡时返回Wait，落下后重新验证', () => {
  const fixture = level(['rose', 'rose', 'rose', 'blue', 'blue', 'blue'], ['blue', 'rose']);
  fixture.boards = [
    { ...fixture.boards[0], x: 100, y: 100, width: 180, height: 150, depth: 0, screws: Array.from({ length: 3 }, (_, i) => ({ id: `s-${i}`, color: 'rose', x: (i - 1) * 35, y: 0 })) },
    { ...fixture.boards[3], x: 100, y: 100, width: 180, height: 150, depth: 1, screws: Array.from({ length: 3 }, (_, i) => ({ id: `s-${i + 3}`, color: 'blue', x: (i - 1) * 35, y: 0 })) },
  ];
  fixture.witness = [3, 4, 5, 0, 1, 2].map(index => ({ screwId: `s-${index}` }));
  const engine = new GameEngine(fixture);
  for (const index of [3, 4, 5]) pick(engine, index);
  assert.equal(engine.hintInfo().type, 'wait');
  engine.state.boards[1].gone = true;
  assert.equal(engine.hintInfo().type, 'move');
});

test('多边形缓存随姿态、尺寸、形状及alpha轮廓修订失效', () => {
  const board = level(['rose'], ['rose']).boards[0];
  const original = boardPolygon(board);
  original[0].x = 99999;
  assert.notEqual(boardPolygon(board)[0].x, 99999);
  const before = boardPolygon(board);
  board.x += 25;
  assert.ok(boardPolygon(board).every((point, index) => Math.abs(point.x - before[index].x - 25) < 1e-8));
  board.angle = Math.PI / 2;
  assert.notDeepEqual(boardPolygon(board), before);
  board.width = 120; board.height = 90; board.shape = 'triangle';
  assert.equal(boardPolygon(board).length, 3);
  try {
    setShapeOutlines({ triangle: [{ x: -.3, y: -.3 }, { x: .3, y: -.3 }, { x: .3, y: .3 }, { x: -.3, y: .3 }] });
    assert.equal(boardPolygon(board).length, 4);
  } finally { setShapeOutlines({}); }
  assert.equal(boardPolygon(board).length, 3);
});

test('120/228钉合成叠层盘面的重复遮挡查询保持有界开销', t => {
  for (const count of [120, 228]) {
    const fixture = level([], Array<ColorId>(count / 3).fill('rose'));
    fixture.boards = Array.from({ length: count / 6 }, (_, index) => ({
      id: `load-b${index}`, shape: 'disc', color: 'rose', x: 75 + index % 4 * 80, y: 120 + index % 3 * 65,
      width: 160, height: 160, angle: index * .07, depth: Math.floor(index / 4),
      screws: Array.from({ length: 6 }, (_, pin) => ({ id: `load-${index}-${pin}`, color: 'rose', x: Math.cos(pin * Math.PI / 3) * 40, y: Math.sin(pin * Math.PI / 3) * 40 })),
    }));
    const engine = new GameEngine(fixture);
    engine.available();
    const durations: number[] = [];
    for (let iteration = 0; iteration < 100; iteration++) {
      const started = performance.now(); engine.available(); durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    const total = durations.reduce((a, b) => a + b, 0);
    t.diagnostic(`${count} 钉/100次：总计 ${total.toFixed(2)}ms，p50 ${durations[50].toFixed(3)}ms，p95 ${durations[95].toFixed(3)}ms；仅此机器的合成场景数据。`);
    assert.ok(total < 3000, '重复查询出现显著性能退化');
  }
});


