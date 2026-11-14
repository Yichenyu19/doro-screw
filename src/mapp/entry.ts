import {getSDK} from '@discourse-mini-app/sdk';
import './shell.css';
import {launchMiniApp} from './launch';
import {bootGame} from '../main';

function paintLoading():void{
  document.documentElement.classList.add('mapp-shell');
  document.body?.classList.add('mapp-shell');
  const node=document.querySelector('#app');
  if(!node)return;
  const note=document.createElement('p');
  note.className='mapp-loading';
  note.setAttribute('role','status');
  note.textContent='正在打开…';
  if(typeof node.replaceChildren==='function')node.replaceChildren(note);
  else node.textContent=note.textContent;
}

function fail(error:unknown):void{
  const node=document.querySelector('#app')||document.body;
  if(node){
    const message=error instanceof Error?error.message:String(error);
    node.textContent='微应用未能启动：'+message;
  }
  try{void getSDK().lifecycle.ready();}catch{ /* 没有 SDK 时宿主只能看到自己的失败页。 */ }
}

async function start():Promise<void>{
  const sdk=getSDK();
  await sdk.ready;
  try{paintLoading();}catch{ /* 画不出来也要先通知宿主。 */ }
  try{await sdk.lifecycle.ready();}catch{ /* 宿主已经收到，或这次通知超时。 */ }
  await launchMiniApp(sdk,bootGame,{skipHostReady:true});
}

function boot():Promise<void>{
  const slot=globalThis as typeof globalThis&{__DORO_BOOT__?:Promise<void>};
  if(slot.__DORO_BOOT__)return slot.__DORO_BOOT__;
  const pending=start();
  slot.__DORO_BOOT__=pending;
  return pending;
}

globalThis.DoroGame=Object.freeze({boot});
void boot().catch(fail);
