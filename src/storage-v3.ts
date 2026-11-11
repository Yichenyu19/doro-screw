import {assertConservation,makeAttemptId,occupiedBuffer} from './core';
import {assistCount,clearRank,freshStats,newRunId,RANK_ORDER} from './run';
import type {BestRecord,GameState,RunStats,SaveData,Settings} from './types';

export const SAVE_KEY='doro-screw-reborn:v3';
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
}
export const DEFAULT_SETTINGS:Settings={sound:true,reducedMotion:false,colorLabels:false};
let recoveryText:string|null=null;
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const ids=(value:unknown,max=30):number[]=>Array.isArray(value)?[...new Set(value.filter((id):id is number=>Number.isInteger(id)&&id>=1&&id<=max))].sort((a,b)=>a-b):[];
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];
export function freshSave():ProgressSave {
  const reducedMotion=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return{version:3,current:null,completed:[],unlocked:1,album:[],settings:{...DEFAULT_SETTINGS,reducedMotion:!!reducedMotion},updatedAt:Date.now(),materialBalance:0,artworkProgress:ARTWORKS.map(()=>0),rewardedAttempts:[],completedRuns:[],attemptCounter:0,attempts:{},legacyCompleted:[],currentAttempt:0,records:{},endlessNextId:31,tutorialSeen:[],totalScrews:0};
}
function readMeta(data:ProgressSave,stored:Partial<ProgressSave>):void {
  data.completed=ids(stored.completed);data.legacyCompleted=ids(stored.legacyCompleted);
  data.unlocked=Math.min(31,Math.max(1,...data.completed.map(id=>id+1),...data.legacyCompleted.map(id=>id+1)));
  for(const key of ['sound','reducedMotion','colorLabels'] as const)if(typeof stored.settings?.[key]==='boolean')data.settings[key]=stored.settings[key]!;
  data.materialBalance=integer(stored.materialBalance)?stored.materialBalance:0;
  data.artworkProgress=ARTWORKS.map((art,index)=>Math.min(art.columns*art.rows,integer(stored.artworkProgress?.[index])?stored.artworkProgress![index]:0));
  data.album=ARTWORKS.filter((art,index)=>data.artworkProgress[index]>=art.columns*art.rows).map(art=>art.id);
  data.rewardedAttempts=strings(stored.rewardedAttempts).slice(-10000);data.completedRuns=strings(stored.completedRuns).slice(-10000);
  data.attemptCounter=integer(stored.attemptCounter)?stored.attemptCounter:0;
  data.currentAttempt=integer(stored.currentAttempt)?stored.currentAttempt:0;
  if(stored.attempts&&typeof stored.attempts==='object')for(const [key,count]of Object.entries(stored.attempts))if(/^(v[23]:)?\d+$/.test(key)&&integer(count))data.attempts[key]=count;
  data.endlessNextId=integer(stored.endlessNextId)?Math.min(1000000,Math.max(31,stored.endlessNextId)):31;
  data.tutorialSeen=strings(stored.tutorialSeen).slice(0,50);
  data.totalScrews=integer(stored.totalScrews)?stored.totalScrews:data.materialBalance+data.artworkProgress.reduce((a,b)=>a+b,0);
  if(stored.records&&typeof stored.records==='object')for(const [key,record]of Object.entries(stored.records)){
    if(record&&key===record.puzzleId&&['complete','independent','clean'].includes(record.rank)&&integer(record.levelId)&&integer(record.seed)&&Number.isFinite(record.elapsedMs)&&record.elapsedMs>=0&&integer(record.clears))data.records[key]=record;
  }
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
    text=localStorage.getItem(SAVE_KEY);
    if(text){
      const stored=JSON.parse(text) as Partial<ProgressSave>;
      if(stored.version!==3||!Array.isArray(stored.completed))throw Error('存档版本不匹配');
      readMeta(data,stored);
      if(stored.current){assertConservation(stored.current);data.current=stored.current.phase==='won'?null:stored.current;}
      return{data,warning:null};
    }
    const oldText=localStorage.getItem(LEGACY_KEY);
    if(oldText){
      const old=JSON.parse(oldText);if(old.version!==2)throw Error('旧版记录格式不符');
      readMeta(data,old);
      data.rewardedAttempts=data.rewardedAttempts.map(key=>/^\d+:\d+$/.test(key)?'v2:'+key:key);
      data.attempts=Object.fromEntries(Object.entries(data.attempts).map(([key,value])=>[key.startsWith('v')?key:'v2:'+key,value]));
      const wonEndless=data.rewardedAttempts.map(key=>Number(/^v2:(\d+):/.exec(key)?.[1])).filter(id=>Number.isInteger(id)&&id>30);
      data.endlessNextId=Math.max(31,...wonEndless.map(id=>id+1));
      if(old.current&&old.current.phase!=='won')data.current=migrateV2State(old.current);
      return{data,warning:data.current?'旧局已保留，继续完成它；下一局会使用新版关卡。':'旧版作品、材料和通关进度已保留。'};
    }
    const first=localStorage.getItem(V1_KEY);
    if(first){const old=JSON.parse(first);data.legacyCompleted=ids(old.completed);data.unlocked=Math.min(31,Math.max(1,...data.legacyCompleted.map(id=>id+1)));for(const key of ['sound','reducedMotion','colorLabels'] as const)if(typeof old.settings?.[key]==='boolean')data.settings[key]=old.settings[key];for(const id of ids(old.album,6)){const art=ARTWORKS[id-1];data.artworkProgress[id-1]=art.columns*art.rows;}data.album=ids(old.album,6);return{data,warning:'旧版已得到的作品和关卡解锁仍然保留。'};}
    return{data,warning:null};
  }catch{recoveryText=text;return{data,warning:'这份盘面没有完整读取，原记录仍保留着。'};}
}
export function awardVictory(data:ProgressSave,state:GameState,attempt=0):number {
  if(state.phase!=='won'||data.completedRuns.includes(state.runId))return 0;
  data.completedRuns.push(state.runId);
  const rank=clearRank(state.stats),old=data.records[state.attemptId];
  const record:BestRecord={puzzleId:state.attemptId,contentVersion:state.contentVersion,levelId:state.levelId,attempt,seed:state.seed,rank,elapsedMs:state.elapsedMs,undos:state.stats.undos,hintsShown:state.stats.hintsShown,assists:assistCount(state.stats),clears:(old?.clears??0)+1,updatedAt:Date.now()};
  const better=!old||RANK_ORDER[rank]>RANK_ORDER[old.rank]||(rank===old.rank&&(record.elapsedMs<old.elapsedMs||(record.elapsedMs===old.elapsedMs&&record.undos<old.undos)));
  data.records[state.attemptId]=better?record:{...old,clears:record.clears,updatedAt:record.updatedAt};
  const firstClear=state.levelId>30?!data.rewardedAttempts.includes(state.attemptId):!data.completed.includes(state.levelId);
  if(!data.rewardedAttempts.includes(state.attemptId))data.rewardedAttempts.push(state.attemptId);
  if(state.levelId<=30&&!data.completed.includes(state.levelId)){data.completed.push(state.levelId);data.completed.sort((a,b)=>a-b);data.unlocked=Math.min(31,Math.max(data.unlocked,state.levelId+1));}
  if(state.levelId>30)data.endlessNextId=Math.min(1000000,Math.max(data.endlessNextId,state.levelId+1));
  const earned=firstClear?state.screws.length:0;data.materialBalance+=earned;data.totalScrews+=state.screws.length;data.current=null;return earned;
}
export function persistSave(data:ProgressSave):boolean {
  try{if(recoveryText!==null){localStorage.setItem(`${SAVE_KEY}:recovery:${Date.now()}`,recoveryText);recoveryText=null;}data.updatedAt=Date.now();localStorage.setItem(SAVE_KEY,JSON.stringify(data));return true;}catch{return false;}
}
