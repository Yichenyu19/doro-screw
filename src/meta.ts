import {ARTWORKS,ALBUM_VOLUME_COUNT,artworkCells,projectAlbumFill,volumeCompleted} from './album';
import {dailyDateFromAttempt,isDailyBoard} from './r2-catalog';
import {clearRank,CONTENT_REVISION,RANK_ORDER} from './run';
import type {BestRecord,ClearRank,DailyMark,GameState} from './types';

export const TITLES=[
  {id:'first-box',name:'开工'},
  {id:'wall',name:'拆墙'},
  {id:'wall-solo',name:'墙上独立'},
  {id:'volume-one',name:'这一卷'},
  {id:'campaign',name:'八关'},
  {id:'campaign-solo',name:'八关独立'},
  {id:'daily',name:'今日同局'},
  {id:'encore',name:'后来的画'},
] as const;
export type TitleId=typeof TITLES[number]['id'];
const TITLE_IDS=new Set<string>(TITLES.map(item=>item.id));

export interface TitleHost{
  titles:string[];
  completed:number[];
  unlocked:number;
  starterSticker:boolean;
  artworkProgress:number[];
  materialBalance:number;
  records:Record<string,BestRecord>;
  dailyMarks:Record<string,DailyMark>;
}

export function filledArtworkCount(progress:number[]):number{
  return ARTWORKS.filter((art,index)=>(progress[index]??0)>=art.columns*art.rows).length;
}
export function encoreUnlocked(progress:number[]):boolean{
  return volumeCompleted(progress);
}

export function campaignBest(data:Pick<TitleHost,'records'>,levelId:number,revision=CONTENT_REVISION):BestRecord|undefined{
  let best:BestRecord|undefined;
  for(const record of Object.values(data.records)){
    if(record.contentVersion!=='v4'||(record.mode??'campaign')!=='campaign'||record.levelId!==levelId)continue;
    if((record.contentRevision??1)!==revision&&(record.contentRevision??1)!==2)continue;
    if(!best||RANK_ORDER[record.rank]>RANK_ORDER[best.rank]||(record.rank===best.rank&&record.elapsedMs<best.elapsedMs))best=record;
  }
  return best;
}

export function rankMarks(rank:ClearRank|undefined):{complete:boolean;independent:boolean;clean:boolean}{
  return{complete:!!rank,independent:!!rank&&RANK_ORDER[rank]>=RANK_ORDER.independent,clean:rank==='clean'};
}

export interface QuietRating{
  moves:number;
  peakBuffer:number;
  capacity:number;
  leftover:number;
  bestMoves:number|null;
  improvedMoves:boolean;
}

export function quietRating(state:GameState,previous?:BestRecord):QuietRating{
  const moves=state.moves;
  const peakBuffer=Math.max(0,state.stats.peakBuffer);
  const capacity=Math.max(peakBuffer,state.capacity);
  const bestMoves=previous?.bestMoves??previous?.moves??null;
  return{moves,peakBuffer,capacity,leftover:Math.max(0,capacity-peakBuffer),bestMoves,improvedMoves:bestMoves!=null&&moves<bestMoves};
}

export function titleName(id:string):string{
  return TITLES.find(item=>item.id===id)?.name??id;
}

export function knownTitles(values:unknown):TitleId[]{
  if(!Array.isArray(values))return[];
  return TITLES.map(item=>item.id).filter(id=>values.includes(id));
}

export function isTitleId(value:string):value is TitleId{
  return TITLE_IDS.has(value);
}

function grant(data:TitleHost,id:TitleId,earned:TitleId[]):void{
  if(!data.titles.includes(id)){data.titles.push(id);earned.push(id);}
}

export function recordDailyMark(data:TitleHost,state:GameState,rank:ClearRank):void{
  if((state.mode??'campaign')!=='mastery'||!isDailyBoard(state.levelId,state.attempt??0))return;
  const date=dailyDateFromAttempt(state.attempt??0);
  const previous=data.dailyMarks[date];
  if(!previous||RANK_ORDER[rank]>RANK_ORDER[previous.rank]){
    data.dailyMarks[date]={rank,theme:state.levelId,attempt:state.attempt??0,updatedAt:Date.now()};
  }
}

export function syncTitles(data:TitleHost):TitleId[]{
  const earned:TitleId[]=[];
  if(data.starterSticker||data.completed.includes(1))grant(data,'first-box',earned);
  if(data.completed.includes(2))grant(data,'wall',earned);
  const wall=campaignBest(data,2);
  if(wall&&RANK_ORDER[wall.rank]>=RANK_ORDER.independent)grant(data,'wall-solo',earned);
  if(volumeCompleted(projectAlbumFill(data.artworkProgress,data.materialBalance).progress))grant(data,'volume-one',earned);
  if(data.completed.length>=8)grant(data,'campaign',earned);
  if([1,2,3,4,5,6,7,8].every(id=>{const record=campaignBest(data,id);return!!record&&RANK_ORDER[record.rank]>=RANK_ORDER.independent;}))grant(data,'campaign-solo',earned);
  if(Object.keys(data.dailyMarks).length)grant(data,'daily',earned);
  if((data.artworkProgress[3]??0)>=artworkCells(3))grant(data,'encore',earned);
  data.titles=TITLES.map(item=>item.id).filter(id=>data.titles.includes(id));
  return earned;
}

export function noteVictoryMeta(data:TitleHost,state:GameState):TitleId[]{
  recordDailyMark(data,state,clearRank(state.stats));
  return syncTitles(data);
}

export {ALBUM_VOLUME_COUNT,volumeCompleted};
