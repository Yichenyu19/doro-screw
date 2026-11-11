import {assertConservation} from './core';
import type {GameState,RunCheckpoint,ScrewPlace} from './types';

const OUTBOX='doro-screw-reborn:v4:pending';
const DB='doro-screw-reborn-v4';
const PLACES:ScrewPlace[]=['board','buffer','pocket','box','done'];
interface Frame {
  revision:number;boards:number[][];places:string;detached:Array<[number,number,number]>;
  boxes:GameState['boxes'];buffer:GameState['buffer'];pocket:string[];collected:string[];
  cursor:number;capacity:number;phase:GameState['phase'];moves:number;elapsed:number;tools:number;stats:GameState['stats'];
}
export interface PackedRun {schema:1;state:GameState;frames:Frame[]}
export interface JournalEntry {schema:1;sequence:number;writtenAt:number;run:PackedRun|null;progress:unknown}
export type SaveStatus='saving'|'saved'|'local'|'error';
let status:SaveStatus='saved',lastError='',sequence=0,opened:Promise<IDBDatabase>|null=null,pending=Promise.resolve();
const listeners=new Set<(status:SaveStatus,message:string)=>void>();
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const frameCache=new WeakMap<GameState,Frame>();
export function packRun(run:RunCheckpoint|null):PackedRun|null {
  if(!run)return null;
  const frames=run.history.map(state=>{
    const cached=frameCache.get(state);if(cached)return cached;
    const frame:Frame={revision:state.actionRevision,boards:state.boards.map(b=>[b.x,b.y,b.angle,b.vx,b.vy,b.angularVelocity,+b.melted,+b.falling,+b.gone,b.active===false?0:1]),places:state.screws.map(s=>PLACES.indexOf(s.place)).join(''),detached:state.screws.flatMap((s,i)=>s.detached?[[i,s.x,s.y] as [number,number,number]]:[]),boxes:state.boxes,buffer:state.buffer,pocket:state.pocket,collected:state.collected,cursor:state.queueCursor,capacity:state.capacity,phase:state.phase,moves:state.moves,elapsed:state.elapsedMs,tools:state.toolsUsed,stats:state.stats};
    frameCache.set(state,frame);return frame;
  });
  return{schema:1,state:run.state,frames};
}
export function unpackRun(packed:PackedRun|null):RunCheckpoint|null {
  if(!packed)return null;
  if(packed.schema!==1||!Array.isArray(packed.frames)||packed.frames.length>512)throw Error('撤回存档格式无效');
  assertConservation(packed.state);
  const history=packed.frames.map(frame=>{
    if(frame.boards.length!==packed.state.boards.length||frame.places.length!==packed.state.screws.length||!/^[0-4]*$/.test(frame.places))throw Error('撤回盘面不完整');
    const state=clone(packed.state),detached=new Map(frame.detached.map(([i,x,y])=>[i,{x,y}]));
    state.boards.forEach((b,i)=>{const row=frame.boards[i];if(row.length!==10)throw Error('撤回板件不完整');[b.x,b.y,b.angle,b.vx,b.vy,b.angularVelocity]=row;b.melted=!!row[6];b.falling=!!row[7];b.gone=!!row[8];b.active=!!row[9];});
    const boards=new Map(state.boards.map(b=>[b.id,b]));
    state.screws.forEach((s,i)=>{s.place=PLACES[Number(frame.places[i])];const point=detached.get(i);s.detached=!!point;if(point){s.x=point.x;s.y=point.y;}else{const b=boards.get(s.boardId)!;s.x=b.x+s.localX*Math.cos(b.angle)-s.localY*Math.sin(b.angle);s.y=b.y+s.localX*Math.sin(b.angle)+s.localY*Math.cos(b.angle);}});
    Object.assign(state,{actionRevision:frame.revision,boxes:clone(frame.boxes),buffer:[...frame.buffer],pocket:[...frame.pocket],collected:[...frame.collected],queueCursor:frame.cursor,capacity:frame.capacity,phase:frame.phase,moves:frame.moves,elapsedMs:frame.elapsed,toolsUsed:frame.tools,stats:clone(frame.stats)});
    assertConservation(state);if(state.runId!==packed.state.runId||state.actionRevision>=packed.state.actionRevision)throw Error('撤回顺序无效');return state;
  });
  return{schema:1,state:clone(packed.state),history};
}
function notify(next:SaveStatus,message=''){status=next;lastError=message;for(const listener of listeners)listener(next,message);}
export function onSaveStatus(listener:(status:SaveStatus,message:string)=>void):()=>void {listeners.add(listener);listener(status,lastError);return()=>listeners.delete(listener);}
export function getSaveStatus(){return{status,message:lastError};}
function open():Promise<IDBDatabase> {
  if(opened)return opened;
  opened=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(Error('此环境未开放本地数据库'));return;}
    const request=indexedDB.open(DB,1);let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;reject(Error('本地数据库暂时没有响应'));}},2000);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('journal'))request.result.createObjectStore('journal');};
    request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;request.result.onversionchange=()=>{request.result.close();opened=null;};resolve(request.result);};
    request.onerror=()=>{clearTimeout(timer);settled=true;reject(request.error??Error('本地数据库无法打开'));};
    request.onblocked=()=>{clearTimeout(timer);settled=true;reject(Error('请关闭旧的游戏标签页后重试保存'));};
  });
  opened.catch(()=>{opened=null;});return opened;
}
function valid(value:unknown):value is JournalEntry {const item=value as JournalEntry;return !!item&&item.schema===1&&Number.isSafeInteger(item.sequence)&&item.sequence>=0&&typeof item.progress==='object';}
export function readPending():JournalEntry|null {try{const raw=localStorage.getItem(OUTBOX);if(!raw)return null;const item=JSON.parse(raw);return valid(item)?item:null;}catch{return null;}}
export async function readJournal():Promise<JournalEntry|null> {
  const local=readPending();let saved:JournalEntry|null=null;
  try{const db=await open();saved=await new Promise((resolve,reject)=>{const tx=db.transaction('journal','readonly'),request=tx.objectStore('journal').get('latest');request.onsuccess=()=>resolve(valid(request.result)?request.result:null);request.onerror=()=>reject(request.error);});}catch(error){notify(local?'local':'error',String(error));}
  const best=local&&(!saved||local.sequence>=saved.sequence)?local:saved;if(best)sequence=Math.max(sequence,best.sequence);return best;
}
async function commit(entry:JournalEntry):Promise<void> {
  const db=await open();
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('journal','readwrite'),store=tx.objectStore('journal'),request=store.get('latest');request.onsuccess=()=>{const old=request.result as JournalEntry|undefined;if(!old||old.sequence<entry.sequence)store.put(entry,'latest');};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??Error('保存事务失败'));tx.onabort=()=>reject(tx.error??Error('保存事务已取消'));});
}
export function writeJournal(progress:unknown,run:RunCheckpoint|null):boolean {
  const entry:JournalEntry={schema:1,sequence:sequence=Math.max(sequence+1,Date.now()),writtenAt:Date.now(),progress:clone(progress),run:packRun(run)};
  let text='';let local=false;
  try{text=JSON.stringify(entry);localStorage.setItem(OUTBOX,text);local=true;}catch(error){lastError=String(error);}
  notify(local?'saving':'error',local?'':'同步恢复记录未写入，请保持页面开启或导出备份。');
  pending=pending.catch(()=>{}).then(async()=>{
    try{await commit(entry);if(entry.sequence===sequence){try{if(localStorage.getItem(OUTBOX)===text)localStorage.removeItem(OUTBOX);}catch{}notify('saved');}}
    catch(error){if(entry.sequence===sequence)notify(local?'local':'error',local?'已保存在恢复日志中，下次仍可继续。':String(error));}
  });
  return local;
}
export async function flushJournal():Promise<void>{await pending;}
export function recoveryText(progress:unknown,run:RunCheckpoint|null):string{return JSON.stringify({schema:1,sequence:Math.max(sequence,Date.now()),writtenAt:Date.now(),progress,run:packRun(run)},null,2);}
