import {getSDK} from '@discourse-mini-app/sdk';
import './shell.css';
import {launchMiniApp} from './launch';

window.__DORO_GAME_CHUNK__=true;
void launchMiniApp(getSDK(),undefined,{skipHostReady:true}).catch(error=>{
  const app=document.querySelector('#app')||document.body;
  const message=error instanceof Error?error.message:String(error);
  app.textContent='微应用未能启动：'+message;
});
