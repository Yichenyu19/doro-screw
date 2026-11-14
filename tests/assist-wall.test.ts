import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {getCampaignLevel} from '../src/authored-r2';
import {GameEngine,assertConservation,occupiedBuffer} from '../src/core';
import {physicsSimulation} from '../src/matter-analysis';
import {clearRank} from '../src/run';
import {play} from '../scripts/weak-policies';
import type {Action} from '../src/types';

function settle(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,frames=24){
  for(let i=0;i<frames;i++){sim.step();game.advanceWorld(1000/60);}
}
function waitFor(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,id:string){
  sim.sync();let stable=0;for(let i=0;i<1800&&stable<12;i++){sim.step();game.advanceWorld(1000/60);stable=game.canPick(id)?stable+1:0;}
}
function mulberry(seed:number){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}

function useAssist(game:GameEngine):boolean{
  const options:Action[]=[{type:'clear-buffer'},{type:'expand-buffer'},{type:'expand-box'}];
  for(const action of options){
    const preview=game.toolPreview(action);
    if(preview.available&&(preview.freed>0||preview.added>0||preview.result==='playing')){
      const result=game.dispatch(action);
      if(result.ok)return true;
    }
  }
  if(game.solvableRewindPlan().ok)return game.rewindToSolvable().ok;
  return false;
}

test('第二关大墙：乱点样本几乎都不通关，使用免费辅助能从锁死打到通关',async()=>{
  const level=getCampaignLevel(2);
  assert.equal(level.boards.reduce((n,b)=>n+b.screws.length,0),120);
  const RUNS=40;
  const random=[];
  for(let i=0;i<RUNS;i++)random.push(await play('random',90219+i*3571,level));
  const wins=random.filter(r=>r.phase==='won').length;
  const stuck=random.filter(r=>r.phase==='stuck').length;
  mkdirSync('/workspace/doro-screw-review/logs',{recursive:true});
  writeFileSync('/workspace/doro-screw-review/logs/weak-policies-l2-wall.json',JSON.stringify({runs:RUNS,wins,stuck,winRate:wins/RUNS,stuckRate:stuck/RUNS,rows:random},null,2));
  assert.ok(wins/RUNS<=0.05,`乱点仍有 ${wins}/${RUNS} 通关，大墙预期应几乎全败`);
  assert.ok(stuck>=RUNS*0.7,`乱点锁死偏少：${stuck}/${RUNS}`);

  const game=new GameEngine(level),sim=physicsSimulation(game),rnd=mulberry(4242);
  for(let steps=0;steps<80&&game.state.phase==='playing';steps++){
    sim.sync();settle(game,sim);
    if(!game.available().length){for(let i=0;i<900&&!game.available().length&&game.state.phase==='playing';i++){sim.step();game.advanceWorld(1000/60);}}
    const available=game.available();
    if(!available.length)break;
    const choice=available[Math.floor(rnd()*available.length)]!;
    game.dispatch({type:'pick',screwId:choice.id});
    sim.sync();
  }
  assert.equal(game.state.phase,'stuck','乱点脚本未能把大墙打到满孔锁死');
  const beforeMoves=game.state.moves;
  let assists=0;
  assert.equal(useAssist(game),true,'锁死后免费辅助未能打开局面');
  assists=Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0)+game.state.stats.hintsShown;
  // 继续沿官方线，必要时再用辅助腾孔
  for(const step of level.witness){
    if(game.state.phase==='won')break;
    if(game.state.phase==='stuck')assert(useAssist(game),'中途锁死，辅助未能救场');
    if(game.state.screws.find(s=>s.id===step.screwId)?.place!=='board')continue;
    waitFor(game,sim,step.screwId);
    let id=step.screwId;
    if(!game.canPick(id)){
      const next=game.available().filter(s=>game.state.boxes.some(b=>b.color===s.color))[0]??game.available()[0];
      if(!next){assert(useAssist(game),'无子可走时辅助失败');continue;}
      id=next.id;
    }
    if(occupiedBuffer(game.state)+1>=game.state.capacity&&!game.state.boxes.some(b=>b.color===game.state.screws.find(s=>s.id===id)?.color)){
      useAssist(game);
    }
    const result=game.dispatch({type:'pick',screwId:id});
    if(!result.ok){
      assert(useAssist(game),'走官方线失败后辅助仍无效：'+(result.reason??''));
      continue;
    }
    sim.sync();for(let i=0;i<Math.ceil((step.waitMs??50)/(1000/60));i++){sim.step();game.advanceWorld(1000/60);}
  }
  if(game.state.phase!=='won'&&game.solvableRewindPlan().ok){
    game.rewindToSolvable();
    for(const step of level.witness){
      if(game.state.phase==='won')break;
      if(game.state.screws.find(s=>s.id===step.screwId)?.place!=='board')continue;
      waitFor(game,sim,step.screwId);
      if(!game.canPick(step.screwId))continue;
      game.dispatch({type:'pick',screwId:step.screwId});
      sim.sync();
    }
  }
  assert.equal(game.state.phase,'won','使用免费辅助后仍未通关');
  const tools=Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0);
  assert.ok(tools>0||game.state.stats.undos>0,'通关路径没有记到辅助或撤回');
  if(tools>0)assert.equal(clearRank(game.state.stats),'complete');
  assert.ok(game.state.moves>=beforeMoves||game.state.stats.undos>0);
  assertConservation(game.state);
  writeFileSync('/workspace/doro-screw-review/logs/assist-wall-clear.json',JSON.stringify({
    phase:game.state.phase,moves:game.state.moves,undos:game.state.stats.undos,assists:game.state.stats.assists,rank:clearRank(game.state.stats),
  },null,2));
});
