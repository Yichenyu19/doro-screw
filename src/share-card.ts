import {CAMPAIGN_NAMES,dailyDateFromAttempt,isDailyBoard,R2_NAMES} from './r2-catalog';
import {challengeCode,clearRank,CONTENT_REVISION,RANK_NAMES} from './run';
import type {ClearRank,GameState,LevelDef} from './types';
import type {QuietRating} from './meta';

export const SHARE_WIDTH=900;
export const SHARE_HEIGHT=1200;
export const SHARE_SITE='doro.suki520.com';

export interface ShareSpec{
  gameTitle:string;
  headline:string;
  levelLabel:string;
  rank:ClearRank;
  rankLabel:string;
  moves:number;
  seconds:number;
  peakBuffer:number;
  capacity:number;
  usedAssist:boolean;
  code:string;
  site:string;
  stampNames:string[];
  dailyDate:string|null;
}

export function buildShareSpec(level:Pick<LevelDef,'id'|'name'|'attempt'|'contentVersion'|'mode'|'contentRevision'>,state:Pick<GameState,'moves'|'stats'|'capacity'|'elapsedMs'|'mode'|'levelId'|'attempt'|'contentVersion'|'contentRevision'>,rating:QuietRating,stampNames:string[]=[]):ShareSpec{
  const mode=level.mode??state.mode??'campaign';
  const revision=level.contentRevision??state.contentRevision??CONTENT_REVISION;
  const attempt=level.attempt??state.attempt??0;
  const daily=mode==='mastery'&&isDailyBoard(level.id,attempt);
  const dailyDate=daily?dailyDateFromAttempt(attempt):null;
  const names=revision>=4?CAMPAIGN_NAMES:R2_NAMES;
  const levelName=level.name||names[level.id-1]||`第 ${level.id} 关`;
  const levelLabel=daily?'今日同局':mode==='rescue'?`残局 · ${levelName}`:mode==='mastery'?`精修 · ${levelName}`:levelName;
  const rank=clearRank(state.stats);
  return{
    gameTitle:'DORO · 打个螺丝',
    headline:daily?'今天大家拆的同一局。':mode==='campaign'&&level.id===2?'这关是墙。':'这一局，拆完了。',
    levelLabel,
    rank,
    rankLabel:RANK_NAMES[rank],
    moves:rating.moves,
    seconds:Math.max(1,Math.round((state.stats.elapsedMs||state.elapsedMs||0)/1000)),
    peakBuffer:rating.peakBuffer,
    capacity:rating.capacity,
    usedAssist:rank==='complete',
    code:challengeCode(level.id,attempt,level.contentVersion??'v4',mode,revision),
    site:SHARE_SITE,
    stampNames:stampNames.slice(0,4),
    dailyDate,
  };
}

export function shareSpecHasPersonalData(spec:ShareSpec):boolean{
  const blob=JSON.stringify(spec);
  return /@|phone|user(name)?|email|device|ipv\d|\b\d{11}\b/i.test(blob);
}

function paintScrew(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,fill:string):void{
  ctx.save();
  ctx.fillStyle=fill;
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#70424f';ctx.lineWidth=Math.max(2,r*0.12);
  ctx.stroke();
  ctx.beginPath();ctx.moveTo(x-r*0.45,y);ctx.lineTo(x+r*0.45,y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x,y-r*0.45);ctx.lineTo(x,y+r*0.45);ctx.stroke();
  ctx.restore();
}

export function drawShareCard(ctx:CanvasRenderingContext2D,spec:ShareSpec,logo?:CanvasImageSource|null):void{
  const w=SHARE_WIDTH,h=SHARE_HEIGHT;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#f8e9e5';
  ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#fff9ec';
  ctx.fillRect(48,48,w-96,h-96);
  ctx.strokeStyle='#9c6b7c';
  ctx.lineWidth=4;
  ctx.strokeRect(48,48,w-96,h-96);
  ctx.strokeStyle='#c9a46a';
  ctx.lineWidth=2;
  ctx.strokeRect(64,64,w-128,h-128);
  const corners=[[88,88],[w-88,88],[88,h-88],[w-88,h-88]] as const;
  for(const [x,y] of corners)paintScrew(ctx,x,y,18,'#eb8da5');
  ctx.fillStyle='#503b36';
  ctx.textAlign='center';
  ctx.font='700 28px "Trebuchet MS","Microsoft YaHei UI","PingFang SC",sans-serif';
  ctx.fillText(spec.gameTitle,w/2,150);
  if(logo){
    try{ctx.drawImage(logo,w/2-120,170,240,110);}catch{/* 标志缺失时仍画出文字卡 */}
  }
  ctx.font='800 44px "Trebuchet MS","Microsoft YaHei UI","PingFang SC",sans-serif';
  ctx.fillText(spec.levelLabel,w/2,logo?330:250,760);
  ctx.font='600 26px "Trebuchet MS","Microsoft YaHei UI","PingFang SC",sans-serif';
  ctx.fillStyle='#785952';
  ctx.fillText(spec.headline,w/2,logo?380:300,760);
  if(spec.dailyDate){
    ctx.font='600 22px "Trebuchet MS","Microsoft YaHei UI","PingFang SC",sans-serif';
    ctx.fillText(spec.dailyDate+' UTC',w/2,logo?414:334);
  }
  const stampY=logo?470:390;
  ctx.fillStyle=spec.rank==='clean'?'#fff4d6':spec.rank==='independent'?'#f3ece8':'#ffe5ed';
  const boxW=520,boxH=88,boxX=(w-boxW)/2;
  ctx.beginPath();
  if(typeof ctx.roundRect==='function')ctx.roundRect(boxX,stampY,boxW,boxH,14);
  else ctx.rect(boxX,stampY,boxW,boxH);
  ctx.fill();
  ctx.strokeStyle='#70424f';
  ctx.lineWidth=3;
  ctx.setLineDash(spec.rank==='complete'?[8,6]:[]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='#503b36';
  ctx.font='800 36px "Trebuchet MS","Microsoft YaHei UI","PingFang SC",sans-serif';
  ctx.fillText(spec.rankLabel,w/2,stampY+58);
  ctx.textAlign='left';
  ctx.font='700 32px "Trebuchet MS","Microsoft YaHei UI","PingFang SC",sans-serif';
  const statsY=stampY+160;
  ctx.fillText(`${spec.moves} 步`,160,statsY);
  ctx.fillText(spec.seconds>=60?`${Math.floor(spec.seconds/60)} 分 ${spec.seconds%60} 秒`:`${spec.seconds} 秒`,160,statsY+58);
  ctx.fillText('暂存',160,statsY+130);
  const slotX=300,slotY=statsY+112,slot=28,gap=10;
  for(let i=0;i<spec.capacity;i++){
    const x=slotX+i*(slot+gap);
    ctx.fillStyle=i<spec.peakBuffer?'#eb8da5':'#fff9ec';
    ctx.strokeStyle='#9c6b7c';
    ctx.lineWidth=2;
    ctx.beginPath();
    if(typeof ctx.roundRect==='function')ctx.roundRect(x,slotY,slot,slot,6);
    else ctx.rect(x,slotY,slot,slot);
    ctx.fill();ctx.stroke();
  }
  if(spec.stampNames.length){
    ctx.font='700 24px "Trebuchet MS","Microsoft YaHei UI","PingFang SC",sans-serif';
    ctx.fillStyle='#70424f';
    let x=160,y=statsY+210;
    for(const name of spec.stampNames){
      const width=ctx.measureText(name).width+28;
      ctx.strokeStyle='#c9a46a';
      ctx.lineWidth=2;
      ctx.strokeRect(x,y-28,width,40);
      ctx.fillText(name,x+14,y);
      x+=width+12;
    }
  }
  ctx.textAlign='center';
  ctx.fillStyle='#503b36';
  ctx.font='700 26px "Trebuchet MS","Consolas","Courier New",monospace';
  ctx.fillText(spec.code,w/2,h-210,760);
  ctx.font='600 22px "Trebuchet MS","Microsoft YaHei UI","PingFang SC",sans-serif';
  ctx.fillStyle='#785952';
  ctx.fillText(spec.site,w/2,h-150);
}

export function createShareCanvas(spec:ShareSpec,logo?:CanvasImageSource|null):HTMLCanvasElement{
  const canvas=document.createElement('canvas');
  canvas.width=SHARE_WIDTH;canvas.height=SHARE_HEIGHT;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('无法绘制成绩卡');
  drawShareCard(ctx,spec,logo);
  return canvas;
}

export async function shareOrDownloadCard(canvas:HTMLCanvasElement,filename='doro-screw.png'):Promise<'shared'|'downloaded'> {
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(Error('成绩卡没有生成')),'image/png'));
  const file=new File([blob],filename,{type:'image/png'});
  const payload={files:[file],title:'DORO · 打个螺丝'};
  try{
    const nav=navigator as Navigator&{canShare?:(data:ShareData)=>boolean};
    if(typeof nav.share==='function'&&(!nav.canShare||nav.canShare(payload))){
      await nav.share(payload);
      return'shared';
    }
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')return'shared';
  }
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
  return'downloaded';
}
