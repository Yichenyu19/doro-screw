import { writeFileSync } from 'node:fs';
import { GameEngine } from '../src/core.ts';
import { setShapeOutlines } from '../src/geometry.ts';
import { physicsSimulation } from '../src/matter-analysis.ts';
import { getContentLevel } from '../src/content.ts';
import art from '../src/art-frames-v2.json';

setShapeOutlines((art as {outlines?:unknown}).outlines ?? art);

export type Kind = 'random' | 'visible' | 'matching' | 'greedy';
function mulberry(seed: number) {
  let x = seed >>> 0;
  return () => { x += 0x6D2B79F5; let t = Math.imul(x ^ (x >>> 15), 1 | x); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function topMost(game: GameEngine, available: ReturnType<GameEngine['available']>) {
  return [...available].sort((a, b) => {
    const da = game.state.boards.find(p => p.id === a.boardId)!.depth;
    const db = game.state.boards.find(p => p.id === b.boardId)!.depth;
    return db - da || a.id.localeCompare(b.id);
  })[0]!;
}

export async function play(kind: Kind, seed: number, level: Awaited<ReturnType<typeof getContentLevel>>) {
  const game = new GameEngine(level);
  const sim = physicsSimulation(game);
  const rnd = mulberry(seed);
  let steps = 0;
  const limit = level.boards.reduce((n, b) => n + b.screws.length, 0) + 8;
  const settle = (frames: number) => { for (let i = 0; i < frames; i++) { sim.step(); game.advanceWorld(1000 / 60); } };
  while (game.state.phase === 'playing' && steps < limit) {
    sim.sync();
    settle(24);
    if (!game.available().length) {
      for (let i = 0; i < 900 && !game.available().length && game.state.phase === 'playing'; i++) { sim.step(); game.advanceWorld(1000 / 60); }
    }
    let available = game.available();
    if (!available.length) break;
    let choice = available[0]!;
    if (kind === 'random') choice = available[Math.floor(rnd() * available.length)]!;
    else if (kind === 'visible') choice = topMost(game, available);
    else if (kind === 'matching') {
      let matching = available.filter(s => game.state.boxes.some(b => b.color === s.color));
      if (!matching.length) {
        for (let i = 0; i < 900 && !matching.length && game.state.phase === 'playing'; i++) {
          sim.step(); game.advanceWorld(1000 / 60);
          matching = game.available().filter(s => game.state.boxes.some(b => b.color === s.color));
        }
      }
      if (!matching.length) break;
      choice = matching[0]!;
    } else {
      const matching = available.filter(s => game.state.boxes.some(b => b.color === s.color));
      choice = matching.length ? topMost(game, matching) : topMost(game, available);
    }
    const result = game.dispatch({ type: 'pick', screwId: choice.id });
    if (!result.ok) break;
    sim.sync();
    steps++;
  }
  return { kind, seed, phase: game.state.phase, moves: game.state.moves, occupied: game.state.buffer.filter(Boolean).length, peak: game.state.stats.peakBuffer };
}

function summarize(kind: Kind, rows: Awaited<ReturnType<typeof play>>[]) {
  const runs = rows.length;
  const wins = rows.filter(r => r.phase === 'won').length;
  const stuck = rows.filter(r => r.phase === 'stuck').length;
  const stuckAt = rows.filter(r => r.phase === 'stuck').map(r => r.moves);
  return {
    runs, wins, stuck, playing: rows.filter(r => r.phase === 'playing').length,
    winRate: +(wins / runs).toFixed(4),
    stuckRate: +(stuck / runs).toFixed(4),
    meanMoves: +(rows.reduce((n, r) => n + r.moves, 0) / runs).toFixed(2),
    meanStuckMoves: stuckAt.length ? +(stuckAt.reduce((a, b) => a + b, 0) / stuckAt.length).toFixed(2) : null,
    meanPeakBuffer: +(rows.reduce((n, r) => n + r.peak, 0) / runs).toFixed(2),
  };
}

async function main() {
  const label = process.argv[2] || 'before';
  const runs = Number(process.argv[3] || 200);
  const ids = (process.argv[4] || '1,2').split(',').map(Number);
  const kinds: Kind[] = ['random', 'visible', 'matching', 'greedy'];
  const report: any = { label, runs, levels: [], startedAt: new Date().toISOString() };
  for (const id of ids) {
    const level = await getContentLevel(id, 0, 'v4', 'campaign');
    const entry: any = { levelId: level.id, name: level.name, pins: level.boards.reduce((n, b) => n + b.screws.length, 0), revision: level.contentRevision, results: {} };
    for (const kind of kinds) {
      const rows = [];
      for (let i = 0; i < runs; i++) rows.push(await play(kind, 7919 + id * 100000 + i * 3571, level));
      entry.results[kind] = summarize(kind, rows);
      console.log(`L${id} ${kind}`, entry.results[kind]);
    }
    report.levels.push(entry);
  }
  report.finishedAt = new Date().toISOString();
  const out = process.argv[5] || `/workspace/doro-screw-review/logs/weak-policies-${label}.json`;
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('wrote', out);
}
const isDirect=process.argv.some(arg=>arg.endsWith('scripts/weak-policies.ts')||arg.endsWith('/weak-policies.ts'));if(isDirect)void main();
