import {sprite} from '../art';
import {appendMarkup} from '../markup';
import {tallyGroups} from './store';

/** 第二关破墙仪式。只在主线第二关清盘的那一刻演一次，点一下即可跳过。 */
export interface WallBreakInput{bumps:number;assisted:boolean;total:number;seconds:number;origin?:{x:number;y:number}|null}
export const WALL_BEATS=[
  {id:'crack',at:0},{id:'shatter',at:380},{id:'burst',at:760},{id:'stamp',at:1180},{id:'strike',at:1560},{id:'done',at:4300},
] as const;
export type WallBeat=typeof WALL_BEATS[number]['id'];

const rng=(seed:number)=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
/** 从破口向四周放射的裂纹折线（百分比坐标）。 */
export function crackPaths(ox:number,oy:number,seed=11,rays=9):string[]{
  const rand=rng(seed),paths:string[]=[];
  for(let i=0;i<rays;i++){
    const angle=i/rays*Math.PI*2+rand()*.5;let x=ox,y=oy,d=`M${x.toFixed(1)} ${y.toFixed(1)}`;
    const steps=4+Math.floor(rand()*3);
    for(let s=0;s<steps;s++){const len=9+rand()*13,a=angle+(rand()-.5)*.7;x+=Math.cos(a)*len;y+=Math.sin(a)*len*1.25;d+=` L${x.toFixed(1)} ${y.toFixed(1)}`;}
    paths.push(d);
  }
  return paths;
}

export function tallyHtml(n:number):string{
  if(n<=0)return'<span class="dl-tally dl-tally-zero" aria-label="一次没撞墙"><i class="dl-zero"></i></span>';
  const {groups,overflow}=tallyGroups(n);
  return `<span class="dl-tally" aria-label="撞墙 ${n} 次">${groups.map(g=>`<span class="dl-tally-group g${g}">${'<i></i>'.repeat(Math.min(4,g))}${g===5?'<i class="slash"></i>':''}</span>`).join('')}${overflow?`<b>+${overflow}</b>`:''}<span class="dl-tally-strike"></span></span>`;
}

export function wallBreakHtml(input:WallBreakInput):string{
  const ox=input.origin?.x??50,oy=input.origin?.y??46;
  const shards=Array.from({length:10},(_,i)=>{const a=i/10*Math.PI*2+.3,r=36+(i%3)*14;return `<span class="dl-shard" data-css="--sx:${(Math.cos(a)*r).toFixed(1)}vw;--sy:${(Math.sin(a)*r*.9).toFixed(1)}vh;--sr:${(i%2?1:-1)*(120+i*37)}deg;--sd:${i*18}ms;left:${ox}%;top:${oy}%">${sprite('fx',4)}</span>`;}).join('');
  return `<div class="dl-wall" data-beat="crack" role="img" aria-label="第二关破墙">
    <svg class="dl-cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${crackPaths(ox,oy).map((d,i)=>`<path class="ink" d="${d}" data-css="--d:${i*22}ms"/><path class="glint" d="${d}" data-css="--d:${i*22}ms"/>`).join('')}</svg>
    <div class="dl-shards" aria-hidden="true">${shards}</div>
    <div class="dl-hole" data-css="left:${ox}%;top:${oy}%" aria-hidden="true">${sprite('fx',5,'dl-burst')}${sprite('doro',5,'dl-doro')}</div>
    <div class="dl-seal-wrap">
      <svg width="0" height="0" class="dl-svgdefs" aria-hidden="true"><filter id="dl-ink"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="3.2"/></filter></svg>
      ${sprite('doro',5,'dl-perch')}
      <div class="dl-seal"><span>破</span><span>墙</span></div>
      <div class="dl-seal-side ${input.assisted?'with-help':'bare'}">${input.assisted?'带挂':'徒手'}</div>
      <div class="dl-seal-meta"><b>${input.total}</b><small>/ ${input.total}</small>${tallyHtml(input.bumps)}</div>
    </div>
  </div>`;
}

/** 挂到游戏屏上，按拍推进；返回在结束或被点掉时兑现的 Promise。 */
export function playWallBreak(host:HTMLElement,input:WallBreakInput,opts:{reduced:boolean;onBeat?:(beat:WallBeat)=>void}):{done:Promise<void>;skip:()=>void}{
  host.querySelector('.dl-wall')?.remove();
  host.classList.add('dl-ceremony');
  appendMarkup(host,wallBreakHtml(input));
  const node=host.querySelector<HTMLElement>('.dl-wall')!;
  const timers:number[]=[];let finish:()=>void=()=>{};
  const done=new Promise<void>(resolve=>{finish=resolve;});
  let over=false;
  const end=()=>{if(over)return;over=true;host.classList.remove('dl-ceremony');timers.forEach(t=>window.clearTimeout(t));node.classList.add('dl-leaving');window.setTimeout(()=>node.remove(),220);finish();};
  const beat=(id:WallBeat)=>{if(over)return;node.dataset.beat=id;node.classList.add('beat-'+id);opts.onBeat?.(id);if(id==='done')end();};
  if(opts.reduced){
    for(const id of ['crack','shatter','burst','stamp','strike'] as WallBeat[])node.classList.add('beat-'+id);
    node.dataset.beat='strike';node.classList.add('dl-static');opts.onBeat?.('stamp');
    timers.push(window.setTimeout(()=>beat('done'),2600));
  }else for(const b of WALL_BEATS)timers.push(window.setTimeout(()=>beat(b.id),b.at));
  // 至少看清印章后才接受点击跳过，防止最后一下拆钉的连点误触。
  const armed=performance.now()+600;
  node.addEventListener('pointerdown',event=>{event.stopPropagation();if(performance.now()>=armed)end();});
  return{done,skip:end};
}
