import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine,assertConservation} from '../src/core';
import {getR2Prototype,getCampaignLevel} from '../src/authored-r2';
import {awardVictory,freshSave,loadSave,loadSaveAsync,importRecovery,exportRecovery,setCurrentRun,R1_KEY,SAVE_KEY} from '../src/storage';
import {challengeCode,parseChallengeCode,newRunId} from '../src/run';
import {flushJournal} from '../src/journal';
import type {GameState} from '../src/types';

function storage(){const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});return{values,restore:()=>{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}};}
function won(mode:'campaign'|'mastery'|'rescue'):GameState{const level=getR2Prototype(2);level.mode=mode;const game=new GameEngine(level),state=game.snapshot();state.screws.forEach(s=>s.place='done');state.collected=state.screws.map(s=>s.id);state.boxes.forEach(b=>{b.color=null;b.screws=[];});state.queueCursor=state.boxQueue.length;state.phase='won';state.moves=state.screws.length;state.stats.picks=999;assertConservation(state);return state;}

test('残局只结算开局板上的唯一钉；同次运行重复结算不发材料，新运行可以再领',()=>{
  const data=freshSave(),state=won('rescue');state.rewardableIds=state.screws.slice(63).map(s=>s.id);state.rewardableIds.push(state.rewardableIds[0]);
  assert.equal(awardVictory(data,state),57);assert.equal(awardVictory(data,state),0);state.runId=newRunId();assert.equal(awardVictory(data,state),57);assert.equal(data.materialBalance,114);assert.equal(data.totalScrews,114);
  assert.deepEqual(data.completed,[]);assert.equal(data.records[state.attemptId].clears,2);
});
test('修订4第二关大墙首通与重玩、主题挑战每次运行分开结算',()=>{const data=freshSave(),level=getCampaignLevel(2);level.mode='campaign';const game=new GameEngine(level),a=game.snapshot();a.screws.forEach(s=>s.place='done');a.collected=a.screws.map(s=>s.id);a.boxes.forEach(b=>{b.color=null;b.screws=[];});a.queueCursor=a.boxQueue.length;a.phase='won';a.moves=a.screws.length;a.stats.picks=999;assertConservation(a);assert.equal(awardVictory(data,a),208);assert.deepEqual(data.completed,[2]);a.runId=newRunId();assert.equal(awardVictory(data,a),0);const b=won('mastery');assert.equal(awardVictory(data,b),120);assert.equal(data.materialBalance,328);});
test('线上修订2第二关通关映射为修订4同一关大墙，不拆成短关',()=>{const data=freshSave(),a=won('campaign');assert.equal(awardVictory(data,a),120);assert.deepEqual(data.completed,[2]);assert.equal(data.unlocked,3);});
test('R1保存迁移保留旧关卡身份和材料，不写动原始记录',()=>{const s=storage();try{const old={...freshSave(),contentRevision:1,albumRevision:1,completed:[1,2,3],unlocked:4,materialBalance:777,artworkProgress:[600,211,0,0,0,0]},raw=JSON.stringify(old);s.values.set(R1_KEY,raw);const result=loadSave();assert.deepEqual(result.data.completed,[]);assert.deepEqual(result.data.r1Campaign,{completed:[1,2,3],unlocked:4});assert.equal(result.data.materialBalance,777);assert.equal(result.data.artworkProgress.reduce((n,v)=>n+v,0),811);assert.equal(result.data.albumRevision,2);assert.equal(s.values.get(R1_KEY),raw);assert.equal(s.values.has(SAVE_KEY),false);}finally{s.restore();}});
test('R1至R4挑战码逐修订校验，挑战类型不会变成主线',()=>{for(const [revision,modes]of [[1,['campaign','random','endless']],[2,['campaign','rescue','mastery']],[3,['campaign','rescue','mastery']],[4,['campaign','rescue','mastery']]] as const)for(const mode of modes){const id=mode==='endless'?32:2,attempt=mode==='campaign'?0:43;assert.deepEqual(parseChallengeCode(challengeCode(id,attempt,'v4',mode,revision)),{levelId:id,attempt,mode,contentRevision:revision,contentVersion:'v4'});}assert.equal(parseChallengeCode(challengeCode(9,0,'v4','campaign',2)),null);assert.equal(parseChallengeCode(challengeCode(9,0,'v4','campaign',4)),null);assert.deepEqual(parseChallengeCode(challengeCode(10,0,'v4','campaign',3)),{levelId:10,attempt:0,mode:'campaign',contentRevision:3,contentVersion:'v4'});assert.equal(parseChallengeCode(challengeCode(11,0,'v4','campaign',3)),null);assert.equal(parseChallengeCode(challengeCode(2,1,'v4','random',2)),null);});
test('损坏的增量头不会阻止启动；恢复导出导入包含历史并在导入前保留副本',async()=>{
  const s=storage();try{
    s.values.set('doro-screw-reborn:v4:r2:pending:1',JSON.stringify({schema:2,sequence:1,writtenAt:1,progress:freshSave(),bases:[],frames:[],run:{base:'missing',current:'missing',history:[]}}));
    const fallback=await loadSaveAsync();assert(fallback.warning?.includes('不完整'));assert.equal(fallback.data.current,null);
    const level=getR2Prototype(2),game=new GameEngine(level);game.dispatch({type:'pick',screwId:level.witness[0].screwId});game.dispatch({type:'pick',screwId:level.witness[1].screwId});
    const original=freshSave();original.current=game.snapshot();original.materialBalance=79;setCurrentRun(game.checkpoint(original.current));const text=exportRecovery(original);
    const imported=await importRecovery(text,original);assert.equal(imported.data.materialBalance,79);assert.equal(imported.run?.history.length,2);assert.equal(imported.run?.state.moves,2);assert([...s.values.keys()].some(k=>k.includes('before-import:')));
    const resumed=new GameEngine(level,imported.run!.state,imported.run!.history);assert(resumed.undo());assert.equal(resumed.state.moves,1);
    const broken=JSON.parse(text);broken.run.frames[0].places='broken';await assert.rejects(()=>importRecovery(JSON.stringify(broken),original));assert.equal(s.values.get(R1_KEY),undefined);
    await flushJournal();
  }finally{s.restore();}
});
