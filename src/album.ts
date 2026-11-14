export const ALBUM_REVISION=2;
export const ALBUM_VOLUME_COUNT=3;
export const LEGACY_ALBUM_CELLS=[600,702,784,870,960,1088] as const;
export const ARTWORKS=[
  {id:1,title:'睡到螺丝松',columns:17,rows:16},
  {id:2,title:'今天也摸鱼',columns:16,rows:15},
  {id:3,title:'草莓补给站',columns:22,rows:23},
  {id:4,title:'螺丝小宇宙',columns:15,rows:15},
  {id:5,title:'花田休息日',columns:16,rows:15},
  {id:6,title:'今日螺丝王',columns:17,rows:17},
] as const;
export const CAMPAIGN_MATERIAL_GRANTS=[90,208,110,115,120,125,125,127] as const;
export const ALBUM_TOTAL_CELLS=ARTWORKS.reduce((sum,art)=>sum+art.columns*art.rows,0);
export const ALBUM_VOLUME_CELLS=ARTWORKS.slice(0,ALBUM_VOLUME_COUNT).reduce((sum,art)=>sum+art.columns*art.rows,0);
export const ARTWORK_STAGE_NAMES=['核心轮廓','向外成形','画面展开','最后收边'] as const;

const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

export function artworkCells(index:number):number{
  const art=ARTWORKS[index];
  return art?art.columns*art.rows:0;
}
export function campaignMaterialGrant(levelId:number,revision:number,pinCount:number,currentRevision:number):number{
  if(revision===currentRevision&&levelId>=1&&levelId<=CAMPAIGN_MATERIAL_GRANTS.length)return CAMPAIGN_MATERIAL_GRANTS[levelId-1];
  return pinCount;
}
export function projectAlbumFill(progress:number[],balance:number):{progress:number[];completed:number[];spent:number}{
  const next=ARTWORKS.map((art,index)=>Math.min(art.columns*art.rows,progress[index]??0));
  let left=Math.max(0,balance),spent=0;
  for(let index=0;index<ARTWORKS.length&&left>0;index++){
    const total=ARTWORKS[index].columns*ARTWORKS[index].rows,add=Math.min(left,total-next[index]);
    next[index]+=add;left-=add;spent+=add;
  }
  return{progress:next,completed:ARTWORKS.filter((art,index)=>next[index]>=art.columns*art.rows).map(art=>art.id),spent};
}
export function filledArtworkCount(progress:number[]):number{
  return ARTWORKS.filter((art,index)=>(progress[index]??0)>=art.columns*art.rows).length;
}
export function volumeCompleted(progress:number[]):boolean{
  return ARTWORKS.slice(0,ALBUM_VOLUME_COUNT).every((art,index)=>(progress[index]??0)>=art.columns*art.rows);
}
export function migrateAlbumLayout(progress:unknown,storedRevision:unknown):{progress:number[];revision:number;migrated:boolean}{
  const current=ARTWORKS.map((art,index)=>Math.min(art.columns*art.rows,Array.isArray(progress)&&integer(progress[index])?progress[index]:0));
  if(integer(storedRevision)&&storedRevision>=ALBUM_REVISION)return{progress:current,revision:ALBUM_REVISION,migrated:false};
  const filled=(Array.isArray(progress)?progress:[]).reduce((sum:number,value)=>sum+(integer(value)?value:0),0);
  return{progress:projectAlbumFill(ARTWORKS.map(()=>0),filled).progress,revision:ALBUM_REVISION,migrated:true};
}
export function describeAlbumGoal(progress:number[],balance:number):{
  index:number;title:string;filled:number;total:number;percent:number;stageName:string;
  remainStage:number;remainArt:number;completedCount:number;nextTitle:string|null;summary:string;
  volumeComplete:boolean;volumeCount:number;
}{
  const projected=projectAlbumFill(progress,balance);
  const volumeComplete=volumeCompleted(projected.progress);
  const volumeCount=Math.min(ALBUM_VOLUME_COUNT,projected.completed.length);
  const index=projected.progress.findIndex((filled,i)=>filled<ARTWORKS[i].columns*ARTWORKS[i].rows);
  if(index<0){
    const last=ARTWORKS[ARTWORKS.length-1];
    return{index:-1,title:last.title,filled:last.columns*last.rows,total:last.columns*last.rows,percent:100,stageName:'全部完成',remainStage:0,remainArt:0,completedCount:ARTWORKS.length,nextTitle:null,summary:'画都收齐了。',volumeComplete:true,volumeCount:ALBUM_VOLUME_COUNT};
  }
  const art=ARTWORKS[index],total=art.columns*art.rows,filled=projected.progress[index];
  const percent=Math.round(filled/total*100);
  const stageIndex=Math.min(3,Math.floor(filled/total*4));
  const remainStage=Math.max(0,Math.ceil((stageIndex+1)*total/4)-filled);
  const remainArt=total-filled,completedCount=projected.completed.length;
  const nextTitle=index+1<ARTWORKS.length?ARTWORKS[index+1].title:null;
  const inEncore=index>=ALBUM_VOLUME_COUNT;
  const encoreStarted=inEncore&&filled>=Math.ceil(total/4);
  const summary=volumeComplete?(encoreStarted?`这一卷收齐了。《${art.title}》已有 ${filled} / ${total} 颗。`:'这一卷收齐了。'):
    filled===0?`下一幅是《${art.title}》。`:
    filled<total/4?`《${art.title}》已有 ${filled} / ${total} 颗。`:
    filled<total?`《${art.title}》已有 ${filled} / ${total} 颗，正在${ARTWORK_STAGE_NAMES[stageIndex]}。`:
    `《${art.title}》已经完成。`;
  return{index,title:volumeComplete&&!encoreStarted?'这一卷':art.title,filled,total,percent,stageName:volumeComplete&&!encoreStarted?'这一卷收齐了':ARTWORK_STAGE_NAMES[stageIndex],remainStage,remainArt,completedCount,nextTitle,summary,volumeComplete,volumeCount};
}
export function campaignAlbumSchedule():{levelId:number;grant:number;cumulative:number;filled:number[];completed:number[];volumeComplete:boolean}[]{
  let cumulative=0;const filled=ARTWORKS.map(()=>0),rows=[];
  for(let levelId=1;levelId<=CAMPAIGN_MATERIAL_GRANTS.length;levelId++){
    const grant=CAMPAIGN_MATERIAL_GRANTS[levelId-1];cumulative+=grant;
    const projected=projectAlbumFill(filled,grant);
    for(let i=0;i<filled.length;i++)filled[i]=projected.progress[i];
    rows.push({levelId,grant,cumulative,filled:[...filled],completed:projected.completed,volumeComplete:volumeCompleted(filled)});
  }
  return rows;
}
