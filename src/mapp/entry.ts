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
  if(!node)return;
  const message=error instanceof Error?error.message:String(error);
  node.textContent='微应用未能启动：'+message;
}

async function boot():Promise<void>{
  const sdk=getSDK();
  await sdk.ready;
  paintLoading();
  try{await sdk.lifecycle.ready();}catch{ /* 宿主已经收到，或这次通知超时。 */ }
  await launchMiniApp(sdk,bootGame,{skipHostReady:true});
}

globalThis.DoroGame=Object.freeze({boot});

// 只有真正的 script 标签执行时才启动。new Function 执行时 currentScript 为空，加载本身不进游戏。
if(document.currentScript)void boot().catch(fail);
