import type {MiniAppSDK,MiniAppTheme} from '@discourse-mini-app/sdk';
import {setAssetResolver} from '../art';

const ASSET_LIST_URL = 'asset-list.json';
const ASSET_WORKERS = 6;
const HOME_FIRST = /(?:^|\/)(?:backdrop|logo|doro-hero|doro-|button-|ui-|panel-v2|panel-|starter-sticker)/;

function mimeFor(path:string):string{
  if(path.endsWith('.webp'))return 'image/webp';
  if(path.endsWith('.png'))return 'image/png';
  if(path.endsWith('.jpg')||path.endsWith('.jpeg'))return 'image/jpeg';
  if(path.endsWith('.ogg'))return 'audio/ogg';
  if(path.endsWith('.mp3'))return 'audio/mpeg';
  if(path.endsWith('.json'))return 'application/json';
  if(path.endsWith('.txt')||path.endsWith('.md'))return 'text/plain';
  return 'application/octet-stream';
}

export function prioritizeStartup(paths:string[]):string[]{
  const home:string[]=[];
  const rest:string[]=[];
  for(const path of paths){
    if(path.endsWith('.json')&&path.startsWith('campaign/'))continue;
    (HOME_FIRST.test(path)?home:rest).push(path);
  }
  return [...home,...rest];
}

function paintShell():void{
  document.documentElement.classList.add('mapp-shell');
  document.body.classList.add('mapp-shell');
  const app=document.querySelector('#app');
  if(!app)return;
  app.innerHTML='<p class="mapp-loading" role="status">正在打开…</p>';
}

function showFailure(error:unknown):void{
  const app=document.querySelector('#app')||document.body;
  const message=error instanceof Error?error.message:String(error);
  app.textContent='微应用未能启动：'+message;
}

async function installAssets(sdk:MiniAppSDK,paths:string[]):Promise<{urls:Map<string,string>;revoke:()=>void}>{
  const urls=new Map<string,string>();
  const failed:string[]=[];
  const queue=prioritizeStartup(paths);
  let cursor=0;
  const worker=async()=>{
    while(cursor<queue.length){
      const path=queue[cursor++];
      try{
        const bytes=await sdk.assets.readBytes(path);
        urls.set(path,URL.createObjectURL(new Blob([bytes],{type:mimeFor(path)})));
      }catch{
        failed.push(path);
      }
    }
  };
  const workers=Math.min(ASSET_WORKERS,queue.length);
  await Promise.all(Array.from({length:workers},()=>worker()));
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
    }catch{ /* 读不到存档也继续。 */ }
  }
  const storage=new MappStorage(sdk,entries);
  try{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});}catch{ /* 替换失败时仍用平台存档。 */ }
  try{Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined});}catch{ /* 关不掉也不要中断启动。 */ }
}

function applyTheme(theme:MiniAppTheme):void{
  const root=document.documentElement;
  root.classList.toggle('reduced-motion',theme.reducedMotion);
  root.classList.toggle('mapp-dark',theme.mode==='dark');
  root.style.setProperty('--mapp-bg',theme.background);
  root.style.setProperty('--mapp-text',theme.text);
  document.body.style.background=theme.background;
}

async function defaultBoot():Promise<void>{
  const {bootGame}=await import('../main');
  await bootGame();
}

/** 先画出加载壳并通知宿主，再读素材、再进游戏。 */
export async function launchMiniApp(sdk:MiniAppSDK,boot:()=>Promise<void>=defaultBoot):Promise<void>{
  await sdk.ready;
  let toldHost=false;
  const tellHost=async()=>{
    if(toldHost)return;
    toldHost=true;
    try{await sdk.lifecycle.ready();}catch{ /* 宿主已超时或已收到。 */ }
  };
  try{
    paintShell();
    await tellHost();
    try{await installStorage(sdk);}catch{ /* 存档层失败不中断。 */ }
    let unsubscribe:(()=>void)|undefined;
    try{
      if(sdk.permissions.has('theme.read')){
        unsubscribe=sdk.theme.onChange(applyTheme);
        applyTheme(await sdk.theme.get());
      }
    }catch{ /* 主题失败不阻断。 */ }
    let paths:string[]=[];
    try{paths=await sdk.assets.readJson(ASSET_LIST_URL) as string[];}catch{ /* 清单失败时仍尝试进游戏。 */ }
    const installed=await installAssets(sdk,Array.isArray(paths)?paths:[]);
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
      await boot();
    }catch(error){
      showFailure(error);
    }
    window.addEventListener('pagehide',()=>{unsubscribe?.();installed.revoke();window.__DORO_MAPP__?.releaseAsset?.();},{once:true});
  }catch(error){
    showFailure(error);
    await tellHost();
  }
}
