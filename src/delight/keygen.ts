import {fill} from '../markup';
/** 「免费辅助」的破解版身份：注册机小铭牌 + 打补丁动效。纯装饰，不改任何规则。 */
export const SERIAL_FINAL='D0R0-FREE-NOAD-0000';
const GLYPHS='0123456789ABCDEFX#$%&@';

/** 确定性伪随机，测试可复现。 */
export function scrambleFrames(final=SERIAL_FINAL,frames=10,seed=7):string[]{
  let state=seed>>>0||1;const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return((state>>>0)%10007)/10007;};
  const out:string[]=[];
  for(let f=0;f<frames;f++){
    const locked=Math.floor(final.length*(f+1)/frames);
    out.push([...final].map((char,i)=>char==='-'||i<locked?char:GLYPHS[Math.floor(rand()*GLYPHS.length)]).join(''));
  }
  out[out.length-1]=final;
  return out;
}

export function keygenPlate(wall:boolean):string{
  return `<div class="dl-keygen${wall?' dl-keygen-wall':''}" aria-hidden="true"><span class="dl-keygen-disk"><i></i></span><span class="dl-keygen-body"><b class="dl-keygen-serial">${SERIAL_FINAL.replace(/[A-Z0-9]/g,'·')}</b><span class="dl-keygen-bar"><i></i></span></span></div>`;
}

/** 在弹窗里把序列号滚出来；返回取消函数。 */
export function runKeygen(root:ParentNode,tick:()=>void,reduced:boolean):()=>void{
  const serial=root.querySelector<HTMLElement>('.dl-keygen-serial');if(!serial)return()=>{};
  if(reduced){serial.textContent=SERIAL_FINAL;serial.closest('.dl-keygen')?.classList.add('done');return()=>{};}
  const frames=scrambleFrames(SERIAL_FINAL,12,Date.now()%997+1);let index=0;
  const timer=window.setInterval(()=>{
    serial.textContent=frames[index];if(index%3===0)tick();
    if(++index>=frames.length){window.clearInterval(timer);serial.closest('.dl-keygen')?.classList.add('done');}
  },55);
  return()=>window.clearInterval(timer);
}

/** 使用辅助后：暂存条上跑一道像素补丁进度，结束后自己消失。 */
export function patchSweep(host:HTMLElement|null,reduced:boolean,onDone:()=>void):void{
  if(!host){onDone();return;}
  host.querySelector('.dl-patch')?.remove();
  const bar=document.createElement('div');bar.className='dl-patch';bar.setAttribute('aria-hidden','true');
  fill(bar,'<span class="dl-patch-cells">'+'<i></i>'.repeat(8)+'</span>');
  host.appendChild(bar);
  if(reduced){bar.classList.add('dl-patch-static');window.setTimeout(()=>{bar.remove();onDone();},500);return;}
  const cells=[...bar.querySelectorAll('i')];
  cells.forEach((cell,i)=>window.setTimeout(()=>cell.classList.add('on'),60+i*70));
  window.setTimeout(()=>{bar.classList.add('dl-patch-done');onDone();},60+cells.length*70+60);
  window.setTimeout(()=>bar.remove(),60+cells.length*70+620);
}
