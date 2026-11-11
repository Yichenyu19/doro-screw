import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine,assertConservation} from '../src/core';
import {getCampaignLevel,getR2Prototype} from '../src/authored-r2';
import {CONTENT_REVISION} from '../src/run';
import {awardVictory,freshSave,loadSave,importRecovery,exportRecovery,setCurrentRun,SAVE_KEY,ARTWORKS,ALBUM_TOTAL_CELLS,CAMPAIGN_MATERIAL_GRANTS,campaignMaterialGrant,campaignAlbumSchedule,projectAlbumFill,describeAlbumGoal} from '../src/storage';
import {flushJournal} from '../src/journal';
import type {GameState} from '../src/types';

function storage(){const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});return{values,restore:()=>{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}};}
function wonCampaign(id:number):GameState{
  const level=getCampaignLevel(id);const game=new GameEngine(level),state=game.snapshot();
  state.screws.forEach(s=>s.place='done');state.collected=state.screws.map(s=>s.id);
  state.boxes.forEach(b=>{b.color=null;b.screws=[];});state.queueCursor=state.boxQueue.length;
  state.phase='won';state.moves=state.screws.length;state.stats.picks=state.screws.length;assertConservation(state);return state;
}

test('六幅画总格数仍为5004，主线发放曲线合计仍为1020且前两关就能看出轮廓',()=>{
  assert.equal(ALBUM_TOTAL_CELLS,5004);
  assert.equal(ARTWORKS[0].columns*ARTWORKS[0].rows,600);
  assert.equal(CAMPAIGN_MATERIAL_GRANTS.reduce((n,v)=>n+v,0),1020);
  assert.equal(campaignMaterialGrant(1,CONTENT_REVISION,15),90);
  assert.equal(campaignMaterialGrant(2,CONTENT_REVISION,120),208);
  assert.equal(campaignMaterialGrant(1,2,15),15);
  const schedule=campaignAlbumSchedule();
  assert.equal(schedule[1].cumulative,298);
  assert.equal(schedule[1].filled[0],298);
  assert.ok(schedule[1].filled[0]>=600/4,'前两关累计应达到第一幅核心轮廓');
  assert.deepEqual(schedule[1].completed,[]);
  assert.equal(schedule[2].cumulative,408);
  const last=schedule[7];
  assert.equal(last.cumulative,1020);
  assert.deepEqual(last.completed,[1]);
  assert.equal(last.filled[0],600);
  assert.equal(last.filled[1],420);
  assert.equal(last.filled[2],0);
  const goal=describeAlbumGoal([0,0,0,0,0,0],298);
  assert.equal(goal.title,'睡到螺丝松');
  assert.equal(goal.filled,298);
  assert.equal(goal.stageName,'向外成形');
  const afterTen=describeAlbumGoal([0,0,0,0,0,0],1020);
  assert.equal(afterTen.completedCount,1);
  assert.equal(afterTen.title,'今天也摸鱼');
  assert.equal(afterTen.filled,420);
  assert.equal(afterTen.nextTitle,'草莓补给站');
});

test('修订4主线按新曲线发材料，重玩不补发，旧存档不追溯补差额',()=>{
  const data=freshSave();
  assert.equal(awardVictory(data,wonCampaign(1)),90);
  assert.equal(data.materialBalance,90);
  assert.equal(data.totalScrews,15);
  const again=wonCampaign(1);again.runId='run-replay';
  assert.equal(awardVictory(data,again),0);
  assert.equal(data.materialBalance,90);
  const s=storage();
  try{
    const old={...freshSave(),contentRevision:4,completed:[1],unlocked:2,materialBalance:15,totalScrews:15,artworkProgress:[0,0,0,0,0,0]};
    const raw=JSON.stringify(old);s.values.set(SAVE_KEY,raw);
    const loaded=loadSave();
    assert.equal(loaded.data.materialBalance,15);
    assert.deepEqual(loaded.data.completed,[1]);
    const replay=wonCampaign(1);
    assert.equal(awardVictory(loaded.data,replay),0);
    assert.equal(loaded.data.materialBalance,15);
    assert.equal(s.values.get(SAVE_KEY),raw);
  }finally{s.restore();}
});

test('新曲线结算后的导出导入保留材料，旧修订主线仍按螺丝数发奖',async()=>{
  const s=storage();
  try{
    const original=freshSave();
    assert.equal(awardVictory(original,wonCampaign(1)),90);
    assert.equal(awardVictory(original,wonCampaign(2)),208);
    setCurrentRun(null);original.current=null;
    const text=exportRecovery(original);
    const imported=await importRecovery(text,freshSave());
    assert.equal(imported.data.materialBalance,298);
    assert.deepEqual(imported.data.completed,[1,2]);
    assert.deepEqual(projectAlbumFill(imported.data.artworkProgress,imported.data.materialBalance).progress[0],298);
    const r2=getR2Prototype(1);r2.mode='campaign';
    const game=new GameEngine(r2),state=game.snapshot();
    state.screws.forEach(s=>s.place='done');state.collected=state.screws.map(s=>s.id);
    state.boxes.forEach(b=>{b.color=null;b.screws=[];});state.queueCursor=state.boxQueue.length;
    state.phase='won';state.moves=state.screws.length;state.stats.picks=state.screws.length;assertConservation(state);
    const migrated=freshSave();
    assert.equal(awardVictory(migrated,state),state.screws.length);
    await flushJournal();
  }finally{s.restore();}
});
