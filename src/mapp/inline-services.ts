import {getContentLevel} from '../content';
import {physicalHint} from '../matter-analysis';
import {diagnoseVisible,type VisibleObservation} from '../visible-analysis';
import type {ContentVersion,GameState,LevelDef,PlayMode} from '../types';
import type {HintResponse} from '../worker-client';

export function prepare(levelId:number,attempt:number,version:ContentVersion,mode:PlayMode,revision:number):Promise<LevelDef>{
  return getContentLevel(levelId,attempt,version,mode,revision);
}
export function hint(level:LevelDef,state:GameState):HintResponse{
  return{runId:state.runId,revision:state.actionRevision,hint:physicalHint(level,state)};
}
export function diagnose(observation:VisibleObservation){
  return{runId:observation.runId,revision:observation.revision,diagnosis:diagnoseVisible(observation)};
}
