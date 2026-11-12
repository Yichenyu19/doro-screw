import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {getCampaignLevel} from '../src/authored-r2';
import {GameEngine} from '../src/core';
import {play} from '../scripts/weak-policies';

function summarize(rows:Awaited<ReturnType<typeof play>>[]){
  const runs=rows.length,wins=rows.filter(r=>r.phase==='won').length,stuck=rows.filter(r=>r.phase==='stuck').length;
  return{runs,wins,stuck,playing:rows.filter(r=>r.phase==='playing').length,winRate:wins/runs,stuckRate:stuck/runs};
}

test('第一关弱策略：乱点和贪心过不去',async()=>{
  const level=getCampaignLevel(1);
  const kinds=['greedy','random','visible'] as const;
  const table:Record<string,ReturnType<typeof summarize>>={};
  for(const kind of kinds){
    const rows=[];
    for(let i=0;i<40;i++)rows.push(await play(kind,4219+i*7919,level));
    table[kind]=summarize(rows);
  }
  writeFileSync('/workspace/doro-screw-review/logs/weak-policies-l1-test.json',JSON.stringify(table,null,2));
  assert.equal(table.greedy.wins,0,`贪心 ${table.greedy.wins}/40`);
  assert.ok(table.random.winRate<=0.1,`乱点 ${table.random.wins}/40`);
  assert.ok(table.visible.winRate<=0.1,`只点最上层 ${table.visible.wins}/40`);
});

test('第二关大墙弱策略：乱点仍然过不去',async()=>{
  const l2=getCampaignLevel(2);
  const random2=[],greedy2=[];
  const WALL_RUNS=40;
  for(let i=0;i<WALL_RUNS;i++){
    random2.push(await play('random',6219+i*3571,l2));
    if(i===0)greedy2.push(await play('greedy',7219,l2));
  }
  const r2=summarize(random2),g2=summarize(greedy2);
  writeFileSync('/workspace/doro-screw-review/logs/weak-policies-l2-test.json',JSON.stringify({r2,g2},null,2));
  assert.equal(g2.wins,0);
  assert.ok(r2.winRate<=0.05,`第2关大墙乱点仍有 ${r2.wins}/${WALL_RUNS} 通关`);
});
