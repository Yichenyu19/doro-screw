import test from 'node:test';
import assert from 'node:assert/strict';
import {getCampaignLevel,getCampaignLevelR3,getR2Prototype} from '../src/authored-r2';
import {CAMPAIGN_COUNT,CAMPAIGN_NAMES,CAMPAIGN_TOTALS,CAMPAIGN_TOTAL_PINS,remapR2Completed,remapR2Unlocked,remapR3Completed,remapR3Unlocked} from '../src/r2-catalog';
import {CONTENT_REVISION,challengeCode,parseChallengeCode,clearRank,RANK_NAMES} from '../src/run';
import {GameEngine,assertConservation} from '../src/core';
import {physicsSimulation} from '../src/matter-analysis';
import {freshSave,loadSave,SAVE_KEY,revisionWarning} from '../src/storage';
import {teachingTip} from '../src/teaching';

function pins(level:{boards:Array<{screws:unknown[]}>}){return level.boards.reduce((n,b)=>n+b.screws.length,0);}
function storage(){const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});return{values,restore:()=>{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}};}

test('修订4主线回到八关，第二关是120颗大墙，总量仍为1020',()=>{
  assert.equal(CONTENT_REVISION,4);assert.equal(CAMPAIGN_COUNT,8);assert.equal(CAMPAIGN_TOTAL_PINS,1020);
  assert.deepEqual([...CAMPAIGN_TOTALS],[15,120,129,135,141,156,156,168]);
  assert.deepEqual([...CAMPAIGN_NAMES],['先装满一盒','四角借路','花心有后手','先别装满','交叉路口','留给下一层','两岸接力','花心终局']);
  for(let id=1;id<=8;id++){
    const level=getCampaignLevel(id);
    assert.equal(level.id,id);assert.equal(level.contentRevision,4);
    assert.equal(pins(level),CAMPAIGN_TOTALS[id-1]);assert.equal(level.witness.length,CAMPAIGN_TOTALS[id-1]);
    assert.ok(level.witness.some(step=>step.waitForExposure||(step.waitMs??0)>=50));
  }
  assert.equal(pins(getR2Prototype(2)),120);
  assert.equal(pins(getCampaignLevel(2)),pins(getR2Prototype(2)));
  assert.equal(RANK_NAMES.complete,'完成（用了挂）');
});

test('第一关仍是先装满一盒，第二关开场把墙和免费辅助说清楚',()=>{
  const level=getCampaignLevel(1),game=new GameEngine(level),state=game.state;
  const matching=game.available().filter(s=>state.boxes.some(b=>b.color===s.color));
  assert.ok(matching.length>=3,`开局可点盒色仅 ${matching.length}`);
  const start=teachingTip(level,state,[],[]);
  assert.match(start??'',/已经露出来了/);
  const l2=getCampaignLevel(2),tip=teachingTip(l2,new GameEngine(l2).state,[],[]);
  assert.match(tip??'',/120/);assert.match(tip??'',/免费辅助/);
});

test('线上修订2存档按同一关号迁入，不把大墙拆成三关',()=>{
  assert.deepEqual(remapR2Completed([1,2,8]),[1,2,8]);assert.equal(remapR2Unlocked(3,[1,2]),3);
  const s=storage();
  try{const old={...freshSave(),contentRevision:2,completed:[1,2],unlocked:3,materialBalance:135};s.values.set(SAVE_KEY,JSON.stringify(old));const result=loadSave();assert.deepEqual(result.data.completed,[1,2]);assert.equal(result.data.unlocked,3);assert.equal(result.data.contentRevision,4);assert.equal(result.data.materialBalance,135);assert.equal(result.warning,revisionWarning(2));}
  finally{s.restore();}
});

test('未上线的修订3存档：三关短桥都打完才记大墙已通，进行中的短桥盘面丢弃',()=>{
  assert.deepEqual(remapR3Completed([1,2,3,4,5]),[1,2,3]);
  const s=storage();
  try{
    const mid=new GameEngine(getCampaignLevelR3(3)).snapshot();
    const old={...freshSave(),contentRevision:3,completed:[1,2,3,4],unlocked:5,current:mid};
    s.values.set(SAVE_KEY,JSON.stringify(old));
    const result=loadSave();
    assert.deepEqual(result.data.completed,[1,2]);
    assert.equal(result.data.unlocked,3);
    assert.equal(result.data.current,null);
    assert.equal(result.data.contentRevision,4);
    assert.equal(result.warning,revisionWarning(3));
  }finally{s.restore();}
});

test('官方线带物理等待见证：修订4全部八关可解且不用道具',()=>{
  const report:Array<{id:number;phase:string;peak:number;tools:number}>=[];
  for(let id=1;id<=CAMPAIGN_COUNT;id++){
    const level=getCampaignLevel(id),game=new GameEngine(level),sim=physicsSimulation(game);
    for(const step of level.witness){
      sim.sync();let stable=0;for(let i=0;i<1800&&stable<12;i++){sim.step();game.advanceWorld(1000/60);stable=game.canPick(step.screwId)?stable+1:0;}
      const result=game.dispatch({type:'pick',screwId:step.screwId});
      assert(result.ok,JSON.stringify({id,screwId:step.screwId,moves:game.state.moves,phase:game.state.phase,reason:result.reason}));
      sim.sync();for(let i=0;i<Math.ceil((step.waitMs??50)/(1000/60));i++){sim.step();game.advanceWorld(1000/60);}
    }
    assert.equal(game.state.phase,'won',`第${id}关官方线未过`);
    const tools=Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0);
    assert.equal(tools,0);assertConservation(game.state);
    report.push({id,phase:game.state.phase,peak:game.state.stats.peakBuffer,tools});
  }
  assert.equal(report.length,8);
});

test('修订4挑战码与修订2、修订3码可并存',()=>{
  assert.equal(parseChallengeCode(challengeCode(2,0,'v4','campaign',4))?.contentRevision,4);
  assert.equal(parseChallengeCode(challengeCode(8,0,'v4','campaign',4))?.levelId,8);
  assert.equal(parseChallengeCode(challengeCode(9,0,'v4','campaign',4)),null);
  assert.equal(parseChallengeCode(challengeCode(10,0,'v4','campaign',3))?.levelId,10);
  assert.equal(parseChallengeCode(challengeCode(2,0,'v4','campaign',2))?.contentRevision,2);
});
