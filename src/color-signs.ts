import {COLORS,type ColorId} from './types';

/** 每种盒色/钉色除颜色外还有固定小记号，色盲或关「颜色辅助」时也能分辨。 */
export const COLOR_SIGNS={
  rose:'dot',orange:'bar',yellow:'plus',green:'tri',cyan:'dia',
  blue:'ring',purple:'slash',brown:'sq',red:'cross',gray:'wave',
} as const satisfies Record<ColorId,string>;
export type ColorSign=typeof COLOR_SIGNS[ColorId];

export function colorSignClass(color:ColorId):string{
  return `color-sign color-sign-${COLOR_SIGNS[color]}`;
}

export function colorSignHtml(color:ColorId):string{
  return `<span class="${colorSignClass(color)}" aria-hidden="true"></span>`;
}

export function drawColorSign(context:CanvasRenderingContext2D,color:ColorId,cx=32,cy=32,size=22):void{
  const s=COLOR_SIGNS[color];
  context.save();
  context.translate(cx,cy);
  context.strokeStyle='#281e25';
  context.fillStyle='#281e25';
  context.lineWidth=Math.max(2,size*0.18);
  context.lineCap='round';
  context.lineJoin='round';
  const r=size/2;
  if(s==='dot'){context.beginPath();context.arc(0,0,r*0.42,0,Math.PI*2);context.fill();}
  else if(s==='bar'){context.fillRect(-r*0.72,-r*0.22,r*1.44,r*0.44);}
  else if(s==='plus'){context.beginPath();context.moveTo(-r*0.7,0);context.lineTo(r*0.7,0);context.moveTo(0,-r*0.7);context.lineTo(0,r*0.7);context.stroke();}
  else if(s==='tri'){context.beginPath();context.moveTo(0,-r*0.78);context.lineTo(r*0.72,r*0.52);context.lineTo(-r*0.72,r*0.52);context.closePath();context.fill();}
  else if(s==='dia'){context.beginPath();context.moveTo(0,-r*0.78);context.lineTo(r*0.7,0);context.lineTo(0,r*0.78);context.lineTo(-r*0.7,0);context.closePath();context.fill();}
  else if(s==='ring'){context.beginPath();context.arc(0,0,r*0.58,0,Math.PI*2);context.stroke();}
  else if(s==='slash'){context.beginPath();context.moveTo(-r*0.62,r*0.62);context.lineTo(r*0.62,-r*0.62);context.stroke();}
  else if(s==='sq'){context.fillRect(-r*0.52,-r*0.52,r*1.04,r*1.04);}
  else if(s==='cross'){context.beginPath();context.moveTo(-r*0.62,-r*0.62);context.lineTo(r*0.62,r*0.62);context.moveTo(r*0.62,-r*0.62);context.lineTo(-r*0.62,r*0.62);context.stroke();}
  else {context.beginPath();context.moveTo(-r*0.78,r*0.12);context.quadraticCurveTo(-r*0.4,-r*0.7,0,0);context.quadraticCurveTo(r*0.4,r*0.7,r*0.78,-r*0.12);context.stroke();}
  context.restore();
}

export function allColorSigns():Array<{color:ColorId;sign:ColorSign}>{
  return COLORS.map(color=>({color,sign:COLOR_SIGNS[color]}));
}
