import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/core';
import { ARTWORKS, LEGACY_KEY, V1_KEY, SAVE_KEY, awardVictory, freshSave, loadSave, loadSaveAsync, persistSave } from '../src/storage';
import {flushJournal} from '../src/journal';
import type { ColorId, LevelDef } from '../src/types';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  blocked = false;
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void {
    if (this.blocked) throw new Error('QuotaExceededError');
    this.values.set(key, String(value));
  }
}

async function isolatedStorage(run: (storage: MemoryStorage) => void|Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    // 每个用例先消化模块内上次的恢复标记；全部操作只发生在内存替身中。
    persistSave(freshSave());await flushJournal();storage.clear();
    await run(storage);
  } finally {
    storage.blocked = false; persistSave(freshSave());await flushJournal();
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

function fixture(seed = 1, id = 1, colors: ColorId[] = Array<ColorId>(15).fill('rose'), queue: ColorId[] = Array<ColorId>(5).fill('rose')): LevelDef {
  return { id, seed, name: '存储逻辑夹具', subtitle: '不作为真人或浏览器通关证据', witness: [],
    boxQueue: queue, boards: colors.map((color, index) => ({ id: `b${index}`, shape: 'disc', color,
      x: index * 100, y: 100, width: 40, height: 40, angle: 0, depth: index,
      screws: [{ id: `s${index}`, color, x: 0, y: 0 }] })) };
}

function finishedFixture(seed = 1, id = 1): GameEngine {
  const definition=fixture(seed,id);definition.contentVersion='v4';definition.contentRevision=1;definition.mode=id>30?'endless':'campaign';
  const engine = new GameEngine(definition);
  for (let index = 0; index < 15; index++) assert.equal(engine.dispatch({ type: 'pick', screwId: `s${index}` }).ok, true);
  assert.equal(engine.state.phase, 'won');
  return engine;
}

test('V1迁移保留原key与已有作品，旧成绩单独保存且不导入V1盘面', () => isolatedStorage(storage => {
  const legacy = JSON.stringify({ version: 1, completed: [1, 2, 2, 5, -1, 31], album: [1, 3, 3, 9],
    settings: { sound: false, reducedMotion: true, colorLabels: true }, current: { version: 1, levelId: 2, invalidBoard: true } });
  storage.setItem(V1_KEY, legacy);
  const loaded = loadSave();
  assert.equal(loaded.data.version, 4);
  assert.deepEqual(loaded.data.legacyCompleted, [1, 2, 5]);
  assert.deepEqual(loaded.data.completed, []);
  assert.equal(loaded.data.unlocked, 6);
  assert.equal(loaded.data.current, null);
  assert.equal(loaded.data.materialBalance, 0);
  assert.deepEqual(loaded.data.album, [1, 3]);
  assert.equal(loaded.data.artworkProgress[0], ARTWORKS[0].columns * ARTWORKS[0].rows);
  assert.equal(loaded.data.artworkProgress[2], ARTWORKS[2].columns * ARTWORKS[2].rows);
  assert.deepEqual(loaded.data.settings, { sound: false, reducedMotion: true, colorLabels: true });
  assert.ok(loaded.warning);
  assert.equal(persistSave(loaded.data), true);
  assert.equal(storage.getItem(V1_KEY), legacy);
  assert.ok(storage.getItem(SAVE_KEY));
}));

test('V3盘面经增量事务持久化后保留固定孔的null空洞、seed、attemptId及逐关尝试号', () => isolatedStorage(async() => {
  const colors: ColorId[] = ['red', 'gray', 'red', 'gray', 'red', 'gray', 'rose', 'rose', 'rose', 'blue', 'blue', 'blue'];
  const engine = new GameEngine(fixture(7231, 2, colors, ['rose', 'blue', 'red', 'gray']));
  for (const index of [0, 1, 2]) engine.dispatch({ type: 'pick', screwId: `s${index}` });
  engine.dispatch({ type: 'expand-box' });
  assert.deepEqual(engine.state.buffer, [null, 's1', null, null, null]);
  const save = freshSave();
  save.current = engine.snapshot(); save.currentAttempt = 2; save.attempts = { 1: 1, 2: 3 }; save.attemptCounter = 4;
  save.materialBalance = 37; save.artworkProgress[0] = 12;
  assert.equal(persistSave(save), true);
  const loaded = await loadSaveAsync();
  assert.deepEqual(loaded.data.current?.buffer, [null, 's1', null, null, null]);
  assert.equal(loaded.data.current?.seed, 7231);
  assert.equal(loaded.data.current?.attemptId, engine.state.attemptId);
  assert.equal(loaded.data.currentAttempt, 2);
  assert.deepEqual(loaded.data.attempts, { 1: 1, 2: 3 });
  assert.equal(loaded.data.materialBalance, 37);
  assert.equal(loaded.data.artworkProgress[0], 12);
}));

test('首通材料按螺丝数奖励，同attempt和同战役新attempt都不重复发奖', () => isolatedStorage(() => {
  const save = freshSave(), first = finishedFixture(1);
  assert.equal(awardVictory(save, first.state), 15);
  assert.equal(save.materialBalance, 15);
  assert.deepEqual(save.r1Campaign.completed, [1]);
  assert.equal(save.r1Campaign.unlocked, 2);
  assert.deepEqual(save.completed, []);
  assert.equal(awardVictory(save, first.state), 0);
  assert.equal(save.rewardedAttempts.length, 1);
  const repeat = finishedFixture(2);
  assert.equal(awardVictory(save, repeat.state), 0);
  assert.equal(save.materialBalance, 15);
  assert.equal(save.rewardedAttempts.length, 2);
  assert.equal(persistSave(save), true);
  const restored = loadSave().data;
  assert.equal(awardVictory(restored, first.state), 0);
  assert.equal(awardVictory(restored, repeat.state), 0);
  assert.equal(restored.materialBalance, 15);
}));

test('V4无尽只记成绩与累计拆钉，未胜利不领奖、重复结算不重复累计', () => isolatedStorage(() => {
  const save = freshSave();
  assert.equal(awardVictory(save, new GameEngine(fixture(7, 31)).state), 0);
  const first = finishedFixture(7, 31), next = finishedFixture(8, 31);
  assert.equal(awardVictory(save, first.state), 0);
  assert.equal(awardVictory(save, first.state), 0);
  assert.equal(awardVictory(save, next.state), 0);
  assert.equal(save.materialBalance, 0);
  assert.equal(save.totalScrews,30);
  assert.deepEqual(save.completed, []);
}));

test('坏V3盘面保留可读进度，重存前备份原文且不触碰V1原key', () => isolatedStorage(storage => {
  const legacy = '{legacy-kept-verbatim}'; storage.setItem(LEGACY_KEY, legacy);
  const save = freshSave(); save.completed = [1]; save.materialBalance = 15;
  save.current = new GameEngine(fixture()).snapshot();
  const invalid = JSON.parse(JSON.stringify(save)); invalid.current.boards[0].x = null;
  const raw = JSON.stringify(invalid); storage.setItem(SAVE_KEY, raw);
  const loaded = loadSave();
  assert.ok(loaded.warning);
  assert.deepEqual(loaded.data.completed, [1]);
  assert.equal(loaded.data.materialBalance, 15);
  assert.equal(loaded.data.current, null);
  assert.equal(storage.getItem(SAVE_KEY), raw);
  assert.equal(persistSave(loaded.data), true);
  const recoveryKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index)!).filter(key => key.startsWith(`${SAVE_KEY}:recovery:`));
  assert.equal(recoveryKeys.length, 1);
  assert.equal(storage.getItem(recoveryKeys[0]), raw);
  assert.equal(storage.getItem(LEGACY_KEY), legacy);
}));

test('V1盘面放进V3存档也不能继续复用，迁移只保留元进度', () => isolatedStorage(storage => {
  const save = freshSave();
  const invalid = { ...save, current: { ...new GameEngine(fixture()).snapshot(), version: 1 } };
  storage.setItem(SAVE_KEY, JSON.stringify(invalid));
  const loaded = loadSave();
  assert.ok(loaded.warning);
  assert.equal(loaded.data.current, null);
}));

test('作品进度与材料边界归一化，非法尝试号不进入记录', () => isolatedStorage(storage => {
  const invalid = { ...freshSave(), materialBalance: -10, artworkProgress: [99999, -2, 4.5, 7],
    album: [6], attempts: { '2': 3, wrong: 9, '3': -1, '4': 1.5 }, rewardedAttempts: ['1:2', null, 3] };
  storage.setItem(SAVE_KEY, JSON.stringify(invalid));
  const loaded = loadSave().data;
  assert.equal(loaded.materialBalance, 0);
  assert.deepEqual(loaded.artworkProgress, [600, 0, 0, 7, 0, 0]);
  assert.deepEqual(loaded.album, [1]);
  assert.deepEqual(loaded.attempts, { 2: 3 });
  assert.deepEqual(loaded.rewardedAttempts, ['1:2']);
}));

test('写入失败返回false并保留先前存档原文', () => isolatedStorage(storage => {
  const original = JSON.stringify(freshSave()); storage.setItem(SAVE_KEY, original);
  const next = freshSave(); next.materialBalance = 15;
  storage.blocked = true;
  assert.equal(persistSave(next), false);
  assert.equal(storage.getItem(SAVE_KEY), original);
}));
