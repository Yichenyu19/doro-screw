import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine,assertConservation} from '../src/core';
import {getCampaignLevel} from '../src/authored-r2';
import {CONTENT_REVISION,challengeCode,readChallengeCode,parseChallengeCode} from '../src/run';
import {ALBUM_REVISION,ALBUM_TOTAL_CELLS,ALBUM_VOLUME_CELLS,ARTWORKS,CAMPAIGN_MATERIAL_GRANTS,LEGACY_ALBUM_CELLS,awardVictory,campaignAlbumSchedule,campaignMaterialGrant,describeAlbumGoal,freshSave,loadSave,importRecovery,exportRecovery,migrateAlbumLayout,projectAlbumFill,SAVE_KEY,setCurrentRun,volumeCompleted} from '../src/storage';
import {campaignBest,noteVictoryMeta,quietRating,rankMarks,syncTitles} from '../src/meta';
import {dailyDateFromAttempt,dailyPractice,DAILY_EPOCH_DAY,isDailyBoard,utcDateString} from '../src/r2-catalog';
import {buildShareSpec,shareSpecHasPersonalData,SHARE_SITE} from '../src/share-card';
import type {GameState} from '../src/types';

function storage(){const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});return{values,restore:()=>{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}};}
function wonCampaign(id:number,rank:'complete'|'independent'|'clean'='independent'):GameState{
  const level=getCampaignLevel(id);const game=new GameEngine(level),state=game.snapshot();
  state.screws.forEach(s=>s.place='done');state.collected=state.screws.map(s=>s.id);
  state.boxes.forEach(b=>{b.color=null;b.screws=[];});state.queueCursor=state.boxQueue.length;
  state.phase='won';state.moves=state.screws.length;state.stats.picks=state.screws.length;
  if(rank==='complete')state.stats.assists['expand-buffer']=1;
  if(rank==='independent')state.stats.undos=2;
  assertConservation(state);return state;
}

test('主线八关材料恰好收齐前三幅，第二关完成第一幅、第四关完成第二幅',()=>{
  assert.equal(ARTWORKS[0].columns*ARTWORKS[0].rows,272);
  assert.equal(ARTWORKS[1].columns*ARTWORKS[1].rows,240);
  assert.equal(ARTWORKS[2].columns*ARTWORKS[2].rows,506);
  assert.equal(ALBUM_VOLUME_CELLS,1018);
  assert.equal(CAMPAIGN_MATERIAL_GRANTS.reduce((n,v)=>n+v,0),1020);
  assert.equal(ALBUM_TOTAL_CELLS,1772);
  assert.deepEqual([...LEGACY_ALBUM_CELLS],[600,702,784,870,960,1088]);
  const schedule=campaignAlbumSchedule();
  assert.equal(schedule[0].cumulative,90);
  assert.ok(schedule[0].filled[0]>=272/4,'第一关就能看出第一幅轮廓');
  assert.deepEqual(schedule[0].completed,[]);
  assert.equal(schedule[1].cumulative,298);
  assert.deepEqual(schedule[1].completed,[1]);
  assert.equal(schedule[1].filled[0],272);
  assert.equal(schedule[3].cumulative,523);
  assert.deepEqual(schedule[3].completed,[1,2]);
  assert.equal(schedule[7].cumulative,1020);
  assert.deepEqual(schedule[7].completed,[1,2,3]);
  assert.equal(schedule[7].volumeComplete,true);
  assert.equal(schedule[7].filled[3],2);
  const afterEight=describeAlbumGoal([0,0,0,0,0,0],1020);
  assert.equal(afterEight.volumeComplete,true);
  assert.equal(afterEight.volumeCount,3);
  assert.ok(afterEight.summary.includes('这一卷收齐了'));
});

test('旧画册进度按已填格数重铺，不改未花掉的材料，也不追溯补发',()=>{
  const migrated=migrateAlbumLayout([600,420,0,0,0,0],1);
  assert.equal(migrated.migrated,true);
  assert.equal(migrated.revision,ALBUM_REVISION);
  assert.deepEqual(migrated.progress,projectAlbumFill([0,0,0,0,0,0],1020).progress);
  assert.equal(volumeCompleted(migrated.progress),true);
  assert.deepEqual(migrateAlbumLayout([90,0,0,0,0,0],ALBUM_REVISION),{progress:[90,0,0,0,0,0],revision:ALBUM_REVISION,migrated:false});
  const s=storage();
  try{
    const old={...freshSave(),albumRevision:1,contentRevision:4,completed:[1,2,3,4,5,6,7,8],unlocked:9,materialBalance:0,artworkProgress:[600,420,0,0,0,0],titles:[],dailyMarks:{}};
    delete (old as {albumRevision?:number}).albumRevision;
    s.values.set(SAVE_KEY,JSON.stringify(old));
    const loaded=loadSave();
    assert.equal(loaded.data.albumRevision,ALBUM_REVISION);
    assert.equal(loaded.data.materialBalance,0);
    assert.deepEqual(loaded.data.completed,[1,2,3,4,5,6,7,8]);
    assert.equal(loaded.data.artworkProgress.reduce((n,v)=>n+v,0),1020);
    assert.deepEqual(loaded.data.album,[1,2,3]);
    assert.ok(loaded.data.titles.includes('volume-one'));
    assert.ok(loaded.data.titles.includes('campaign'));
    const raw=JSON.stringify({...freshSave(),contentRevision:4,completed:[1],unlocked:2,materialBalance:15,totalScrews:15,artworkProgress:[0,0,0,0,0,0]});
    s.values.set(SAVE_KEY,raw);
    const kept=loadSave();
    assert.equal(kept.data.materialBalance,15);
    assert.equal(awardVictory(kept.data,wonCampaign(1)),0);
    assert.equal(kept.data.materialBalance,15);
  }finally{s.restore();}
});

test('无辅助与用辅助分别记录，称号不把辅助当缺点，成绩档标注诚实',()=>{
  const data=freshSave();
  const assisted=wonCampaign(2,'complete');
  assert.equal(awardVictory(data,assisted),208);
  assert.equal(data.records[assisted.attemptId].rank,'complete');
  assert.equal(data.records[assisted.attemptId].assists,1);
  assert.ok(data.titles.includes('wall'));
  assert.ok(!data.titles.includes('wall-solo'));
  const solo=wonCampaign(2,'clean');solo.runId='run-clean';solo.stats.assists['expand-buffer']=0;solo.stats.undos=0;solo.stats.hintsShown=0;
  assert.equal(awardVictory(data,solo),0);
  assert.equal(data.records[solo.attemptId].rank,'clean');
  assert.ok(data.titles.includes('wall-solo'));
  const marks=rankMarks(campaignBest(data,2)?.rank);
  assert.deepEqual(marks,{complete:true,independent:true,clean:true});
});

test('步数与暂存高峰留下无压力对照，重玩更少步数会更新个人最好',()=>{
  const data=freshSave();
  const first=wonCampaign(1,'independent');first.moves=40;first.stats.peakBuffer=4;first.capacity=5;
  awardVictory(data,first);
  const previous=data.records[first.attemptId];
  assert.equal(previous.bestMoves,40);
  const again=wonCampaign(1,'independent');again.runId='run-2';again.moves=33;again.stats.peakBuffer=2;again.capacity=5;
  const rating=quietRating(again,previous);
  assert.equal(rating.improvedMoves,true);
  assert.equal(rating.leftover,3);
  awardVictory(data,again);
  assert.equal(data.records[again.attemptId].bestMoves,33);
});

test('每日挑战按 UTC 日期共享同一局，跨日与时区边界不串局，离线可判定',()=>{
  const early=dailyPractice(new Date('2026-11-10T23:59:59.999Z'));
  const late=dailyPractice(new Date('2026-11-11T00:00:00.000Z'));
  assert.equal(early.date,'2026-11-10');
  assert.equal(late.date,'2026-11-11');
  assert.notEqual(early.attempt,late.attempt);
  assert.equal(utcDateString(new Date('2026-11-11T07:59:59+08:00')),'2026-11-10');
  assert.equal(utcDateString(new Date('2026-11-11T08:00:00+08:00')),'2026-11-11');
  const epoch=dailyPractice(new Date('2020-01-01T00:00:00Z'));
  assert.equal(epoch.attempt,0);
  assert.equal(epoch.theme,2);
  assert.equal(DAILY_EPOCH_DAY,18262);
  assert.equal(dailyDateFromAttempt(late.attempt),'2026-11-11');
  assert.equal(isDailyBoard(late.theme,late.attempt),true);
  assert.equal(isDailyBoard(late.theme,late.attempt-1),false);
  const code=challengeCode(late.theme,late.attempt,'v4','mastery',CONTENT_REVISION);
  assert.deepEqual(parseChallengeCode(code),{levelId:late.theme,attempt:late.attempt,mode:'mastery',contentRevision:4,contentVersion:'v4'});
  const data=freshSave();
  const state=wonCampaign(late.theme,'independent');
  state.mode='mastery';state.attempt=late.attempt;state.levelId=late.theme;
  noteVictoryMeta(data,state);
  assert.equal(data.dailyMarks['2026-11-11']?.theme,late.theme);
  assert.ok(data.titles.includes('daily'));
});

test('挑战码忽略空白并给出可分辨的错误原因',()=>{
  const code=challengeCode(3,12,'v4','mastery',4);
  assert.deepEqual(parseChallengeCode(`  ${code.slice(0,8)} ${code.slice(8)}  `),parseChallengeCode(code));
  assert.equal(readChallengeCode('').reason,'先把挑战码贴进来。');
  assert.equal(readChallengeCode('hello').reason,'这不是可识别的挑战码。');
  assert.equal(readChallengeCode(code.slice(0,-1)+'0').reason,'挑战码不完整或抄写有误。');
  const tooFar=readChallengeCode(challengeCode(9,0,'v4','campaign',4));
  assert.equal(tooFar.ok,false);
  if(!tooFar.ok)assert.match(tooFar.reason,/打不开/);
});

test('成绩卡只含盘面与成绩，不含个人信息，辅助通关标注诚实',()=>{
  const state=wonCampaign(2,'complete');
  const rating=quietRating(state);
  const spec=buildShareSpec({id:2,name:'四角借路',attempt:0,contentVersion:'v4',mode:'campaign',contentRevision:4},state,rating,['拆墙']);
  assert.equal(spec.rankLabel,'完成（用了挂）');
  assert.equal(spec.usedAssist,true);
  assert.equal(spec.site,SHARE_SITE);
  assert.equal(spec.dailyDate,null);
  assert.ok(spec.code.startsWith('D4-4-C-'));
  assert.equal(shareSpecHasPersonalData(spec),false);
  assert.ok(!/@|user|email|device/i.test(JSON.stringify(spec)));
});

test('结算后导出导入保留画册修订、称号和每日标记',async()=>{
  const s=storage();
  try{
    const original=freshSave();
    for(const id of [1,2,3,4,5,6,7,8])assert.ok(awardVictory(original,wonCampaign(id,'independent'))>0);
    assert.ok(original.titles.includes('volume-one'));
    assert.ok(original.titles.includes('campaign-solo'));
    setCurrentRun(null);original.current=null;
    const imported=await importRecovery(exportRecovery(original),freshSave());
    assert.equal(imported.data.albumRevision,ALBUM_REVISION);
    assert.equal(imported.data.materialBalance,1020);
    assert.ok(volumeCompleted(projectAlbumFill(imported.data.artworkProgress,imported.data.materialBalance).progress));
    assert.ok(imported.data.titles.includes('八关')===false);
    assert.ok(imported.data.titles.includes('campaign'));
  }finally{s.restore();}
});
