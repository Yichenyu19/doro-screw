import {assertConservation,makeAttemptId,occupiedBuffer} from './core';
import {assistCount,clearRank,freshStats,newRunId,RANK_ORDER,CONTENT_REVISION} from './run';
import {CAMPAIGN_COUNT,remapR2Completed,remapR2Unlocked} from './r2-catalog';
import type {BestRecord,GameState,RunCheckpoint,RunStats,SaveData,Settings} from './types';
import {readJournal,unpackRun,writeJournal,recoveryText as exportJournal,readPending,archiveRecovery,flushJournal,getSaveStatus} from './journal';

export const SAVE_KEY='doro-screw-reborn:v4:r2';
export const R1_KEY='doro-screw-reborn:v4';
export const V3_KEY='doro-screw-reborn:v3';
export const LEGACY_KEY='doro-screw-reborn:v2';
export const V1_KEY='doro-screw-reborn:v1';
export const ARTWORKS=[
  {id:1,title:'睡到螺丝松',columns:25,rows:24},{id:2,title:'今天也摸鱼',columns:27,rows:26},
  {id:3,title:'草莓补给站',columns:28,rows:28},{id:4,title:'螺丝小宇宙',columns:30,rows:29},
  {id:5,title:'花田休息日',columns:32,rows:30},{id:6,title:'今日螺丝王',columns:34,rows:32},
] as const;
export interface ProgressSave extends SaveData {
  materialBalance:number;artworkProgress:number[];rewardedAttempts:string[];completedRuns:string[];
  attemptCounter:number;attempts:Record<string,number>;legacyCompleted:number[];currentAttempt:number;
  records:Record<string,BestRecord>;endlessNextId:number;tutorialSeen:string[];totalScrews:number;
  starterSticker:boolean;randomCounter:number;
  contentRevision:number;r1Campaign:{completed:number[];unlocked:number};
}
export const DEFAULT_SETTINGS:Settings={sound:true,reducedMotion:false,colorLabels:false};
let recoveryText:string|null=null;
let activeRun:RunCheckpoint|null=null;
export function setCurrentRun(run:RunCheckpoint|null):void{activeRun=run;}
export function currentRun():RunCheckpoint|null{return activeRun;}
export function exportRecovery(data:ProgressSave):string{return exportJournal(data,data.current?activeRun:null);}
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const ids=(value:unknown,max=30):number[]=>Array.isArray(value)?[...new Set(value.filter((id):id is number=>Number.isInteger(id)&&id>=1&&id<=max))].sort((a,b)=>a-b):[];
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];
export function freshSave():ProgressSave {
  const reducedMotion=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return{version:4,contentRevision:CONTENT_REVISION,r1Campaign:{completed:[],unlocked:1},current:null,completed:[],unlocked:1,album:[],settings:{...DEFAULT_SETTINGS,reducedMotion:!!reducedMotion},updatedAt:Date.now(),materialBalance:0,artworkProgress:ARTWORKS.map(()=>0),rewardedAttempts:[],completedRuns:[],attemptCounter:0,attempts:{},legacyCompleted:[],currentAttempt:0,records:{},endlessNextId:31,tutorialSeen:[],totalScrews:0,starterSticker:false,randomCounter:0};
}
function readMeta(data:ProgressSave,stored:Partial<ProgressSave>):void {
  data.completed=ids(stored.completed);data.legacyCompleted=ids(stored.legacyCompleted);
  data.unlocked=Math.min(31,Math.max(1,integer(stored.unlocked)?stored.unlocked:1,...data.completed.map(id=>id+1),...data.legacyCompleted.map(id=>id+1)));
  for(const key of ['sound','reducedMotion','colorLabels'] as const)if(typeof stored.settings?.[key]==='boolean')data.settings[key]=stored.settings[key]!;
  data.materialBalance=integer(stored.materialBalance)?stored.materialBalance:0;
  data.artworkProgress=ARTWORKS.map((art,index)=>Math.min(art.columns*art.rows,integer(stored.artworkProgress?.[index])?stored.artworkProgress![index]:0));
  data.album=ARTWORKS.filter((art,index)=>data.artworkProgress[index]>=art.columns*art.rows).map(art=>art.id);
  data.rewardedAttempts=strings(stored.rewardedAttempts).slice(-10000);data.completedRuns=strings(stored.completedRuns).slice(-10000);
  data.attemptCounter=integer(stored.attemptCounter)?stored.attemptCounter:0;
  data.currentAttempt=integer(stored.currentAttempt)?stored.currentAttempt:0;
  if(stored.attempts&&typeof stored.attempts==='object')for(const [key,count]of Object.entries(stored.attempts))if(/^(v[234]:)?(\d+:\w+:)?\d+$/.test(key)&&integer(count))data.attempts[key]=count;
  data.endlessNextId=integer(stored.endlessNextId)?Math.min(1000000,Math.max(31,stored.endlessNextId)):31;
  data.tutorialSeen=strings(stored.tutorialSeen).slice(0,50);
  data.totalScrews=integer(stored.totalScrews)?stored.totalScrews:data.materialBalance+data.artworkProgress.reduce((a,b)=>a+b,0);
  data.starterSticker=stored.starterSticker===true;data.randomCounter=integer(stored.randomCounter)?stored.randomCounter:0;
  if(stored.r1Campaign)data.r1Campaign={completed:ids(stored.r1Campaign.completed),unlocked:Math.min(31,Math.max(1,integer(stored.r1Campaign.unlocked)?stored.r1Campaign.unlocked:1))};
  if(stored.records&&typeof stored.records==='object')for(const [key,record]of Object.entries(stored.records)){
    if(record&&key===record.puzzleId&&['complete','independent','clean'].includes(record.rank)&&integer(record.levelId)&&integer(record.seed)&&Number.isFinite(record.elapsedMs)&&record.elapsedMs>=0&&integer(record.clears))data.records[key]=record;
  }
}
export function revisionWarning(storedRevision:unknown):string|null {
  if(storedRevision===CONTENT_REVISION)return null;
  if(storedRevision===2)return '主线在第二关后补了两道短桥关。已通关的进度已按新顺序接好。';
  return '旧修订的盘面、成绩和画册已保留；当前主线从新的成绩记录开始。';
}
function migrateRevision(data:ProgressSave,stored:Partial<ProgressSave>):void {
  if(stored.version===4&&stored.contentRevision===1){data.r1Campaign={completed:[...data.completed],unlocked:data.unlocked};data.completed=[];data.unlocked=1;}
  else if(stored.version===4&&stored.contentRevision===2){data.completed=remapR2Completed(data.completed);data.unlocked=remapR2Unlocked(data.unlocked,data.completed);}
  data.completed=ids(data.completed,CAMPAIGN_COUNT);data.unlocked=Math.min(CAMPAIGN_COUNT+1,Math.max(1,data.unlocked,...data.completed.map(id=>id+1)));data.contentRevision=CONTENT_REVISION;
}
export function migrateV2State(raw:unknown):GameState {
  const state=JSON.parse(JSON.stringify(raw)) as GameState&{version:number};
  if(!state||Number(state.version)!==2)throw Error('旧盘面版本不匹配');
  const stats=freshStats(true);
  stats.elapsedMs=Number.isFinite(state.elapsedMs)?Math.max(0,state.elapsedMs):0;
  stats.picks=integer(state.moves)?state.moves:0;stats.peakBuffer=occupiedBuffer(state);
  stats.boxesCompleted=state.collected.length/3;
  stats.legacyAssistCount=integer(state.toolsUsed)?state.toolsUsed:0;
  state.version=3;state.contentVersion='v2';state.runId=newRunId();state.actionRevision=0;state.stats=stats;
  state.attemptId=makeAttemptId(state.levelId,state.seed,'v2');
  for(const board of state.boards){board.geometryVersion='v2';board.active=true;}
  delete state.reveal;assertConservation(state);return state;
}
export function loadSave():{data:ProgressSave;warning:string|null} {
  const data=freshSave();let text:string|null=null;
  try {
    text=localStorage.getItem(SAVE_KEY)??localStorage.getItem(R1_KEY);
    if(text){
      const stored=JSON.parse(text) as Partial<ProgressSave>;
      if(stored.version!==4||!Array.isArray(stored.completed))throw Error('存档版本不匹配');
      readMeta(data,stored);
      if(stored.current){assertConservation(stored.current);data.current=stored.current.phase==='won'?null:stored.current;}
      migrateRevision(data,stored);return{data,warning:revisionWarning(stored.contentRevision)};
    }
    const v3Text=localStorage.getItem(V3_KEY);
    if(v3Text){
      const old=JSON.parse(v3Text) as ProgressSave;if(old.version!==3)throw Error('V3存档版本不匹配');readMeta(data,old);
      data.legacyCompleted=[...new Set([...data.legacyCompleted,...data.completed])].sort((a,b)=>a-b);data.completed=[];data.tutorialSeen=[];
      data.records=Object.fromEntries(Object.entries(data.records).map(([key,value])=>[key,{...value,mode:'legacy'}]));
      if(old.current&&old.current.phase!=='won'){assertConservation(old.current);data.current=cloneState(old.current);data.current.mode='legacy';activeRun={schema:1,state:data.current,history:[]};}
      migrateRevision(data,old);
      return{data,warning:data.current?'旧盘面、画册和解锁已保留。旧局未记录过去的撤回，新操作起会完整保存。':'画册、材料、旧成绩和解锁已保留。V4精修关卡从新的记录开始。'};
    }
    const oldText=localStorage.getItem(LEGACY_KEY);
    if(oldText){
      const old=JSON.parse(oldText);if(old.version!==2)throw Error('旧版记录格式不符');
      readMeta(data,old);
      data.rewardedAttempts=data.rewardedAttempts.map(key=>/^\d+:\d+$/.test(key)?'v2:'+key:key);
      data.attempts=Object.fromEntries(Object.entries(data.attempts).map(([key,value])=>[key.startsWith('v')?key:'v2:'+key,value]));
      const wonEndless=data.rewardedAttempts.map(key=>Number(/^v2:(\d+):/.exec(key)?.[1])).filter(id=>Number.isInteger(id)&&id>30);
      data.endlessNextId=Math.max(data.endlessNextId,...wonEndless.map(id=>id+1));
      if(old.current&&old.current.phase!=='won')data.current=migrateV2State(old.current);
      data.legacyCompleted=[...new Set([...data.legacyCompleted,...data.completed])].sort((a,b)=>a-b);data.completed=[];
      if(data.current){data.current.mode='legacy';activeRun={schema:1,state:data.current,history:[]};}
      migrateRevision(data,old);
      return{data,warning:data.current?'旧局已保留，继续完成它；下一局会使用新版关卡。':'旧版作品、材料和通关进度已保留。'};
    }
    const first=localStorage.getItem(V1_KEY);
    if(first){const old=JSON.parse(first);data.legacyCompleted=ids(old.completed);data.unlocked=Math.min(9,Math.max(1,...data.legacyCompleted.map(id=>id+1)));for(const key of ['sound','reducedMotion','colorLabels'] as const)if(typeof old.settings?.[key]==='boolean')data.settings[key]=old.settings[key];for(const id of ids(old.album,6)){const art=ARTWORKS[id-1];data.artworkProgress[id-1]=art.columns*art.rows;}data.album=ids(old.album,6);return{data,warning:'旧版已得到的作品和关卡解锁仍然保留。'};}
    return{data,warning:null};
  }catch{recoveryText=text;return{data,warning:'这份盘面没有完整读取，原记录仍保留着。'};}
}
function cloneState(state:GameState):GameState{return JSON.parse(JSON.stringify(state));}
export async function loadSaveAsync():Promise<{data:ProgressSave;warning:string|null;run:RunCheckpoint|null}> {
  const fallback=loadSave();
  try{const entry=await readJournal();
  if(entry){const raw=entry.progress as ProgressSave;if(raw.version!==4)throw Error('恢复记录版本不符');const data=freshSave();readMeta(data,raw);migrateRevision(data,raw);data.updatedAt=raw.updatedAt;const run=unpackRun(entry.run);data.current=run?.state??null;activeRun=run;return{data,warning:readPending()?'已恢复关闭前最后的操作与撤回记录。':null,run};}}
  catch{fallback.warning='部分恢复记录不完整，原记录仍保留。已读取可用进度，可从保存状态导入备份。';}
  activeRun=fallback.data.current?{schema:1,state:fallback.data.current,history:[]}:null;
  return{...fallback,run:activeRun};
}
export function awardVictory(data:ProgressSave,state:GameState,attempt=0):number {
  if(state.phase!=='won'||data.completedRuns.includes(state.runId))return 0;
  data.completedRuns.push(state.runId);
  const rank=clearRank(state.stats),old=data.records[state.attemptId];
  const record:BestRecord={puzzleId:state.attemptId,contentVersion:state.contentVersion,levelId:state.levelId,attempt,seed:state.seed,rank,elapsedMs:state.elapsedMs,undos:state.stats.undos,hintsShown:state.stats.hintsShown,assists:assistCount(state.stats),clears:(old?.clears??0)+1,updatedAt:Date.now(),mode:state.contentVersion==='v4'?state.mode??'campaign':'legacy',contentRevision:state.contentRevision};
  const better=!old||RANK_ORDER[rank]>RANK_ORDER[old.rank]||(rank===old.rank&&(record.elapsedMs<old.elapsedMs||(record.elapsedMs===old.elapsedMs&&record.undos<old.undos)));
  data.records[state.attemptId]=better?record:{...old,clears:record.clears,updatedAt:record.updatedAt};
  const v4campaign=state.contentVersion==='v4'&&(state.mode??'campaign')==='campaign';
  const campaign=v4campaign&&((state.contentRevision??1)===CONTENT_REVISION||(state.contentRevision??1)===2);
  const currentCampaign=v4campaign&&(state.contentRevision??1)===CONTENT_REVISION;
  const legacyR2=v4campaign&&(state.contentRevision??1)===2;
  const oldCampaign=v4campaign&&!campaign;
  const legacy=state.contentVersion!=='v4';
  const firstClear=campaign?!data.completed.includes(state.levelId):oldCampaign?!data.r1Campaign.completed.includes(state.levelId):legacy&&state.levelId<=30&&!data.legacyCompleted.includes(state.levelId);
  if(!data.rewardedAttempts.includes(state.attemptId))data.rewardedAttempts.push(state.attemptId);
  if(currentCampaign&&!data.completed.includes(state.levelId)){data.completed.push(state.levelId);data.completed.sort((a,b)=>a-b);data.unlocked=Math.min(CAMPAIGN_COUNT+1,Math.max(data.unlocked,state.levelId+1));if(state.levelId===1)data.starterSticker=true;}
  if(legacyR2){const mapped=remapR2Completed([state.levelId]);for(const id of mapped)if(!data.completed.includes(id))data.completed.push(id);data.completed.sort((a,b)=>a-b);data.unlocked=Math.min(CAMPAIGN_COUNT+1,Math.max(data.unlocked,...mapped.map(id=>id+1)));if(mapped.includes(1))data.starterSticker=true;}
  if(oldCampaign){if(!data.r1Campaign.completed.includes(state.levelId))data.r1Campaign.completed.push(state.levelId);data.r1Campaign.unlocked=Math.min(31,Math.max(data.r1Campaign.unlocked,state.levelId+1));}
  if(legacy&&state.levelId<=30&&!data.legacyCompleted.includes(state.levelId)){data.legacyCompleted.push(state.levelId);data.unlocked=Math.min(9,Math.max(data.unlocked,state.levelId+1));}
  if(state.contentVersion==='v4'&&state.mode==='endless')data.endlessNextId=Math.min(1000000,Math.max(data.endlessNextId,state.levelId+1));
  const challenge=state.contentVersion==='v4'&&((state.contentRevision??1)>=2)&&(state.mode==='rescue'||state.mode==='mastery');
  const eligible=new Set(state.rewardableIds??state.screws.map(s=>s.id));
  const newCollected=state.screws.filter(s=>eligible.has(s.id)&&s.place==='done').length;
  const earned=firstClear?state.screws.length:challenge?newCollected:0;data.materialBalance+=earned;data.totalScrews+=challenge?newCollected:state.screws.length;data.current=null;return earned;
}
export async function importRecovery(text:string,previous:ProgressSave):Promise<{data:ProgressSave;run:RunCheckpoint|null}> {
  if(text.length>35_000_000)throw Error('恢复文件过大，请使用游戏导出的 JSON 文件');
  const entry=JSON.parse(text);if(entry?.schema!==1||entry.progress?.version!==4||!Array.isArray(entry.progress.completed))throw Error('这不是可识别的 Doro 恢复文件');
  const run=unpackRun(entry.run),data=freshSave();readMeta(data,entry.progress);migrateRevision(data,entry.progress);data.current=run?.state??null;
  // 验证完整后再保存导入前副本；导入不会抹去原始版本的键或历史数据库。
  await archiveRecovery(exportRecovery(previous));
  const previousRun=activeRun;activeRun=run;persistSave(data);await flushJournal();
  if(getSaveStatus().status==='error'){activeRun=previousRun;persistSave(previous);throw Error('新记录尚未保存，已恢复导入前状态，请先导出备份');}
  return{data,run};
}
export function persistSave(data:ProgressSave):boolean {
  data.updatedAt=Date.now();let meta=true;
  try{if(recoveryText!==null){localStorage.setItem(`${SAVE_KEY}:recovery:${Date.now()}`,recoveryText);recoveryText=null;}localStorage.setItem(SAVE_KEY,JSON.stringify({...data,current:null}));}catch{meta=false;}
  const run=data.current?(activeRun?.state.runId===data.current.runId&&activeRun.state.actionRevision===data.current.actionRevision?activeRun:{schema:1 as const,state:data.current,history:[]}):null;
  return writeJournal(data,run)&&meta;
}

