import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine,assertConservation,occupiedBuffer} from '../src/core';
import {getCampaignLevel} from '../src/authored-r2';
import {physicsSimulation} from '../src/matter-analysis';
import {clearRank} from '../src/run';
import type {LevelDef} from '../src/types';

function settle(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,frames=24){
  for(let i=0;i<frames;i++){sim.step();game.advanceWorld(1000/60);}
}
function waitFor(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,id:string){
  sim.sync();let stable=0;for(let i=0;i<1800&&stable<12;i++){sim.step();game.advanceWorld(1000/60);stable=game.canPick(id)?stable+1:0;}
}
function mulberry(seed:number){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}
function playRandomUntilStuck(seed=4242){
  const level=getCampaignLevel(2),game=new GameEngine(level),sim=physicsSimulation(game),rnd=mulberry(seed);
  for(let steps=0;steps<40&&game.state.phase==='playing';steps++){
    sim.sync();settle(game,sim);
    if(!game.available().length){for(let i=0;i<900&&!game.available().length&&game.state.phase==='playing';i++){sim.step();game.advanceWorld(1000/60);}}
    const available=game.available();
    if(!available.length)break;
    const choice=available[Math.floor(rnd()*available.length)]!;
    assert(game.dispatch({type:'pick',screwId:choice.id}).ok);
    sim.sync();
  }
  return{level,game,sim};
}
function finishOfficial(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,level:LevelDef){
  for(const step of level.witness){
    if(game.state.phase==='won')break;
    if(game.state.screws.find(s=>s.id===step.screwId)?.place!=='board')continue;
    waitFor(game,sim,step.screwId);
    let id=step.screwId;
    if(!game.canPick(id)){
      const next=game.available().filter(s=>game.state.boxes.some(b=>b.color===s.color))[0]??game.available()[0];
      assert(next,'官方续解没有可点螺丝');id=next.id;
    }
    const result=game.dispatch({type:'pick',screwId:id});
    assert(result.ok,result.reason??'官方续解失败');
    sim.sync();for(let i=0;i<Math.ceil((step.waitMs??50)/(1000/60));i++){sim.step();game.advanceWorld(1000/60);}
  }
}

test('第二关乱点会满孔锁死，撤一两步通常救不回来',()=>{
  const{game}=playRandomUntilStuck();
  assert.equal(game.state.phase,'stuck');
  assert.equal(occupiedBuffer(game.state),game.state.capacity);
  assert.ok(game.state.moves>=5);
  assert(game.undo());
  const afterOne=game.state.phase==='stuck'||!game.witnessSolves(game.state);
  assert.equal(afterOne,true,'撤回一步后官方线仍应走不通或仍锁死');
  if(game.state.phase!=='stuck'&&game.canUndo)game.undo();
  const afterTwo=game.state.phase==='stuck'||!game.witnessSolves(game.state)||occupiedBuffer(game.state)>=3;
  assert.equal(afterTwo,true);
});

test('满孔后回到可解点，沿官方线可通关，只记撤回、不算辅助',()=>{
  const{level,game,sim}=playRandomUntilStuck();
  assert.equal(game.state.phase,'stuck');
  const plan=game.solvableRewindPlan();
  assert.equal(plan.ok,true);
  assert.ok(plan.steps>2,`应多步回退，实际 ${plan.steps}`);
  const result=game.rewindToSolvable();
  assert.equal(result.ok,true);
  assert.equal(game.state.phase,'playing');
  assert.equal(game.state.stats.undos,result.steps);
  assert.equal(Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0),0);
  // 大墙上即使正好走在官方前缀，下一颗也可能要等落板，静态见证不能单独证明可续解。
  assert.ok(game.state.moves===0||game.isOfficialPrefix());
  finishOfficial(game,sim,level);
  assert.equal(game.state.phase,'won');
  assert.equal(Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0),0);
  assert.equal(clearRank(game.state.stats),'independent');
  assertConservation(game.state);
});

test('回到可解点不是免费通关：救回后再乱点仍可能再次锁死',()=>{
  const{game}=playRandomUntilStuck();
  assert(game.rewindToSolvable().ok);
  assert.equal(game.state.phase,'playing');
  const start=game.state.moves;
  while(game.state.phase==='playing'&&game.available().length&&game.state.moves-start<8){
    const pick=game.available()[0]!;
    if(!game.dispatch({type:'pick',screwId:pick.id}).ok)break;
  }
  assert.notEqual(game.state.phase,'won');
});

function finishOfficialStrict(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,level:LevelDef){
  for(const step of level.witness){
    if(game.state.phase==='won')break;
    if(game.state.screws.find(s=>s.id===step.screwId)?.place!=='board')continue;
    waitFor(game,sim,step.screwId);
    assert(game.canPick(step.screwId),`官方钉 ${step.screwId} 在 ${game.state.moves} 步后仍不可点`);
    const result=game.dispatch({type:'pick',screwId:step.screwId});
    assert(result.ok,result.reason??'官方续解失败');
    sim.sync();for(let i=0;i<Math.ceil((step.waitMs??50)/(1000/60));i++){sim.step();game.advanceWorld(1000/60);}
  }
}

test('先前 3 个失败种子：撤回后同步物理姿态，并退到官方前缀或开局，严格官方线可通关',()=>{
  for(const seed of [67594,748628,1397986]){
    const{level,game,sim}=playRandomUntilStuck(seed);
    assert.equal(game.state.phase,'stuck');
    const plan=game.solvableRewindPlan();
    assert.equal(plan.ok,true,`seed ${seed} 应能回退`);
    assert.equal(plan.moves,0,`seed ${seed} 应退回开局，实际 ${plan.moves}`);
    const result=game.rewindToSolvable();
    assert.equal(result.ok,true);
    assert.equal(game.state.moves,0);
    assert.equal(game.isOfficialPrefix(),true);
    finishOfficialStrict(game,sim,level);
    assert.equal(game.state.phase,'won',`seed ${seed} 开局后续官方线未过`);
    assert.equal(Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0),0);
  }
});
