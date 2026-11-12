import {getSDK} from '@discourse-mini-app/sdk';
import './shell.css';
import {launchMiniApp} from './launch';
import {bootGame} from '../main';

async function boot():Promise<void>{
  globalThis.__DORO_GAME_CHUNK__=true;
  await launchMiniApp(getSDK(),bootGame,{skipHostReady:true});
}

globalThis.DoroGame=Object.freeze({boot});
