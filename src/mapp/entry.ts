import {getSDK} from '@discourse-mini-app/sdk';
import './shell.css';
import {launchMiniApp} from './launch';

void launchMiniApp(getSDK()).catch(error=>{
  const app=document.querySelector('#app')||document.body;
  const message=error instanceof Error?error.message:String(error);
  app.textContent='微应用未能启动：'+message;
  try{void getSDK().lifecycle.ready();}catch{ /* 宿主可能已经收到过。 */ }
});
