import test from 'node:test';
import assert from 'node:assert/strict';
import {getR2Challenge} from '../src/challenges-r2';
import {GameEngine,assertConservation} from '../src/core';
import {physicsSimulation} from '../src/matter-analysis';

const SAMPLES=[
  {theme:2,attempt:0,mode:'mastery' as const},
  {theme:3,attempt:1,mode:'mastery' as const},
  {theme:8,attempt:5,mode:'mastery' as const},
  {theme:2,attempt:0,mode:'rescue' as const},
  {theme:6,attempt:29,mode:'rescue' as const},
];

test('主题挑战抽样：精修与残局沿官方见证带物理可解且不用道具',async()=>{
  for(const sample of SAMPLES){
    const level=await getR2Challenge(sample.theme,sample.attempt,sample.mode);
    const game=level.challengeStart?new GameEngine(level,level.challengeStart.state):new GameEngine(level);
    const sim=physicsSimulation(game);
    for(const step of level.witness){
      if(game.state.screws.find(s=>s.id===step.screwId)?.place!=='board')continue;
      sim.sync();let stable=0;
      for(let i=0;i<1800&&stable<12;i++){sim.step();game.advanceWorld(1000/60);stable=game.canPick(step.screwId)?stable+1:0;}
      const result=game.dispatch({type:'pick',screwId:step.screwId});
      assert(result.ok,JSON.stringify({...sample,screwId:step.screwId,moves:game.state.moves,phase:game.state.phase,reason:result.reason}));
      sim.sync();
      for(let i=0;i<Math.ceil((step.waitMs??50)/(1000/60));i++){sim.step();game.advanceWorld(1000/60);}
    }
    assert.equal(game.state.phase,'won',`${sample.mode} 主题 ${sample.theme} 尝试 ${sample.attempt} 未过`);
    assert.equal(Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0),0);
    assertConservation(game.state);
  }
});
