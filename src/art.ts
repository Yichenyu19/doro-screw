import runtime from './runtime-art.json';
import originalPaths from './asset-paths.json';
export const ART=runtime;
export type ArtKind=keyof typeof runtime.sheets;
let assetResolver:((path:string)=>string|null)|null=null;
/** 微应用启动时注入 Blob URL；网站版保持原路径。 */
export function setAssetResolver(resolver:((path:string)=>string|null)|null):void{assetResolver=resolver;}
export function resolvedAssetPath(file:string,variant?:'thumb'|'hd'):string{
  if(file.startsWith('runtime/'))return file;
  const key=variant?`${file}:${variant}`:file;
  const optimized=(runtime.raw as Record<string,string>)[key];
  return optimized??`assets/${(originalPaths as Record<string,string>)[file]??file}`;
}
export function assetUrl(file:string,variant?:'thumb'|'hd'):string{
  const path=resolvedAssetPath(file,variant);
  if(assetResolver)return assetResolver(path)??'';
  if(file.startsWith('runtime/'))return `${import.meta.env?.BASE_URL??'/'}${file}`;
  const key=variant?`${file}:${variant}`:file;
  const optimized=(runtime.raw as Record<string,string>)[key];
  return optimized?`${import.meta.env?.BASE_URL??'/'}${optimized}`:`${import.meta.env?.BASE_URL??'/'}assets/${(originalPaths as Record<string,string>)[file]??file}`;
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
  return `<span class="art art-${kind} ${escape(className)}" data-art-bg="${escape(assetUrl(file))}" data-art-ratio="${frame.width}/${frame.height}" ${label?`role="img" aria-label="${escape(label)}"`:'aria-hidden="true"'}></span>`;
}
