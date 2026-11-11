import test from 'node:test';
import assert from 'node:assert/strict';
import {getR2Prototype} from '../src/authored-r2';
import {GameEngine} from '../src/core';
import {physicsSimulation} from '../src/matter-analysis';
import {blockingBoards} from '../src/geometry';
import {VisibilityCache} from '../src/visibility-cache';
test('区域遮挡缓存与完整几何一致：整局移动、离场、后备显层、撤回和熔板',()=>{
  const level=getR2Prototype(8),game=new GameEngine(level),sim=physicsSimulation(game),cache=new VisibilityCache();let checked=0,full=0;
  const check=()=>{checked+=cache.update(game.state);const expected:string[]=[],readable:string[]=[];
    for(const s of game.state.screws){const b=game.state.boards.find(b=>b.id===s.boardId)!;if(s.place!=='board'||b.active===false||(b.gone&&!s.detached))continue;full++;const n=blockingBoards(game.state,s.id).length;if(n===0)expected.push(s.id);if(n<=1)readable.push(s.id);}
    assert.deepEqual([...cache.exposed].sort(),expected.sort());assert.deepEqual([...cache.readable].sort(),readable.sort());
  };
  for(const step of level.witness){sim.sync();let stable=0;for(let i=0;i<1200&&stable<12;i++){sim.step();stable=game.canPick(step.screwId)?stable+1:0;if(i%10===0)check();}check();const result=game.dispatch({type:'pick',screwId:step.screwId});assert(result.ok,JSON.stringify({id:step.screwId,moves:game.state.moves,phase:game.state.phase,reason:result.reason}));sim.sync();check();for(let i=0;i<Number(process.env.R2_HOLD_FRAMES??Math.ceil((step.waitMs??50)/(1000/60)));i++){sim.step();if(i%10===0)check();}}
  assert.equal(game.state.phase,'won');assert(checked<full*.7,JSON.stringify({checked,full}));
  for(let i=0;i<10;i++){game.undo();sim.sync(true);check();}
  const owner=game.state.boards.find(b=>b.active!==false&&!b.gone&&!b.melted)!;game.dispatch({type:'melt',boardId:owner.id});sim.sync();check();
});
