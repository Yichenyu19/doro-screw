import test from 'node:test';
import assert from 'node:assert/strict';
import {getCampaignLevel,getCampaignLevelR3,getR2Prototype} from '../src/authored-r2';
import {R3_NAMES,R3_TOTALS,remapR3Completed} from '../src/r2-catalog';
import {challengeCode,parseChallengeCode} from '../src/run';
import {GameEngine,assertConservation} from '../src/core';
import {physicsSimulation} from '../src/matter-analysis';
import {awardVictory,freshSave,loadSave,SAVE_KEY,revisionWarning} from '../src/storage';
import {teachingTip,teachingFlags} from '../src/teaching';
import {SYNTH_RECIPES} from '../src/audio';

function pins(level:{boards:Array<{screws:unknown[]}>}){return level.boards.reduce((n,b)=>n+b.screws.length,0);}
function storage(){const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});return{values,restore:()=>{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}};}

test('修订3生成器仍保留短桥关，供旧挑战码回放，不再作为当前主线',()=>{
  assert.deepEqual([...R3_TOTALS],[15,24,48,48,129,135,141,156,156,168]);
  assert.deepEqual([...R3_NAMES],['先装满一盒','先拆一座桥','桥下还有一层','四角借路','花心有后手','先别装满','交叉路口','留给下一层','两岸接力','花心终局']);
  for(let id=1;id<=10;id++){const level=getCampaignLevelR3(id);assert.equal(level.id,id);assert.equal(level.contentRevision,3);assert.equal(pins(level),R3_TOTALS[id-1]);assert.equal(level.witness.length,R3_TOTALS[id-1]);}
  assert.equal(pins(getR2Prototype(2)),120);
  assert.equal(pins(getCampaignLevel(2)),120);
  assert.equal(getCampaignLevel(2).contentRevision,4);
});

test('修订3第一关仍是当时的开局，当前主线不再走这套提示',()=>{
  const level=getCampaignLevelR3(1),game=new GameEngine(level),state=game.state;
  const matching=game.available().filter(s=>state.boxes.some(b=>b.color===s.color));
  assert.ok(matching.length>=3,`开局可点盒色仅 ${matching.length}`);
  assert.ok(new Set(matching.map(s=>s.color)).size>=2);
  const start=teachingTip(level,state,[],[]);
  assert.match(start??'',/已经露出来了/);assert.match(start??'',/橘子/);
  const window=teachingTip(level,{...state,moves:8},[{type:'board-released',boardId:'r3-l1-gate',remaining:1}],[]);
  assert.match(window??'',/自己摆开/);assert.deepEqual(teachingFlags([{type:'board-released',boardId:'x',remaining:1}]),['window-tip']);
  const second=teachingTip(level,{...state,moves:1},[{type:'routed',screwId:'s',color:'orange',destination:'buffer'}],[]);
  assert.match(second??'',/先放在孔里也没关系/);
});
test('修订3短桥关仍从一座桥教开路成本，开场提示写明盒色和结构',()=>{
  const l2=getCampaignLevelR3(2),g2=new GameEngine(l2);
  const tip=teachingTip(l2,g2.state,[],[]);
  assert.match(tip??'',/三个空孔/);assert.match(getCampaignLevelR3(3).curriculum!.stages[0].advice,/葡萄和青柠/);
  assert.match(getCampaignLevelR3(4).curriculum!.stages[0].advice,/竖着/);
  for(const id of [1,2,3,4]){const level=getCampaignLevelR3(id);assert.equal(level.difficulty?.verification,'verified');assert.ok(!level.boxQueue.includes('gray'),'第'+id+'关盒序含灰');assert.ok(!level.boards.some(b=>b.screws.some(s=>s.color==='gray')),'第'+id+'关钉色含灰');}
});

test('六类物性事件都有独立合成配方，且强弱分层可检查',()=>{
  const names=['pick','arrive','refill','loosen','fall','reveal'] as const;
  for(const name of names)assert.ok(SYNTH_RECIPES[name].length>=2,name);
  const peak=Object.fromEntries(names.map(name=>[name,Math.max(...SYNTH_RECIPES[name].map(v=>v.gain))]));
  assert.ok(peak.fall>peak.pick);assert.ok(peak.fall>peak.loosen);assert.ok(peak.pick!==peak.arrive);assert.ok(peak.refill!==peak.reveal);assert.ok(peak.loosen<peak.arrive);
});

test('修订3短桥关官方线带物理等待见证，可解且不用道具',()=>{
  const report:Array<{id:number;phase:string;peak:number;tools:number}>=[];
  for(const id of [1,2,3,4]){
    const level=getCampaignLevelR3(id),game=new GameEngine(level),sim=physicsSimulation(game);
    for(const step of level.witness){
      sim.sync();let stable=0;for(let i=0;i<1800&&stable<12;i++){sim.step();game.advanceWorld(1000/60);stable=game.canPick(step.screwId)?stable+1:0;}
      const result=game.dispatch({type:'pick',screwId:step.screwId});
      assert(result.ok,JSON.stringify({id,screwId:step.screwId,moves:game.state.moves,phase:game.state.phase,reason:result.reason}));
      sim.sync();for(let i=0;i<Math.ceil((step.waitMs??50)/(1000/60));i++){sim.step();game.advanceWorld(1000/60);}
    }
    assert.equal(game.state.phase,'won',`第${id}关官方线未过`);
    const tools=Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0);
    assert.equal(tools,0);assertConservation(game.state);
    assert.equal(level.difficulty?.verification,'verified');
    report.push({id,phase:game.state.phase,peak:game.state.stats.peakBuffer,tools});
  }
  assert.equal(report.length,4);
});

test('第一关先点 1–2 颗非盒色仍能沿官方线通关且不用道具',()=>{
  const level=getCampaignLevel(1);
  for(const mistakes of [1,2]){
    const game=new GameEngine(level),sim=physicsSimulation(game);
    const extra=game.available().filter(s=>!game.state.boxes.some(b=>b.color===s.color)).slice(0,mistakes);
    assert.equal(extra.length,mistakes);
    for(const screw of extra)assert(game.dispatch({type:'pick',screwId:screw.id}).ok);
    for(const step of level.witness){
      if(game.state.screws.find(s=>s.id===step.screwId)?.place!=='board')continue;
      sim.sync();let stable=0;for(let i=0;i<1800&&stable<12;i++){sim.step();game.advanceWorld(1000/60);stable=game.canPick(step.screwId)?stable+1:0;}
      let id=step.screwId;
      if(!game.canPick(id)){const next=game.available().filter(s=>game.state.boxes.some(b=>b.color===s.color))[0]??game.available()[0];assert(next,`第 ${mistakes} 次失误后无子可走`);id=next.id;}
      assert(game.dispatch({type:'pick',screwId:id}).ok);
      sim.sync();for(let i=0;i<Math.ceil((step.waitMs??50)/(1000/60));i++){sim.step();game.advanceWorld(1000/60);}
    }
    assert.equal(game.state.phase,'won');assert.equal(Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0),0);
  }
});

test('修订3挑战码和旧修订码可并存',()=>{
  assert.equal(parseChallengeCode(challengeCode(9,0,'v4','campaign',3))?.levelId,9);
  assert.equal(parseChallengeCode(challengeCode(9,0,'v4','campaign',2)),null);
  const code=challengeCode(4,0,'v4','campaign',3);assert.equal(parseChallengeCode(code)?.contentRevision,3);
});
