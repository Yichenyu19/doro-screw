import { writeFileSync } from 'node:fs';
import { GameEngine, occupiedBuffer } from '../src/core.ts';
import { setShapeOutlines } from '../src/geometry.ts';
import { physicsSimulation } from '../src/matter-analysis.ts';
import { getContentLevel } from '../src/content.ts';
import { clearRank } from '../src/run.ts';
import art from '../src/art-frames-v2.json';

setShapeOutlines((art as {outlines?:unknown}).outlines ?? art);

function mulberry(seed: number) {
  let x = seed >>> 0;
  return () => { x += 0x6D2B79F5; let t = Math.imul(x ^ (x >>> 15), 1 | x); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function topMost(game: GameEngine) {
  const available = game.available();
  return [...available].sort((a, b) => {
    const da = game.state.boards.find(p => p.id === a.boardId)!.depth;
    const db = game.state.boards.find(p => p.id === b.boardId)!.depth;
    return db - da || a.id.localeCompare(b.id);
  })[0];
}
function settle(game: GameEngine, sim: ReturnType<typeof physicsSimulation>, frames = 24) {
  for (let i = 0; i < frames; i++) { sim.step(); game.advanceWorld(1000 / 60); }
}
function waitAvailable(game: GameEngine, sim: ReturnType<typeof physicsSimulation>) {
  sim.sync(); settle(game, sim);
  if (!game.available().length) {
    for (let i = 0; i < 900 && !game.available().length && game.state.phase === 'playing'; i++) {
      sim.step(); game.advanceWorld(1000 / 60);
    }
  }
}
function choose(game: GameEngine, kind: 'random' | 'greedy', rnd: () => number) {
  const available = game.available();
  if (!available.length) return null;
  if (kind === 'random') return available[Math.floor(rnd() * available.length)]!;
  const matching = available.filter(s => game.state.boxes.some(b => b.color === s.color));
  const pool = matching.length ? matching : available;
  return [...pool].sort((a, b) => {
    const da = game.state.boards.find(p => p.id === a.boardId)!.depth;
    const db = game.state.boards.find(p => p.id === b.boardId)!.depth;
    return db - da || a.id.localeCompare(b.id);
  })[0]!;
}

async function playPhase(game: GameEngine, sim: ReturnType<typeof physicsSimulation>, kind: 'random' | 'greedy', rnd: () => number, limit: number) {
  let steps = 0;
  while (game.state.phase === 'playing' && steps < limit) {
    waitAvailable(game, sim);
    const choice = choose(game, kind, rnd);
    if (!choice) break;
    if (!game.dispatch({ type: 'pick', screwId: choice.id }).ok) break;
    sim.sync();
    steps++;
  }
  return steps;
}

function finishOfficial(game: GameEngine, sim: ReturnType<typeof physicsSimulation>, witness: {screwId:string;waitMs?:number}[]) {
  for (const step of witness) {
    if (game.state.phase === 'won') break;
    if (game.state.screws.find(s => s.id === step.screwId)?.place !== 'board') continue;
    sim.sync();
    let stable = 0;
    for (let i = 0; i < 1800 && stable < 12; i++) { sim.step(); game.advanceWorld(1000 / 60); stable = game.canPick(step.screwId) ? stable + 1 : 0; }
    if (!game.canPick(step.screwId)) return;
    if (!game.dispatch({ type: 'pick', screwId: step.screwId }).ok) return;
    sim.sync();
    for (let i = 0; i < Math.ceil((step.waitMs ?? 50) / (1000 / 60)); i++) { sim.step(); game.advanceWorld(1000 / 60); }
  }
}

async function runOne(level: Awaited<ReturnType<typeof getContentLevel>>, seed: number, after: 'greedy' | 'random' | 'official' | 'undo2-greedy') {
  const game = new GameEngine(level);
  const sim = physicsSimulation(game);
  const rnd = mulberry(seed);
  const limit = level.boards.reduce((n, b) => n + b.screws.length, 0) + 8;
  await playPhase(game, sim, 'random', rnd, limit);
  const before = { phase: game.state.phase, moves: game.state.moves, occupied: occupiedBuffer(game.state) };
  if (before.phase !== 'stuck') {
    return { seed, before, rescued: false, steps: 0, afterPhase: before.phase, undos: game.state.stats.undos, assists: 0, rank: before.phase === 'won' ? clearRank(game.state.stats) : null };
  }
  if (after === 'undo2-greedy') {
    game.undo(); game.undo();
    if (game.state.phase === 'playing') await playPhase(game, sim, 'greedy', rnd, limit);
    return { seed, before, rescued: false, steps: 2, afterPhase: game.state.phase, undos: game.state.stats.undos, assists: Object.values(game.state.stats.assists).reduce((n, v) => n + v, 0), rank: game.state.phase === 'won' ? clearRank(game.state.stats) : null };
  }
  const plan = game.solvableRewindPlan();
  if (!plan.ok) {
    return { seed, before, rescued: false, steps: 0, afterPhase: 'stuck', undos: 0, assists: 0, rank: null, reason: plan.reason };
  }
  const result = game.rewindToSolvable();
  if (after === 'official') finishOfficial(game, sim, level.witness);
  else await playPhase(game, sim, after, rnd, limit);
  return {
    seed, before, rescued: result.ok, steps: result.steps, afterPhase: game.state.phase,
    undos: game.state.stats.undos, assists: Object.values(game.state.stats.assists).reduce((n, v) => n + v, 0),
    rank: game.state.phase === 'won' ? clearRank(game.state.stats) : null, moves: game.state.moves,
  };
}

async function main() {
  const runs = Number(process.argv[2] || 200);
  const level = await getContentLevel(2, 0, 'v4', 'campaign');
  const policies = ['undo2-greedy', 'random', 'greedy', 'official'] as const;
  const report: any = { levelId: 2, name: level.name, runs, startedAt: new Date().toISOString(), results: {} };
  for (const policy of policies) {
    const rows = [];
    for (let i = 0; i < runs; i++) rows.push(await runOne(level, 4242 + i * 7919, policy));
    const stuck = rows.filter(r => r.before.phase === 'stuck');
    const wins = rows.filter(r => r.afterPhase === 'won');
    const rescued = rows.filter(r => r.rescued);
    const meanSteps = rescued.length ? +(rescued.reduce((n, r) => n + r.steps, 0) / rescued.length).toFixed(2) : null;
    const summary = {
      runs: rows.length,
      stuckBefore: stuck.length,
      rescued: rescued.length,
      wins: wins.length,
      winRateAll: +(wins.length / rows.length).toFixed(4),
      winRateAmongStuck: stuck.length ? +(rows.filter(r => r.before.phase === 'stuck' && r.afterPhase === 'won').length / stuck.length).toFixed(4) : null,
      meanRewindSteps: meanSteps,
      ranks: wins.reduce((acc: Record<string, number>, r) => { acc[r.rank ?? 'none'] = (acc[r.rank ?? 'none'] ?? 0) + 1; return acc; }, {}),
      leftoverStuck: rows.filter(r => r.afterPhase === 'stuck').length,
      leftoverPlaying: rows.filter(r => r.afterPhase === 'playing').length,
    };
    report.results[policy] = summary;
    console.log(policy, summary);
  }
  report.finishedAt = new Date().toISOString();
  const out = process.argv[3] || '/workspace/doro-screw-review/logs/rescue-rewind-l2.json';
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('wrote', out);
}

const isDirect = process.argv.some(arg => arg.endsWith('scripts/rescue-rewind.ts') || arg.endsWith('/rescue-rewind.ts'));
if (isDirect) void main();
