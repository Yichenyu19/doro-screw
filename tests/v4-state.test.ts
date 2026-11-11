import test from 'node:test';
import assert from 'node:assert/strict';
import {getLevel as legacyLevel} from '../src/levels-v3';
import {GameEngine,assertConservation} from '../src/core';
import {packRun,unpackRun} from '../src/journal';
import {challengeCode,parseChallengeCode,puzzleId} from '../src/run';
import {awardVictory,freshSave,loadSave,V3_KEY,SAVE_KEY} from '../src/storage';
import type {GameState,LevelDef,PlayMode} from '../src/types';

function level(mode:PlayMode='campaign'):LevelDef{const value=legacyLevel(1);return{...value,contentVersion:'v4',geometryVersion:'v4',mode,contentRevision:mode==='campaign'?2:1,boards:value.boards.map(b=>({...b,geometryVersion:'v4'}))};}
function won(mode:PlayMode):GameState{const game=new GameEngine(level(mode)),state=game.snapshot();state.screws.forEach(s=>s.place='done');state.collected=state.screws.map(s=>s.id);state.boxes.forEach(b=>{b.color=null;b.screws=[];});state.queueCursor=state.boxQueue.length;state.phase='won';state.stats.picks=state.moves=state.screws.length;assertConservation(state);return state;}
test('撤回历史压缩保存后仍可恢复，并保留不可逆统计',()=>{
  const definition=level(),engine=new GameEngine(definition);engine.advanceClock(1500);
  engine.dispatch({type:'pick',screwId:definition.witness[0].screwId});engine.advanceClock(1200);
  engine.dispatch({type:'pick',screwId:definition.witness[1].screwId});engine.markHintShown();
  const checkpoint=unpackRun(JSON.parse(JSON.stringify(packRun(engine.checkpoint()))))!;
  const resumed=new GameEngine(definition,checkpoint.state,checkpoint.history);assert(resumed.canUndo);assert(resumed.undo());assert.equal(resumed.state.moves,1);assert.equal(resumed.state.stats.undos,1);assert.equal(resumed.state.stats.hintsShown,1);assert.equal(resumed.state.elapsedMs,2700);assert(resumed.undo());assert.equal(resumed.state.moves,0);assert.equal(resumed.canUndo,false);
});
test('损坏的撤回帧不会以可用历史加载',()=>{const definition=level(),engine=new GameEngine(definition);engine.dispatch({type:'pick',screwId:definition.witness[0].screwId});const packed=packRun(engine.checkpoint())!;const raw=JSON.parse(JSON.stringify(packed));raw.frames[0].places='bad';assert.throws(()=>unpackRun(raw));});
test('同一盘面的其他运行不能注入撤回历史',()=>{const definition=level(),a=new GameEngine(definition),b=new GameEngine(definition);a.dispatch({type:'pick',screwId:definition.witness[0].screwId});b.dispatch({type:'pick',screwId:definition.witness[0].screwId});assert.throws(()=>new GameEngine(definition,a.snapshot(),b.checkpoint().history));});
test('V4战役首通发材料和纪念，随机不发材料且成绩各自独立',()=>{
  const save=freshSave(),campaign=won('campaign');assert.equal(awardVictory(save,campaign),15);assert(save.starterSticker);assert.deepEqual(save.completed,[1]);assert.equal(awardVictory(save,campaign),0);
  const random=won('random');assert.equal(awardVictory(save,random),0);assert.equal(save.materialBalance,15);assert.equal(save.totalScrews,30);assert.equal(Object.keys(save.records).length,2);assert.notEqual(campaign.attemptId,random.attemptId);
});
test('D4挑战码隔离模式与内容修订，D2/D3仍能解析',()=>{
  for(const mode of ['campaign','random','endless'] as const){const id=mode==='endless'?31:2,attempt=mode==='campaign'?0:17,code=challengeCode(id,attempt,'v4',mode,1);assert.deepEqual(parseChallengeCode(code),{levelId:id,attempt,mode,contentRevision:1,contentVersion:'v4'});assert.equal(parseChallengeCode(code+'Q'),null);}
  for(const version of ['v2','v3'] as const)assert.deepEqual(parseChallengeCode(challengeCode(6,3,version)),{levelId:6,attempt:3,contentVersion:version});
  assert.notEqual(puzzleId(2,42,'v4','campaign'),puzzleId(2,42,'v4','random'));
});
test('V3迁移保留盘面与材料，但不把旧完成记录当作V4已通关',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),store=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>store.set(key,value),removeItem:(key:string)=>store.delete(key)}});
  try{const state=new GameEngine(legacyLevel(2)).snapshot(),raw=JSON.stringify({...freshSave(),version:3,current:state,completed:[1],unlocked:2,materialBalance:37,artworkProgress:[123,0,0,0,0,0]});store.set(V3_KEY,raw);const result=loadSave();assert.equal(result.data.version,4);assert.deepEqual(result.data.completed,[]);assert.deepEqual(result.data.legacyCompleted,[1]);assert.equal(result.data.unlocked,2);assert.equal(result.data.materialBalance,37);assert.equal(result.data.artworkProgress[0],123);assert.equal(result.data.current?.seed,state.seed);assert.equal(store.get(V3_KEY),raw);assert.equal(store.has(SAVE_KEY),false);}finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});
