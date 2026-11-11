import {assertConservation} from './core';
import {copyState} from './snapshot';
import {readJournal as readLegacyJournal} from './journal-r1';
import type {GameState,RunCheckpoint,ScrewPlace} from './types';

const OUTBOX='doro-screw-reborn:v4:r2:pending:';
const DB='doro-screw-reborn-v4-r2';
const PLACES:ScrewPlace[]=['board','buffer','pocket','box','done'];
export interface Frame {
  revision:number;boards:number[][];places:string;detached:Array<[number,number,number]>;
  boxes:GameState['boxes'];buffer:GameState['buffer'];pocket:string[];collected:string[];
  cursor:number;capacity:number;phase:GameState['phase'];moves:number;elapsed:number;tools:number;stats:GameState['stats'];
  revealState?:GameState['revealState'];goal?:GameState['goal'];
}
export interface PackedRun {schema:1;state:GameState;frames:Frame[]}
export interface JournalEntry {schema:1;sequence:number;writtenAt:number;run:PackedRun|null;progress:unknown}
interface RunHead {base:string;current:string;history:string[]}
interface Delta {schema:2;sequence:number;writtenAt:number;progress:unknown;run:RunHead|null;bases:Array<[string,GameState]>;frames:Array<[string,Frame]>}
export type SaveStatus='saving'|'saved'|'local'|'error';
let status:SaveStatus='saved',lastError='',sequence=0,opened:Promise<IDBDatabase>|null=null,pending=Promise.resolve();
let frameSerial=0;const session=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
const listeners=new Set<(status:SaveStatus,message:string)=>void>();
const outstanding=new Map<number,{delta:Delta;local:boolean}>();
const frameCache=new WeakMap<GameState,Frame>(),frameKeys=new WeakMap<GameState,string>(),knownBases=new Set<string>();
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function packFrame(state:GameState):Frame {
  const cached=frameCache.get(state);if(cached)return cached;
  const frame:Frame={revision:state.actionRevision,boards:state.boards.map(b=>[b.x,b.y,b.angle,b.vx,b.vy,b.angularVelocity,+b.melted,+b.falling,+b.gone,b.active===false?0:1]),places:state.screws.map(s=>PLACES.indexOf(s.place)).join(''),detached:state.screws.flatMap((s,i)=>s.detached?[[i,s.x,s.y] as [number,number,number]]:[]),boxes:state.boxes,buffer:state.buffer,pocket:state.pocket,collected:state.collected,cursor:state.queueCursor,capacity:state.capacity,phase:state.phase,moves:state.moves,elapsed:state.elapsedMs,tools:state.toolsUsed,stats:state.stats,revealState:state.revealState,goal:state.goal};
  frameCache.set(state,frame);return frame;
}
export function packRun(run:RunCheckpoint|null):PackedRun|null {return run?{schema:1,state:run.state,frames:run.history.map(packFrame)}:null;}
function unpackFrame(base:GameState,frame:Frame):GameState {
  if(!Array.isArray(frame.boards)||frame.boards.length!==base.boards.length||frame.places.length!==base.screws.length||!/^[0-4]*$/.test(frame.places))throw Error('撤回盘面不完整');
  const state=copyState(base),detached=new Map(frame.detached.map(([i,x,y])=>[i,{x,y}]));
  state.boards.forEach((b,i)=>{const row=frame.boards[i];if(row.length!==10)throw Error('撤回板件不完整');[b.x,b.y,b.angle,b.vx,b.vy,b.angularVelocity]=row;b.melted=!!row[6];b.falling=!!row[7];b.gone=!!row[8];b.active=!!row[9];});
  const boards=new Map(state.boards.map(b=>[b.id,b]));
  state.screws.forEach((s,i)=>{s.place=PLACES[Number(frame.places[i])];const point=detached.get(i);s.detached=!!point;if(point){s.x=point.x;s.y=point.y;}else{const b=boards.get(s.boardId)!;s.x=b.x+s.localX*Math.cos(b.angle)-s.localY*Math.sin(b.angle);s.y=b.y+s.localX*Math.sin(b.angle)+s.localY*Math.cos(b.angle);}});
  Object.assign(state,{actionRevision:frame.revision,boxes:clone(frame.boxes),buffer:[...frame.buffer],pocket:[...frame.pocket],collected:[...frame.collected],queueCursor:frame.cursor,capacity:frame.capacity,phase:frame.phase,moves:frame.moves,elapsedMs:frame.elapsed,toolsUsed:frame.tools,stats:clone(frame.stats),goal:frame.goal,revealState:frame.revealState?clone(frame.revealState):undefined});
  assertConservation(state);return state;
}
export function unpackRun(packed:PackedRun|null):RunCheckpoint|null {
  if(!packed)return null;
  if(packed.schema!==1||!Array.isArray(packed.frames)||packed.frames.length>512)throw Error('撤回存档格式无效');
  assertConservation(packed.state);
  const history=packed.frames.map(frame=>{const state=unpackFrame(packed.state,frame);if(state.actionRevision>=packed.state.actionRevision)throw Error('撤回顺序无效');return state;});
  return{schema:1,state:copyState(packed.state),history};
}
function notify(next:SaveStatus,message=''){status=next;lastError=message;for(const listener of listeners)listener(next,message);}
export function onSaveStatus(listener:(status:SaveStatus,message:string)=>void):()=>void {listeners.add(listener);listener(status,lastError);return()=>listeners.delete(listener);}
export function getSaveStatus(){return{status,message:lastError};}
export function noteUnsaved():void{notify('saving');}
function open():Promise<IDBDatabase> {
  if(opened)return opened;
  opened=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(Error('此环境未开放本地数据库'));return;}
    const request=indexedDB.open(DB,1);let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;reject(Error('本地数据库暂时没有响应'));}},2000);
    request.onupgradeneeded=()=>{for(const name of ['journal','bases','frames'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
    request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;request.result.onversionchange=()=>{request.result.close();opened=null;};resolve(request.result);};
    request.onerror=()=>{clearTimeout(timer);settled=true;reject(request.error??Error('本地数据库无法打开'));};
    request.onblocked=()=>{clearTimeout(timer);settled=true;reject(Error('请关闭旧的游戏标签页后重试保存'));};
  });
  opened.catch(()=>{opened=null;});return opened;
}
function valid(value:unknown):value is Delta {const item=value as Delta;return !!item&&item.schema===2&&Number.isSafeInteger(item.sequence)&&item.sequence>=0&&typeof item.progress==='object'&&Array.isArray(item.bases)&&Array.isArray(item.frames);}
function pendingDeltas():Delta[] {
  const values:Delta[]=[];
  try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(OUTBOX))continue;try{const item=JSON.parse(localStorage.getItem(key)!);if(valid(item))values.push(item);}catch{}}}catch{}
  return values.sort((a,b)=>a.sequence-b.sequence);
}
export function readPending():Delta|null {return pendingDeltas().at(-1)??null;}
function get<T>(db:IDBDatabase,store:string,key:string):Promise<T|undefined>{return new Promise((resolve,reject)=>{const request=db.transaction(store,'readonly').objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function readJournal():Promise<JournalEntry|null> {
  const locals=pendingDeltas();let db:IDBDatabase|null=null,saved:Delta|undefined;
  try{db=await open();saved=await get<Delta>(db,'journal','latest');}catch(error){notify(locals.length?'local':'error',String(error));}
  const heads=[...(saved&&valid(saved)?[saved]:[]),...locals].sort((a,b)=>b.sequence-a.sequence);
  if(!heads.length)return readLegacyJournal();
  const bases=new Map(locals.flatMap(d=>d.bases)),frames=new Map(locals.flatMap(d=>d.frames));
  for(const head of heads){
    try{
      let run:PackedRun|null=null;
      if(head.run){
        const base=bases.get(head.run.base)??(db?await get<GameState>(db,'bases',head.run.base):undefined);if(!base)throw Error('缺少盘面蓝图');
        const keys=[head.run.current,...head.run.history];
        const rows=await Promise.all(keys.map(async key=>frames.get(key)??(db?await get<Frame>(db,'frames',key):undefined)));
        if(rows.some(row=>!row))throw Error('缺少增量记录');
        run={schema:1,state:unpackFrame(base,rows[0]!),frames:rows.slice(1) as Frame[]};unpackRun(run);
      }
      sequence=Math.max(sequence,head.sequence);
      // 关闭前的分片恢复成功后原样事务提交；无需在下一次点击重新打包历史。
      for(const delta of locals)queueCommit(delta,true);
      return{schema:1,sequence:head.sequence,writtenAt:head.writtenAt,progress:head.progress,run};
    }catch(error){notify('error','已保留不完整记录，尝试最近的完整事务。'+String(error));}
  }
  throw Error('未找到完整的增量存档；原记录仍保留，可导入导出的恢复文件。');
}
async function commit(delta:Delta):Promise<void> {
  const db=await open();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['journal','bases','frames'],'readwrite'),store=tx.objectStore('journal'),request=store.get('latest');
    for(const [key,value]of delta.bases)tx.objectStore('bases').put(value,key);
    for(const [key,value]of delta.frames)tx.objectStore('frames').put(value,key);
    request.onsuccess=()=>{const old=request.result as Delta|undefined;if(!old||old.sequence<delta.sequence)store.put({...delta,bases:[],frames:[]},'latest');};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??Error('保存事务失败'));tx.onabort=()=>reject(tx.error??Error('保存事务已取消'));
  });
}
function queueCommit(delta:Delta,local:boolean):void {
  outstanding.set(delta.sequence,{delta,local});
  pending=pending.catch(()=>{}).then(async()=>{
    for(const [number,item]of outstanding){
      if(number>delta.sequence)continue;
      try{await commit(item.delta);outstanding.delete(number);try{localStorage.removeItem(OUTBOX+number);}catch{}if(number===sequence)notify('saved');}
      catch(error){if(delta.sequence===sequence)notify(local?'local':'error',local?'已保存在恢复日志中，下次仍可继续。':String(error));break;}
    }
  });
}
export function writeJournal(progress:unknown,run:RunCheckpoint|null):boolean {
  const cleanProgress={...(progress as Record<string,unknown>),current:null};
  const delta:Delta={schema:2,sequence:sequence=Math.max(sequence+1,Date.now()),writtenAt:Date.now(),progress:clone(cleanProgress),run:null,bases:[],frames:[]};
  if(run){
    const base=run.state.runId;
    if(!knownBases.has(base)){delta.bases.push([base,run.state]);knownBases.add(base);}
    const keyFor=(state:GameState)=>{let key=frameKeys.get(state);if(!key){key=session+'/'+(++frameSerial);frameKeys.set(state,key);delta.frames.push([key,packFrame(state)]);}return key;};
    delta.run={base,current:keyFor(run.state),history:run.history.map(keyFor)};
  }
  let local=false;
  for(const item of outstanding.values())if(!item.local){try{localStorage.setItem(OUTBOX+item.delta.sequence,JSON.stringify(item.delta));item.local=true;}catch{}}
  try{localStorage.setItem(OUTBOX+delta.sequence,JSON.stringify(delta));local=true;}catch(error){lastError=String(error);}
  notify(local?'saving':'error',local?'':'同步恢复记录未写入，请保持页面开启或导出备份。');queueCommit(delta,local);return local;
}
export async function flushJournal():Promise<void>{await pending;}
export async function archiveRecovery(text:string):Promise<void>{
  const key='before-import:'+Date.now()+':'+session;
  try{const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('journal','readwrite');tx.objectStore('journal').put(text,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  catch{try{localStorage.setItem('doro-screw-reborn:v4:r2:'+key,text);}catch{throw Error('无法保留导入前的记录，请先解决保存空间问题');}}
}
export function recoveryText(progress:unknown,run:RunCheckpoint|null):string{return JSON.stringify({schema:1,sequence:Math.max(sequence,Date.now()),writtenAt:Date.now(),progress:{...(progress as Record<string,unknown>),current:null},run:packRun(run)},null,2);}
