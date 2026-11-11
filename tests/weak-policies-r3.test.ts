import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {getCampaignLevel} from '../src/authored-r2';
import {GameEngine} from '../src/core';
import {play} from '../scripts/weak-policies';

const RUNS=200;
function summarize(rows:Awaited<ReturnType<typeof play>>[]){
  const runs=rows.length,wins=rows.filter(r=>r.phase==='won').length,stuck=rows.filter(r=>r.phase==='stuck').length;
  return{runs,wins,stuck,playing:rows.filter(r=>r.phase==='playing').length,winRate:wins/runs,stuckRate:stuck/runs};
}

test('第一关弱策略：盒色/贪心应高通关，乱点也应明显可过',async()=>{
  const level=getCampaignLevel(1);
  const kinds=['matching','greedy','random','visible'] as const;
  const table:Record<string,ReturnType<typeof summarize>>={};
  for(const kind of kinds){
    const rows=[];
    for(let i=0;i<RUNS;i++)rows.push(await play(kind,4219+i*7919,level));
    table[kind]=summarize(rows);
  }
  writeFileSync('/workspace/doro-screw-review/logs/weak-policies-l1-test.json',JSON.stringify(table,null,2));
  assert.ok(table.matching.winRate>0.8,`只点盒色 ${table.matching.wins}/${RUNS}`);
  assert.ok(table.greedy.winRate>0.8,`贪心 ${table.greedy.wins}/${RUNS}`);
  assert.ok(table.random.winRate>0.25,`乱点 ${table.random.wins}/${RUNS}`);
});

test('第二关大墙弱策略：乱点明显低于第一关，通关率应接近失败',async()=>{
  const l1=getCampaignLevel(1),l2=getCampaignLevel(2);
  const random1=[],random2=[],greedy2=[],matching2=[];
  const WALL_RUNS=40;
  for(let i=0;i<WALL_RUNS;i++){
    random1.push(await play('random',5219+i*3571,l1));
    random2.push(await play('random',6219+i*3571,l2));
    greedy2.push(await play('greedy',7219+i*3571,l2));
    matching2.push(await play('matching',8219+i*3571,l2));
  }
  const r1=summarize(random1),r2=summarize(random2),g2=summarize(greedy2),m2=summarize(matching2);
  writeFileSync('/workspace/doro-screw-review/logs/weak-policies-l2-test.json',JSON.stringify({r1,r2,g2,m2},null,2));
  assert.ok(r2.winRate<r1.winRate-0.15,`第2关乱点 ${r2.wins}/${WALL_RUNS} 未明显低于第1关 ${r1.wins}/${WALL_RUNS}`);
  assert.ok(r2.winRate<=0.05,`第2关大墙乱点仍有 ${r2.wins}/${WALL_RUNS} 通关`);
});
