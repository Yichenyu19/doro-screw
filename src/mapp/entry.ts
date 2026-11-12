import {getSDK} from '@discourse-mini-app/sdk';
import type {MiniAppSDK,MiniAppTheme} from '@discourse-mini-app/sdk';
import './shell.css';
import {setAssetResolver} from '../art';

const ASSET_LIST_URL = 'asset-list.json';

function mimeFor(path:string):string{
  if(path.endsWith('.webp'))return 'image/webp';
  if(path.endsWith('.png'))return 'image/png';
  if(path.endsWith('.jpg')||path.endsWith('.jpeg'))return 'image/jpeg';
  if(path.endsWith('.json'))return 'application/json';
  if(path.endsWith('.txt')||path.endsWith('.md'))return 'text/plain';
  return 'application/octet-stream';
}

async function installAssets(sdk:MiniAppSDK,paths:string[]):Promise<{urls:Map<string,string>;revoke:()=>void}>{
  const urls=new Map<string,string>();
  const failed:string[]=[];
  for(const path of paths){
    if(path.endsWith('.json')&&path.startsWith('campaign/'))continue;
    try{
      const bytes=await sdk.assets.readBytes(path);
      const url=URL.createObjectURL(new Blob([bytes],{type:mimeFor(path)}));
      urls.set(path,url);
    }catch{
      failed.push(path);
    }
  }
  if(failed.length)console.warn('部分素材未能读取',failed.length);
  return {urls,revoke(){for(const url of urls.values())URL.revokeObjectURL(url);setAssetResolver(null);}};
}

class MappStorage implements Storage {
  private memory=new Map<string,string>();
  private writes:Promise<unknown>=Promise.resolve();
  constructor(private sdk:MiniAppSDK,entries:Array<[string,string]>){
    for(const [key,value] of entries)this.memory.set(key,value);
  }
  get length(){return this.memory.size;}
  key(index:number){return [...this.memory.keys()][index]??null;}
  getItem(key:string){return this.memory.has(String(key))?this.memory.get(String(key))!:null;}
  setItem(key:string,value:string){
    const k=String(key),v=String(value);
    this.memory.set(k,v);
    if(!this.sdk.permissions.has('storage.write'))return;
    this.writes=this.writes.then(()=>this.sdk.localStorage.setItem(k,v)).catch(()=>{});
  }
  removeItem(key:string){
    const k=String(key);
    this.memory.delete(k);
    if(!this.sdk.permissions.has('storage.write'))return;
    this.writes=this.writes.then(()=>this.sdk.localStorage.removeItem(k)).catch(()=>{});
  }
  clear(){
    this.memory.clear();
    if(!this.sdk.permissions.has('storage.write'))return;
    this.writes=this.writes.then(()=>this.sdk.localStorage.clear()).catch(()=>{});
  }
}

async function installStorage(sdk:MiniAppSDK):Promise<void>{
  let entries:Array<[string,string]>=[];
  if(sdk.permissions.has('storage.read')){
    try{
      const snapshot=await sdk.localStorage.exportData();
      if(snapshot?.format===1&&Array.isArray(snapshot.entries))entries=snapshot.entries.map(([k,v])=>[String(k),String(v)]);
    }catch{ /* 存储失败仍可开局。 */ }
  }
  const storage=new MappStorage(sdk,entries);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  // 官方存档按应用隔离，由 sdk.localStorage 代管；不使用可能越出隔离范围的原生 IndexedDB。
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined});
}

function applyTheme(theme:MiniAppTheme):void{
  const root=document.documentElement;
  root.classList.toggle('reduced-motion',theme.reducedMotion);
  root.classList.toggle('mapp-dark',theme.mode==='dark');
  root.style.setProperty('--mapp-bg',theme.background);
  root.style.setProperty('--mapp-text',theme.text);
  document.body.style.background=theme.background;
  if(theme.reducedMotion){
    try{
      const raw=localStorage.getItem('doro-screw-reborn:v4:r2');
      // 不在这里改存档；只把系统减少动效偏好写到文档类，游戏设置页仍可单独开关。
    }catch{ /* ignore */ }
  }
}

async function main():Promise<void>{
  document.documentElement.classList.add('mapp-shell');
  document.body.classList.add('mapp-shell');
  const sdk=getSDK();
  await sdk.ready;
  await installStorage(sdk);
  let unsubscribe:(()=>void)|undefined;
  try{
    if(sdk.permissions.has('theme.read')){
      unsubscribe=sdk.theme.onChange(applyTheme);
      const theme=await sdk.theme.get();
      applyTheme(theme);
    }
  }catch{ /* 主题失败不阻断。 */ }
  let paths:string[]=[];
  try{
    paths=await sdk.assets.readJson(ASSET_LIST_URL) as string[];
  }catch{
    // asset-list 本身也在 assets 中；失败时仍尝试启动，界面会提示缺图。
  }
  const installed=await installAssets(sdk,Array.isArray(paths)?paths:[]);
  const revoke=installed.revoke.bind(installed);
  const extra=new Map<string,string>();
  const lookup=(path:string)=>extra.get(path)??installed.urls.get(path)??null;
  setAssetResolver(lookup);
  const releaseAsset=(path?:string)=>{
    const drop=(key:string)=>{const url=extra.get(key);if(!url)return;URL.revokeObjectURL(url);extra.delete(key);};
    if(path){drop(path);return;}
    for(const key of [...extra.keys()])drop(key);
  };
  const loadAsset=async(path:string)=>{
    const hit=lookup(path);
    if(hit)return hit;
    const bytes=await sdk.assets.readBytes(path);
    const url=URL.createObjectURL(new Blob([bytes],{type:mimeFor(path)}));
    extra.set(path,url);
    return url;
  };
  window.__DORO_MAPP__={
    loadAsset,
    releaseAsset,
    ...(sdk.permissions.has('files.save')?{saveFile:async(name:string,data:string)=>{await sdk.files.save(name,data);}}:{}),
  };
  try{
    const {bootGame}=await import('../main');
    await bootGame();
  }finally{
    try{await sdk.lifecycle.ready();}catch{ /* 通知宿主已完成首次绘制。 */ }
  }
  window.addEventListener('pagehide',()=>{unsubscribe?.();revoke();window.__DORO_MAPP__?.releaseAsset?.();},{once:true});
}

void main().catch(error=>{
  const app=document.querySelector('#app')||document.body;
  const message=error instanceof Error?error.message:String(error);
  app.textContent='微应用未能启动：'+message;
  try{void getSDK().lifecycle.ready();}catch{ /* ignore */ }
});
