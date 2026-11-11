import './geometry-setup';
import {diagnoseVisible,type VisibleObservation} from './visible-analysis';
import {getContentLevel} from './content';
import type {ContentVersion,GameState,LevelDef,PlayMode} from './types';
type Request={id:number;kind:'prepare';levelId:number;attempt:number;version:ContentVersion;mode:PlayMode;revision?:number}|{id:number;kind:'hint';level:LevelDef;state:GameState}|{id:number;kind:'observe';observation:VisibleObservation};
const scope=self as unknown as {onmessage:((event:MessageEvent<Request>)=>void)|null;postMessage:(data:unknown)=>void};
scope.onmessage=async event=>{
  const request=event.data;
  try{
    if(request.kind==='prepare')scope.postMessage({id:request.id,ok:true,kind:'prepare',level:await getContentLevel(request.levelId,request.attempt,request.version,request.mode,request.revision)});
    else if(request.kind==='observe')scope.postMessage({id:request.id,ok:true,kind:'observe',runId:request.observation.runId,revision:request.observation.revision,diagnosis:diagnoseVisible(request.observation)});
    else {
      const {physicalHint}=await import('./matter-analysis');
      const hint=physicalHint(request.level,request.state);
      scope.postMessage({id:request.id,ok:true,kind:'hint',runId:request.state.runId,revision:request.state.actionRevision,hint});
    }
  }catch(error){scope.postMessage({id:request.id,ok:false,kind:request.kind,error:error instanceof Error?error.message:String(error)});}
};
