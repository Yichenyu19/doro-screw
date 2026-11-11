import type {ContentVersion,GameState,HintInfo,LevelDef,PlayMode} from './types';
import {CONTENT_REVISION} from './run';
import type {VisibleDiagnosis,VisibleObservation} from './visible-analysis';
interface Pending{resolve:(value:any)=>void;reject:(error:Error)=>void;kind:'level'|'hint'}
export interface HintResponse{runId:string;revision:number;hint:HintInfo}
export class GameServices {
  private sequence=0;private levelWorker:Worker|null=null;private hintWorker:Worker|null=null;
  private pending=new Map<number,Pending>();private hintRequest:number|null=null;
  private cache=new Map<string,Promise<LevelDef>>();
  private worker(kind:'level'|'hint'):Worker {
    if(import.meta.env.DORO_MAPP)throw new Error('微应用在主线程准备关卡和提示，不创建 Worker');
    const name=kind==='level'?'levelWorker':'hintWorker';if(this[name])return this[name]!;
    const worker=new Worker(new URL('./analysis.worker.ts',import.meta.url),{type:'module',name:'doro-'+kind});
    worker.onmessage=event=>{const item=this.pending.get(event.data.id);if(!item)return;this.pending.delete(event.data.id);if(this.hintRequest===event.data.id)this.hintRequest=null;event.data.ok?item.resolve(event.data):item.reject(new Error(event.data.error));};
    worker.onerror=event=>{const error=new Error(event.message||'后台计算没有完成');for(const [id,item]of this.pending){if(item.kind===kind){item.reject(error);this.pending.delete(id);}}if(kind==='level')this.cache.clear();worker.terminate();this[name]=null;};
    this[name]=worker;return worker;
  }
  prepare(levelId:number,attempt=0,version:ContentVersion='v4',mode:PlayMode=levelId>30?'endless':'campaign',revision=CONTENT_REVISION):Promise<LevelDef> {
    if(version==='v4'&&mode==='campaign')attempt=0;
    const key=`${version}:${revision}:${mode}:${levelId}:${attempt}`,existing=this.cache.get(key);if(existing)return existing.then(level=>structuredClone(level));
    const fromWorker=()=>import.meta.env.DORO_MAPP?import('./mapp/inline-services').then(mod=>mod.prepare(levelId,attempt,version,mode,revision)):new Promise<LevelDef>((resolve,reject)=>{const id=++this.sequence;this.pending.set(id,{resolve:data=>resolve(data.level),reject,kind:'level'});try{this.worker('level').postMessage({id,kind:'prepare',levelId,attempt,version,mode,revision});}catch(error){this.pending.delete(id);reject(error);}});
    const usePack=version==='v4'&&mode==='campaign'&&!import.meta.env.DEV&&!import.meta.env.DORO_MAPP&&(import.meta.env.MODE!=='verification'||revision===CONTENT_REVISION);
    const promise=usePack?fetch(new URL(`campaign/r${revision}/level-${levelId}.json`,document.baseURI)).then(async response=>{if(!response.ok){if(revision===CONTENT_REVISION)throw Error('精修盘面未能加载，请重试。');return fromWorker();}const level=await response.json() as LevelDef;if(level.id!==levelId||level.contentVersion!=='v4'||level.contentRevision!==revision||level.mode!=='campaign')throw Error('关卡内容版本不匹配');return level;}):fromWorker();
    this.cache.set(key,promise);promise.catch(()=>this.cache.delete(key));if(this.cache.size>6)this.cache.delete(this.cache.keys().next().value!);
    return promise.then(level=>structuredClone(level));
  }
  hint(level:LevelDef,state:GameState):Promise<HintResponse> {
    this.cancelHint();
    if(import.meta.env.DORO_MAPP)return import('./mapp/inline-services').then(mod=>mod.hint(level,state));
    return new Promise((resolve,reject)=>{const id=++this.sequence;this.hintRequest=id;this.pending.set(id,{resolve,reject,kind:'hint'});try{this.worker('hint').postMessage({id,kind:'hint',level,state});}catch(error){this.pending.delete(id);this.hintRequest=null;reject(error);}});
  }
  diagnose(observation:VisibleObservation):Promise<{runId:string;revision:number;diagnosis:VisibleDiagnosis}>{
    this.cancelHint();
    if(import.meta.env.DORO_MAPP)return import('./mapp/inline-services').then(mod=>mod.diagnose(observation));
    return new Promise((resolve,reject)=>{const id=++this.sequence;this.hintRequest=id;this.pending.set(id,{resolve,reject,kind:'hint'});try{this.worker('hint').postMessage({id,kind:'observe',observation});}catch(error){this.pending.delete(id);this.hintRequest=null;reject(error);}});
  }
  cancelHint(){if(this.hintRequest!==null){this.pending.get(this.hintRequest)?.reject(new DOMException('这次提示已取消','AbortError'));this.pending.delete(this.hintRequest);this.hintRequest=null;this.hintWorker?.terminate();this.hintWorker=null;}}
  dispose(){this.cancelHint();this.levelWorker?.terminate();this.levelWorker=null;for(const item of this.pending.values())item.reject(new DOMException('页面已离开','AbortError'));this.pending.clear();this.cache.clear();}
}
