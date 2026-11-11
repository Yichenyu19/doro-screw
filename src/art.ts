import runtime from './runtime-art.json';
import originalPaths from './asset-paths.json';
export const ART=runtime;
export type ArtKind=keyof typeof runtime.sheets;
export function assetUrl(file:string,variant?:'thumb'|'hd'):string{
  if(file.startsWith('runtime/'))return `${import.meta.env.BASE_URL}${file}`;
  const key=variant?`${file}:${variant}`:file;
  const optimized=(runtime.raw as Record<string,string>)[key];
  return optimized?`${import.meta.env.BASE_URL}${optimized}`:`${import.meta.env.BASE_URL}assets/${(originalPaths as Record<string,string>)[file]??file}`;
}
export const PANEL_SLICE=runtime.panelSlice;
const warmed=new Map<string,HTMLImageElement>();
export function preloadFrames(kind:ArtKind,indices:number[]):void{
  for(const index of indices){const file=runtime.sheets[kind].sprites[index]?.file;if(!file||warmed.has(file))continue;const image=new Image();warmed.set(file,image);image.src=assetUrl(file);}
}
function escape(value:string):string{return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function sprite(kind:ArtKind,index:number,className='',label=''):string{
  const sheet=runtime.sheets[kind],frame=sheet.sprites[index]??sheet.sprites[0];
  const file=kind==='doro'&&index===1&&className.includes('home-doro')?runtime.hero.doro:frame.file;
  const style=`display:inline-block;background-image:url('${assetUrl(file)}');background-size:100% 100%;background-repeat:no-repeat;aspect-ratio:${frame.width}/${frame.height}`;
  return `<span class="art art-${kind} ${escape(className)}" style="${style}" ${label?`role="img" aria-label="${escape(label)}"`:'aria-hidden="true"'}></span>`;
}
