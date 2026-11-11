import { isScrewExposed, remainingOnBoard, screwPosition } from './geometry';
import { COLORS, COLOR_NAMES } from './types';
import { assistCount, freshStats, newRunId, puzzleId } from './run';
import {copyState,freezeState} from './snapshot';
import {advanceReveal} from './reveal';
import type { Action, ActionResult, BoxState, ContentVersion, GameEvent, GameState, HintInfo, HintSearchOptions, LevelDef, PlayMode, RunCheckpoint, ScrewPlace, ScrewState, ToolPreview, Vec2 } from './types';

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function makeAttemptId(levelId:number,seed:number,version:ContentVersion='v4',mode?:PlayMode,revision?:number):string{return puzzleId(levelId,seed,version,mode,revision);}

export function occupiedBuffer(state: Pick<GameState, 'buffer'>): number {
  return state.buffer.reduce<number>((count, id) => count + Number(id !== null), 0);
}

/** 对每次结算后的状态进行归属和数量核对，也用于回放测试。 */
export function assertConservation(state: GameState): void {
  if (state.version !== 3) throw new Error('此盘面不是 V3 存档');
  if (!Number.isInteger(state.levelId) || state.levelId < 1 || !Number.isInteger(state.seed) ||
      state.attemptId !== makeAttemptId(state.levelId,state.seed,state.contentVersion,state.mode,state.contentRevision)||!state.runId||!Number.isInteger(state.actionRevision)) throw new Error('本次尝试标识无效');
  if(!state.stats||![state.elapsedMs,state.stats.elapsedMs,state.stats.picks,state.stats.undos,state.stats.hintsShown,...Object.values(state.stats.assists)].every(v=>Number.isFinite(v)&&v>=0))throw new Error('本局统计无效');
  if (!Number.isInteger(state.capacity) || state.capacity < 5 || state.capacity > 7 ||
      !Array.isArray(state.buffer) || state.buffer.length !== state.capacity) throw new Error('暂存孔必须保持固定槽位');
  for (const board of state.boards) {
    if (![board.x, board.y, board.angle, board.vx, board.vy, board.angularVelocity, board.width, board.height].every(Number.isFinite) || board.width <= 0 || board.height <= 0) {
      throw new Error(`板件 ${board.id} 的物理状态无效`);
    }
  }
  for (const screw of state.screws) {
    if (![screw.x, screw.y, screw.localX, screw.localY].every(Number.isFinite)) throw new Error(`螺丝 ${screw.id} 的位置无效`);
    if (!COLORS.includes(screw.color)) throw new Error(`螺丝 ${screw.id} 的颜色无效`);
  }
  const ids = new Set(state.screws.map(screw => screw.id));
  if (ids.size !== state.screws.length) throw new Error('螺丝 ID 重复');
  const accounted = new Map<string, string>();
  const register = (id: string, place: string) => {
    if (!ids.has(id)) throw new Error(`未知螺丝 ${id}`);
    if (accounted.has(id)) throw new Error(`螺丝 ${id} 重复归属`);
    accounted.set(id, place);
  };
  for (const screw of state.screws) if (screw.place === 'board') register(screw.id, 'board');
  for (const id of state.buffer) if (id !== null) register(id, 'buffer');
  for (const id of state.pocket) register(id, 'pocket');
  for (const id of state.collected) register(id, 'done');
  for (const box of state.boxes) {
    if (box.screws.length >= 3) throw new Error('完成盒未结算');
    for (const id of box.screws) {
      register(id, 'box');
      if (state.screws.find(screw => screw.id === id)?.color !== box.color) throw new Error('收集盒颜色不匹配');
    }
  }
  for (const screw of state.screws) {
    if (accounted.get(screw.id) !== screw.place) throw new Error(`螺丝 ${screw.id} 归属不守恒`);
  }
  if (state.boxes.length < 2 || state.boxes.length > 4) throw new Error('收集盒数量越界');
  if (occupiedBuffer(state) > state.capacity) throw new Error('暂存容量越界');
  if (state.collected.length % 3 !== 0) throw new Error('完整盒的螺丝总数异常');
}

export class GameEngine {
  state: GameState;
  private history: GameState[] = [];
  private definition: LevelDef;
  private verifiedContinuation: string[] = [];

  constructor(level: LevelDef, saved?: GameState, history:GameState[]=[]) {
    this.definition = clone(level);
    if(!saved&&level.challengeStart){this.state=copyState(level.challengeStart.state);this.state.runId=newRunId();this.state.actionRevision=0;this.state.moves=0;this.state.elapsedMs=0;this.state.toolsUsed=0;this.state.stats=freshStats();this.state.rewardableIds=[...level.challengeStart.rewardableIds];assertConservation(this.state);return;}
    if (saved) {
      if (saved.version !== 3 || saved.levelId !== level.id || saved.seed!==level.seed || saved.contentVersion!==(level.contentVersion??'v3')) throw new Error('存档与关卡内容版本不匹配');
      this.state = copyState(saved);
      assertConservation(this.state);
      this.loadHistory(history);
      return;
    }
    this.state = {
      version:3,contentVersion:level.contentVersion??'v3',levelId:level.id,seed:level.seed,attemptId:makeAttemptId(level.id,level.seed,level.contentVersion??'v3',level.mode,level.contentRevision),runId:newRunId(),actionRevision:0,stats:freshStats(),reveal:level.reveal?clone(level.reveal):undefined,mode:level.mode??(level.contentVersion==='v4'?(level.id>30?'endless':'campaign'):'legacy'),contentRevision:level.contentRevision,attempt:level.attempt??0,
      boards: clone(level.boards).map(board => ({ ...board, vx: 0, vy: 0, angularVelocity: 0,
        melted: false, falling: false, gone: false, active:!board.reserved })),
      screws: level.boards.flatMap(board => board.screws.map(screw => ({
        id: screw.id, boardId: board.id, color: screw.color, localX: screw.x, localY: screw.y,
        place: 'board' as const, detached: false, x: 0, y: 0,
      }))),
      boxes: [], boxQueue: [...level.boxQueue], queueCursor: 0,
      buffer: Array<string | null>(5).fill(null), pocket: [], collected: [], capacity: 5, phase: 'playing', moves: 0, elapsedMs: 0, toolsUsed: 0,
    };
    if(level.revealPlan){this.state.revealPlan=clone(level.revealPlan);this.state.revealState={opened:[],pendingId:null,lowEntryMs:0};}
    for (const screw of this.state.screws) Object.assign(screw, this.position(screw));
    this.openBox([]);
    this.openBox([]);
    this.settle([]);
    assertConservation(this.state);
  }

  snapshot(): GameState {
    assertConservation(this.state);
    return copyState(this.state);
  }

  // 历史帧创建后不再修改；持久化器只读这些帧，避免每次保存复制整局静态板件。
  checkpoint(state=this.snapshot()):RunCheckpoint{return{schema:1,state,history:[...this.history]};}
  private loadHistory(history:GameState[]):void {
    if(!Array.isArray(history)||history.length>512)throw Error('撤回记录长度无效');
    for(const item of history){assertConservation(item);if(item.runId!==this.state.runId||item.attemptId!==this.state.attemptId||item.actionRevision>=this.state.actionRevision)throw Error('撤回记录与当前这一局不匹配');}
    this.history=history.map(copyState);
  }

  restore(state: GameState): void {
    if (state.version !== 3 || state.levelId !== this.state.levelId || state.attemptId !== this.state.attemptId) throw new Error('不能恢复其他版本、关卡或尝试的状态');
    assertConservation(state);
    this.state = copyState(state);
    this.history = [];
    this.verifiedContinuation = [];
  }

  undo(): boolean {
    const previous = this.history.pop();
    if (!previous) return false;
    // 撤回的是盘面；用时、已经看过的小抄和用过的辅助不会随快照倒退。
    const stats=clone(this.state.stats),revision=this.state.actionRevision,runId=this.state.runId;
    stats.elapsedMs=Math.max(stats.elapsedMs,this.state.elapsedMs);stats.undos++;
    this.state={...copyState(previous),stats,goal:this.state.goal,elapsedMs:stats.elapsedMs,toolsUsed:assistCount(stats),runId,actionRevision:revision+1};
    this.verifiedContinuation = [];
    assertConservation(this.state);
    return true;
  }

  get canUndo():boolean{return this.history.length>0;}

  /** 当前已拆的官方钉是否正好是见证前缀，没有额外离盘钉子。 */
  isOfficialPrefix(state=this.state):boolean {
    const off=new Set(state.screws.filter(screw=>screw.place!=='board').map(screw=>screw.id));
    let prefix=0;
    for(const step of this.definition.witness){
      if(!off.has(step.screwId))break;
      prefix++;
    }
    const allowed=new Set(this.definition.witness.slice(0,prefix).map(step=>step.screwId));
    return [...off].every(id=>allowed.has(id));
  }

  /** 从该姿态沿官方见证静态重放能否通关（空板视为已离场，不做物理预测）。 */
  witnessSolves(state=this.state):boolean {
    if(state.phase==='won')return true;
    if(state.phase==='stuck')return false;
    const trial=new GameEngine(this.definition,copyState(state));
    const remaining=this.definition.witness.map(step=>step.screwId).filter(id=>trial.state.screws.some(screw=>screw.id===id&&screw.place==='board'));
    for(const id of remaining){
      for(const board of trial.state.boards)if(!board.melted&&remainingOnBoard(trial.state,board.id).length===0)board.gone=true;
      if(!trial.canPick(id))return false;
      const result=trial.perform({type:'pick',screwId:id},false);
      if(!result.ok||trial.state.phase==='stuck')return false;
    }
    return trial.state.phase==='won';
  }

  /** 在撤回日志里找最近一个官方线仍可走的姿态；开局永远可作退路。 */
  solvableRewindPlan():{ok:boolean;steps:number;moves:number;reason:string}{
    if(this.state.phase==='won')return{ok:false,steps:0,moves:this.state.moves,reason:'这一关已经完成了。'};
    // 只把“开局”或“正好走在官方前缀上”当成可解点。静态见证会把空板直接标成离场，
    // 忽略真实摆动后最后一颗被挡住的情况，不能单独用来证明中途分歧姿态可续解。
    if(this.state.phase!=='stuck'&&(this.state.moves===0||this.isOfficialPrefix(this.state)))return{ok:false,steps:0,moves:this.state.moves,reason:'现在还能继续拆，不必回到更早的一步。'};
    for(let index=this.history.length-1;index>=0;index--){
      const prior=this.history[index];
      if(prior.phase==='stuck')continue;
      if(prior.moves===0||this.isOfficialPrefix(prior)){
        const steps=this.history.length-index;
        if(steps<=0)continue;
        const reason=steps===1?'撤回一步就能继续。':`孔已经满了，只撤回一两步通常还拆不开。回到 ${steps} 步之前还能继续，会记 ${steps} 次撤回。`;
        return{ok:true,steps,moves:prior.moves,reason};
      }
    }
    return{ok:false,steps:0,moves:this.state.moves,reason:'撤回记录里还没有找到能继续的一步。'};
  }

  rewindToSolvable():{ok:boolean;steps:number;moves:number;reason:string}{
    const plan=this.solvableRewindPlan();
    if(!plan.ok)return plan;
    for(let step=0;step<plan.steps;step++){
      if(!this.undo())return{ok:false,steps:step,moves:this.state.moves,reason:'撤回中途失败。'};
    }
    return{...plan,reason:`已回到 ${plan.steps} 步之前，还可以继续拆。这次记了 ${plan.steps} 次撤回。`};
  }

  advanceWorld(milliseconds:number):GameEvent[]{return advanceReveal(this.state,milliseconds);}
  hintContinuation():string[]{return [...this.verifiedContinuation];}
  advanceClock(milliseconds:number):void {
    if(!Number.isFinite(milliseconds)||milliseconds<0)return;
    this.state.elapsedMs=Math.max(this.state.elapsedMs,this.state.stats.elapsedMs)+milliseconds;
    this.state.stats.elapsedMs=this.state.elapsedMs;
  }
  markHintShown():void{this.state.stats.hintsShown++;}
  toolPreview(action:Action):ToolPreview {
    const trial=new GameEngine(this.definition,this.snapshot()),before=occupiedBuffer(trial.state),capacity=trial.state.capacity;
    const nextColor=(action.type==='expand-box'||action.type==='revive')&&trial.state.boxes.length<4?trial.state.boxQueue[trial.state.queueCursor]??null:null;
    const result=trial.perform(action,false);
    return{action,available:result.ok,freed:before-occupiedBuffer(trial.state),added:trial.state.capacity-capacity,nextColor,result:trial.state.phase,reason:result.reason??''};
  }

  position(screwOrId: ScrewState | string): Vec2 {
    const screw = typeof screwOrId === 'string' ? this.state.screws.find(item => item.id === screwOrId) : screwOrId;
    if (!screw) return { x: 0, y: 0 };
    const board = this.state.boards.find(item => item.id === screw.boardId);
    return board ? screwPosition(screw, board) : { x: screw.x, y: screw.y };
  }

  canPick(id: string): boolean { return this.state.phase === 'playing' && isScrewExposed(this.state, id); }

  available(): ScrewState[] { return this.state.screws.filter(screw => this.canPick(screw.id)); }

  hint(): string | null {
    const info = this.hintInfo();
    return info.type === 'move' ? info.id : null;
  }

  hintInfo(options: HintSearchOptions = {}): HintInfo {
    let searchedNodes = 0;
    const unknown = (reason: string, budgetExhausted = false): HintInfo => ({ type: 'unknown', reason, searchedNodes, budgetExhausted });
    if (this.state.phase === 'won') return unknown('这一关已经完成了。');
    if (this.state.phase === 'stuck') return unknown('暂存已经满了，先处理当前救场，再判断下一步。');
    const available = this.available();
    const falling = this.state.boards.some(board => board.falling && !board.gone && !board.melted);
    const moving = falling || this.state.boards.some(board => !board.gone && !board.melted &&
      remainingOnBoard(this.state, board.id).length === 1 && Math.abs(board.vx) + Math.abs(board.vy) + Math.abs(board.angularVelocity) > .0001);
    if (!available.length) return moving ? { type: 'wait', reason: '等玻璃落下或摆开一点，再判断露出的螺丝。' } : unknown('暂时没有找到能确认的下一颗。');

    // 即使搜索预算为零，也绝不把直接填满最后一孔的动作包装成安全提示。
    const safeIds = new Set(available.filter(screw => this.matchingBox(screw) || occupiedBuffer(this.state) + 1 < this.state.capacity).map(screw => screw.id));
    if (!safeIds.size) return moving ? { type: 'wait', reason: '现在点这些螺丝会填满暂存，先等玻璃移动。' } : unknown('当前可点螺丝都会填满暂存；暂未验证出可继续的路线。');

    const bounded = (value: number | undefined, fallback: number, maximum: number) =>
      value !== undefined && Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.floor(value))) : fallback;
    const maxNodes = bounded(options.maxNodes, 2400, 50000);
    const maxMs = bounded(options.maxMs, 120, 3000);
    const beamWidth = Math.max(1, bounded(options.beamWidth, 10, 40));
    const clock = () => typeof performance === 'undefined' ? Date.now() : performance.now();
    const deadline = clock() + maxMs;
    const exhausted = () => searchedNodes >= maxNodes || clock() >= deadline;
    if (exhausted()) return unknown('还没有核对出可靠的下一步，先别急着点。', true);
    const original = this.snapshot();
    const trial = new GameEngine(this.definition, original);
    const normalizeEmptyBoards = (state: GameState) => {
      // 模型只允许已拆空的板最终离场，不预测仍有钉板件的未来摆动。
      for (const board of state.boards) if (!board.melted && remainingOnBoard(state, board.id).length === 0) board.gone = true;
    };
    const firstRemaining = new Set(original.screws.filter(screw => screw.place === 'board').map(screw => screw.id));
    const cleanRoute = (route: string[]) => route.filter(id => firstRemaining.has(id));
    const replay = (route: string[]): 'solved' | 'failed' | 'budget' => {
      trial.state = clone(original);
      normalizeEmptyBoards(trial.state);
      for (const id of route) {
        if (exhausted()) return 'budget';
        searchedNodes++;
        const result = trial.perform({ type: 'pick', screwId: id }, false);
        if (!result.ok || trial.state.phase === 'stuck') return 'failed';
        normalizeEmptyBoards(trial.state);
      }
      return trial.state.phase === 'won' ? 'solved' : 'failed';
    };
    const describe = (id: string): string => {
      const screw = original.screws.find(item => item.id === id)!;
      const box = original.boxes.find(item => item.color === screw.color);
      const remaining = remainingOnBoard(original, screw.boardId).length;
      const action = box?.screws.length === 2 ? `这颗会装满${COLOR_NAMES[screw.color]}盒。` :
        box ? `这颗${COLOR_NAMES[screw.color]}螺丝可以直接入盒。` :
        remaining === 1 ? '先拆这颗，让这块玻璃落下。' :
        remaining === 2 ? '先拆这颗，让玻璃变成单钉支撑。' :
        `先放入第 ${original.buffer.indexOf(null) + 1} 个空孔。`;
      return action + '已核对当前姿态下的完整剩余路线。';
    };
    const finish = (route: string[]): HintInfo => {
      const id = route[0];
      if (!id || !safeIds.has(id) || !this.canPick(id)) {
        return falling ? { type: 'wait', reason: '等已拆空的玻璃落下，再走刚验证的路线。' } : unknown('完整路线的第一步目前不可点，暂不推荐。');
      }
      this.verifiedContinuation = [...route];
      return { type: 'move', id, reason: describe(id), model: 'static-current-pose', verifiedSteps: route.length, searchedNodes };
    };

    // 见证仅是候选：必须从当前盒色、固定槽位和板姿态重新逐步执行到胜利。
    const reference = cleanRoute(this.definition.witness.map(step => step.screwId));
    const candidates = [cleanRoute(this.verifiedContinuation), reference].filter(route => route.length > 0);
    const scoreScrew = (screw: ScrewState, state: GameState) => {
      const box = state.boxes.find(item => item.color === screw.color);
      const remaining = remainingOnBoard(state, screw.boardId).length;
      const board = state.boards.find(item => item.id === screw.boardId)!;
      return (box ? 30 + box.screws.length * 20 : 0) + (remaining === 1 ? 8 : 0) + board.depth * .01;
    };
    const ordered = available.filter(screw => safeIds.has(screw.id)).sort((a, b) => scoreScrew(b, original) - scoreScrew(a, original));
    for (const screw of ordered.slice(0, 6)) candidates.push([screw.id, ...reference.filter(id => id !== screw.id)]);
    const attempted = new Set<string>();
    for (const route of candidates) {
      const signature = route.join('|');
      if (attempted.has(signature)) continue;
      attempted.add(signature);
      const status = replay(route);
      if (status === 'solved') return finish(route);
      if (status === 'budget') return unknown('暂时没有把握推荐下一颗；先观察当前盒色和遮挡。', true);
    }

    interface SearchNode { state: GameState; path: string[]; score: number }
    const modelStart = clone(original);
    normalizeEmptyBoards(modelStart);
    const keyFor = (state: GameState): string => {
      const colors = new Map(state.screws.map(screw => [screw.id, screw.color]));
      return state.screws.map(screw => screw.place === 'board' ? '1' : '0').join('') + '|' + state.queueCursor + '|' +
        state.boxes.map(box => `${box.color}:${box.screws.length}`).join(',') + '|' +
        state.buffer.map(id => id === null ? '_' : colors.get(id)).join(',') + '|' + state.pocket.map(id => colors.get(id)).join(',');
    };
    const seen = new Set([keyFor(modelStart)]);
    let frontier: SearchNode[] = [{ state: modelStart, path: [], score: 0 }];
    while (frontier.length) {
      const next: SearchNode[] = [];
      for (const node of frontier) {
        trial.state = node.state;
        const choices = trial.available().filter(screw => node.path.length > 0 || safeIds.has(screw.id));
        choices.sort((a, b) => scoreScrew(b, node.state) - scoreScrew(a, node.state));
        for (const choice of choices.slice(0, 16)) {
          if (exhausted()) return unknown('暂时没有把握推荐下一颗；这不代表这一局过不了。', true);
          searchedNodes++;
          trial.state = clone(node.state);
          const result = trial.perform({ type: 'pick', screwId: choice.id }, false);
          if (!result.ok || trial.state.phase === 'stuck') continue;
          normalizeEmptyBoards(trial.state);
          const path = [...node.path, choice.id];
          if (trial.state.phase === 'won') {
            // 搜索找到候选后，再从原始克隆单独重放，避免把启发式评分当作证明。
            const verified = replay(path);
            if (verified === 'solved') return finish(path);
            if (verified === 'budget') return unknown('找到一种可能拆法，但还没确认完整路线，先不推荐。', true);
            continue;
          }
          const signature = keyFor(trial.state);
          if (seen.has(signature)) continue;
          seen.add(signature);
          const state = trial.state;
          const score = state.collected.length * 4 - occupiedBuffer(state) * 18 - state.pocket.length * 2 +
            state.boxes.reduce((sum, box) => sum + box.screws.length, 0) * 3 + state.boards.filter(board => board.gone || board.melted).length * 2;
          next.push({ state, path, score });
        }
      }
      next.sort((a, b) => b.score - a.score);
      frontier = next.slice(0, beamWidth);
    }
    return moving ? { type: 'wait', reason: '当前姿态还没验出完整续解，等玻璃摆开后再试。' } :
      unknown('这一步暂时没有把握推荐，不代表这一局过不了。');
  }

  dispatch(action: Action): ActionResult {
    return this.perform(action, true);
  }

  private perform(action: Action, record: boolean): ActionResult {
    if (this.state.phase === 'won') return { ok: false, events: [], reason: '这一关已经完成了' };
    const before = record ? this.snapshot() : undefined;
    const events: GameEvent[] = [];
    const reject = (reason: string): ActionResult => ({ ok: false, events: [], reason });
    if (action.type === 'pick') {
      if (!this.canPick(action.screwId)) return reject(this.state.phase === 'stuck' ? '先让 Doro 帮你腾出位置' : '这颗螺丝还被玻璃挡着');
      const screw = this.state.screws.find(item => item.id === action.screwId)!;
      const from = this.position(screw);
      events.push({ type: 'picked', screwId: screw.id, from });
      Object.assign(screw, from);
      const box = this.matchingBox(screw);
      if (box) this.putInBox(screw, box, events);
      else {
        const slotIndex = this.state.buffer.indexOf(null);
        if (slotIndex < 0) return reject('暂存孔已经满了');
        screw.place = 'buffer';
        this.state.buffer[slotIndex] = screw.id;
        events.push({ type: 'routed', screwId: screw.id, color: screw.color, destination: 'buffer', slotIndex, sourcePlace: 'board' });
      }
      this.state.moves++;
      if (!screw.detached) {
        const remaining = remainingOnBoard(this.state, screw.boardId).length;
        const board = this.state.boards.find(item => item.id === screw.boardId)!;
        if (remaining === 0) board.falling = true;
        events.push({ type: 'board-released', boardId: board.id, remaining });
      }
    } else {
      if (action.type === 'expand-box') {
        if (this.state.boxes.length >= 4) return reject('已经有四个收集盒了');
        this.openBox(events);
      } else if (action.type === 'expand-buffer') {
        if (this.state.capacity >= 7) return reject('已经有七个暂存孔了');
        this.state.capacity++;
        this.state.buffer.push(null);
      } else if (action.type === 'clear-buffer') {
        if (!occupiedBuffer(this.state)) return reject('暂存孔已经空了');
        this.storeInPocket(events);
      } else if (action.type === 'melt') {
        const board = this.state.boards.find(item => item.id === action.boardId);
        if (!board || board.active===false || board.gone || board.melted) return reject('这块玻璃现在不能选择');
        for (const screw of remainingOnBoard(this.state, board.id)) {
          Object.assign(screw, this.position(screw));
          screw.detached = true;
        }
        board.melted = true;
        board.falling = false;
        board.vx = board.vy = board.angularVelocity = 0;
        events.push({ type: 'melted', boardId: board.id });
      } else if (action.type === 'revive') {
        if (this.state.phase !== 'stuck') return reject('现在可以继续拆螺丝');
        if (this.state.boxes.length < 4) {
          this.openBox(events);
        } else this.storeInPocket(events);
      }
      this.state.stats.assists[action.type]++;
      this.state.toolsUsed=assistCount(this.state.stats);
      events.push({ type: 'tool', tool: action.type });
    }
    this.settle(events);
    if(action.type==='pick')this.state.stats.picks++;
    const completed=events.filter(event=>event.type==='box-completed').length;
    this.state.stats.boxesCompleted+=completed;this.state.stats.maxChain=Math.max(this.state.stats.maxChain,completed);
    this.state.stats.peakBuffer=Math.max(this.state.stats.peakBuffer,occupiedBuffer(this.state));
    this.state.stats.elapsedMs=Math.max(this.state.stats.elapsedMs,this.state.elapsedMs);
    this.state.actionRevision++;
    if (record) {
      assertConservation(this.state);
      this.history.push(freezeState(before!));
      // 保留完整的大关和常用救场回退，快照包含动作前物理姿态与固定槽位。
      if (this.history.length > 512) this.history.shift();
    }
    return { ok: true, events, ...(before ? { before } : {}) };
  }

  private matchingBox(screw: ScrewState): BoxState | undefined {
    return this.state.boxes.find(box => box.color === screw.color && box.screws.length < 3);
  }

  private openBox(events: GameEvent[]): void {
    const box: BoxState = { id: this.state.boxes.length, color: this.nextColor(), screws: [], completed: 0 };
    this.state.boxes.push(box);
    events.push({ type: 'box-opened', boxId: box.id, boxGeneration:box.completed, color: box.color });
  }

  private nextColor(): BoxState['color'] {
    return this.state.queueCursor < this.state.boxQueue.length ? this.state.boxQueue[this.state.queueCursor++] : null;
  }

  private putInBox(screw: ScrewState, box: BoxState, events: GameEvent[], sourceSlotIndex?: number): void {
    const sourcePlace: ScrewPlace = screw.place;
    const slotIndex = box.screws.length;
    screw.place = 'box';
    box.screws.push(screw.id);
    events.push({ type: 'routed', screwId: screw.id, color: screw.color, destination: 'box', boxId: box.id, boxGeneration:box.completed, slotIndex, sourcePlace,
      ...(sourceSlotIndex === undefined ? {} : { sourceSlotIndex }) });
    if (box.screws.length === 3) {
      for (const id of box.screws) {
        this.state.screws.find(item => item.id === id)!.place = 'done';
        this.state.collected.push(id);
      }
      events.push({ type: 'box-completed', boxId: box.id, boxGeneration:box.completed, color: box.color! });
      box.completed++;
      box.screws = [];
      box.color = this.nextColor();
      events.push({ type: 'box-opened', boxId: box.id, boxGeneration:box.completed, color: box.color });
    }
  }

  private storeInPocket(events: GameEvent[]): void {
    for (let index = 0; index < this.state.buffer.length; index++) {
      const id = this.state.buffer[index];
      if (id === null) continue;
      const screw = this.state.screws.find(screw => screw.id === id)!;
      screw.place = 'pocket';
      this.state.pocket.push(id);
      this.state.buffer[index] = null;
      events.push({ type: 'routed', screwId: id, color: screw.color, destination: 'pocket', sourcePlace: 'buffer', sourceSlotIndex: index, slotIndex: this.state.pocket.length - 1 });
    }
  }

  private refillBoxes(events: GameEvent[]): void {
    // 每次只转移一颗就重新从暂存区扫描，保证新盒的回流顺序确定。
    let moved = true;
    while (moved) {
      moved = false;
      for (const place of ['buffer', 'pocket'] as const) {
        const source = this.state[place];
        const index = source.findIndex(id => id !== null && this.matchingBox(this.state.screws.find(screw => screw.id === id)!));
        if (index < 0) continue;
        const id = source[index]!;
        if (place === 'buffer') this.state.buffer[index] = null;
        else this.state.pocket.splice(index, 1);
        const screw = this.state.screws.find(item => item.id === id)!;
        this.putInBox(screw, this.matchingBox(screw)!, events, index);
        moved = true;
        break;
      }
    }
  }

  private settle(events: GameEvent[]): void {
    const reveal=this.state.reveal;
    if(reveal&&this.state.boards.some(board=>board.group===reveal.group&&board.active===false)){
      const cleared=this.state.boards.filter(board=>board.active!==false&&(board.melted||remainingOnBoard(this.state,board.id).length===0)).length;
      if(cleared>=reveal.afterCleared){
        const boards=this.state.boards.filter(board=>board.group===reveal.group&&board.active===false);
        for(const board of boards)board.active=true;
        events.push({type:'group-revealed',group:reveal.group,boardIds:boards.map(board=>board.id)});
      }
    }
    this.refillBoxes(events);
    const previous = this.state.phase;
    if (this.state.screws.every(screw => screw.place === 'done')) this.state.phase = 'won';
    else this.state.phase = occupiedBuffer(this.state) >= this.state.capacity ? 'stuck' : 'playing';
    if (this.state.phase !== previous && this.state.phase === 'stuck') events.push({ type: 'stuck' });
    if (this.state.phase !== previous && this.state.phase === 'won') events.push({ type: 'won' });
  }
}
