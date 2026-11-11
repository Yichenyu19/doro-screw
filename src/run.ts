import type {ClearRank,ContentVersion,PlayMode,RunStats,ToolKind} from './types';
export const TOOL_KINDS:ToolKind[]=['expand-box','expand-buffer','clear-buffer','melt','revive'];
export function freshStats(legacy=false):RunStats{return{elapsedMs:0,picks:0,undos:0,hintsShown:0,assists:{'expand-box':0,'expand-buffer':0,'clear-buffer':0,melt:0,revive:0},peakBuffer:0,boxesCompleted:0,maxChain:0,legacy};}
export function assistCount(stats:RunStats):number{return TOOL_KINDS.reduce((sum,key)=>sum+stats.assists[key],stats.legacyAssistCount??0);}
export function clearRank(stats:RunStats):ClearRank{return stats.legacy||assistCount(stats)>0||stats.hintsShown>0?'complete':stats.undos>0?'independent':'clean';}
export const RANK_NAMES:Record<ClearRank,string>={complete:'完成',independent:'独立解出',clean:'零回退'};
export const RANK_ORDER:Record<ClearRank,number>={complete:0,independent:1,clean:2};
export const CONTENT_REVISION=3;
export function puzzleId(levelId:number,seed:number,version:ContentVersion='v4',mode:PlayMode=levelId>30?'endless':'campaign',revision=CONTENT_REVISION){return version==='v4'?`${version}:${revision}:${mode}:${levelId}:${seed}`:`${version}:${levelId}:${seed}`;}
let serial=0;
export function newRunId():string{return typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():`${Date.now().toString(36)}-${(++serial).toString(36)}-${Math.random().toString(36).slice(2,10)}`;}
function checksum(text:string){let hash=2166136261;for(const char of text){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(36).toUpperCase().slice(-5);}
export function challengeCode(levelId:number,attempt:number,version:ContentVersion='v4',mode:PlayMode=levelId>30?'endless':'campaign',revision=CONTENT_REVISION):string{const body=version==='v4'?`D4-${revision.toString(36).toUpperCase()}-${mode==='random'?'R':mode==='endless'?'E':mode==='rescue'?'S':mode==='mastery'?'M':'C'}-${levelId.toString(36).toUpperCase()}-${(mode==='campaign'?0:attempt).toString(36).toUpperCase()}`:`D${version==='v2'?2:3}-${levelId.toString(36).toUpperCase()}-${attempt.toString(36).toUpperCase()}`;return`${body}-${checksum(body)}`;}
export function parseChallengeCode(input:string):{levelId:number;attempt:number;contentVersion:ContentVersion;mode?:PlayMode;contentRevision?:number}|null {
  const modern=/^(D4)-([0-9A-Z]{1,3})-([CREMS])-([0-9A-Z]{1,4})-([0-9A-Z]{1,6})-([0-9A-Z]{1,5})$/.exec(input.trim().toUpperCase());
  if(modern){const body=modern.slice(1,6).join('-'),revision=parseInt(modern[2],36),levelId=parseInt(modern[4],36),attempt=parseInt(modern[5],36),mode:PlayMode=modern[3]==='R'?'random':modern[3]==='E'?'endless':modern[3]==='S'?'rescue':modern[3]==='M'?'mastery':'campaign';
    const supported=revision===1?(['campaign','random','endless'].includes(mode)&&(mode==='endless'?levelId>30:levelId<=30)):revision===2?(['campaign','rescue','mastery'].includes(mode)&&levelId<=8&&(mode==='campaign'||levelId>=2)):revision>=3?(['campaign','rescue','mastery'].includes(mode)&&(mode==='campaign'?levelId<=10:levelId>=2&&levelId<=8)):false;
    if(checksum(body)!==modern[6]||!supported||levelId<1||levelId>1000000||attempt>1000000||(mode==='campaign'&&attempt!==0))return null;return{levelId,attempt,mode,contentRevision:revision,contentVersion:'v4'};}
  const code=input.trim().toUpperCase();const match=/^(D[23])-([0-9A-Z]{1,4})-([0-9A-Z]{1,4})-([0-9A-Z]{1,5})$/.exec(code);
  if(!match)return null;const body=match.slice(1,4).join('-');if(checksum(body)!==match[4])return null;
  const levelId=parseInt(match[2],36),attempt=parseInt(match[3],36);
  return levelId>=1&&levelId<=1000000&&attempt<=1000000?{levelId,attempt,contentVersion:match[1]==='D2'?'v2':'v3'}:null;
}

