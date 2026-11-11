import './geometry-setup';
import {CONTENT_REVISION} from './run';
import type {ContentVersion,LevelDef,PlayMode} from './types';
export async function getContentLevel(id:number,attempt=0,version:ContentVersion='v4',mode:PlayMode=id>30?'endless':'campaign',revision=CONTENT_REVISION):Promise<LevelDef> {
  if(version==='v4'&&revision>=2){
    if(mode==='rescue'||mode==='mastery'){const {getR2Challenge}=await import('./challenges-r2');return getR2Challenge(id,attempt,mode,revision);}
    if(mode!=='campaign')throw Error('本修订使用主题精修与残局挑战');
    if(revision===2){const {getR2Prototype}=await import('./authored-r2');return getR2Prototype(id);}
    const {getCampaignLevel}=await import('./authored-r2');return getCampaignLevel(id);
  }
  const source=version==='v2'?await import('./levels-v2'):version==='v3'?await import('./levels-v3'):await import('./levels-r1');
  const level=source.getLevel(id,version==='v4'&&mode==='campaign'?0:attempt);
  level.contentVersion=version;level.geometryVersion=version;
  level.mode=version==='v4'?mode:'legacy';if(version==='v4')level.contentRevision=1;
  for(const board of level.boards)board.geometryVersion=version;
  return level;
}
