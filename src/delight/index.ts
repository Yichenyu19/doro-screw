import './delight.css';
import {sprite} from '../art';
import type {GameAudio} from '../audio';
import {assistCount} from '../run';
import type {GameEvent,GameState,LevelDef,Vec2} from '../types';
import {DELIGHT_SOUNDS,type DelightSound} from './sounds';
import {loadLedger,saveLedger,noteWallBump,noteWallBroken,type DelightLedger} from './store';
import {keygenPlate,runKeygen,patchSweep} from './keygen';
import {idleActFor,idleDueAt,nextStreak,registerTap,freshPoke,type IdleAct,type PokeState,type StreakCue} from './doro-life';
import {playWallBreak,tallyHtml,type WallBeat} from './wall-break';

export interface DelightHost{
  audio:GameAudio;
  reduced:()=>boolean;
  /** 现在能否演空闲小动作：在局内、正在玩、没有弹窗、没在长按检查。 */
  canIdle:()=>boolean;
  react:(index:number)=>void;
}
const isWall=(level:LevelDef|null|undefined)=>!!level&&(level.mode??'campaign')==='campaign'&&level.contentVersion==='v4'&&(level.contentRevision??1)>=2&&level.id===2;
const doroFrame=(index:number)=>sprite('doro',index,'doro-art');

export function createDelight(host:DelightHost){
  let ledger:DelightLedger=loadLedger();
  let streak=0,lastInput=performance.now(),idleIndex=0,idleAct:IdleAct|null=null,idleTimers:number[]=[];
  let patchedThisRun=false,lastPickPoint:Vec2|null=null,stopKeygen:()=>void=()=>{};
  let poke:PokeState=freshPoke(),pressTimer=0,popTimer=0,pressing=false,inflated=false;
  const log:string[]=[];
  const sound=(name:DelightSound,gain=1,bus:'ui'|'reward'|'impact'='ui')=>host.audio.cue(DELIGHT_SOUNDS[name],{bus,gain});
  const persist=()=>saveLedger(ledger);
  const reactionNode=()=>document.querySelector<HTMLElement>('#doro-reaction');

  // ———— 空闲生活 ————
  function clearIdle(wake:boolean):void{
    idleTimers.forEach(t=>window.clearTimeout(t));idleTimers=[];
    const node=reactionNode();
    const wasDozing=idleAct==='doze';
    if(node){node.classList.remove('dl-peek','dl-sneak','dl-doze','dl-sneak-lean','dl-sneak-bitten','dl-sneak-away');node.querySelector('.dl-z')?.remove();}
    document.querySelectorAll('.dl-bite,.dl-bite-warn').forEach(node=>node.classList.remove('dl-bite','dl-bite-warn'));
    if(idleAct){idleAct=null;if(node)node.innerHTML=doroFrame(wake&&wasDozing?3:0);if(wake&&wasDozing&&node){node.classList.add('dl-wake');idleTimers.push(window.setTimeout(()=>{node.classList.remove('dl-wake');node.innerHTML=doroFrame(0);},420));}}
  }
  function perform(act:IdleAct):void{
    const node=reactionNode();if(!node||host.reduced())return;
    idleAct=act;log.push('idle:'+act);
    const later=(ms:number,fn:()=>void)=>idleTimers.push(window.setTimeout(()=>{if(idleAct===act)fn();},ms));
    if(act==='peek'){
      node.innerHTML=doroFrame(0);node.classList.add('dl-peek');
      later(1800,()=>{node.classList.remove('dl-peek');idleAct=null;});
    }else if(act==='sneak'){
      // 想要：从口袋里顺点东西。以为：口袋不会管。落空：口袋先抖一下警告，它更贪，再伸手被「咬」。余波：扭头装没事。
      // 对手就是紧挨着它的「口袋」按钮：想从口袋里摸点什么，口袋先抖一下，再「咬」回去。
      const target=document.querySelector<HTMLElement>('#pocket-count');
      if(!target){idleAct=null;return;}
      node.innerHTML=doroFrame(1);node.classList.add('dl-sneak','dl-sneak-lean');
      later(650,()=>target.classList.add('dl-bite-warn'));
      later(1000,()=>{target.classList.remove('dl-bite-warn');node.classList.add('dl-sneak-reach');});
      later(1380,()=>{target.classList.add('dl-bite');node.classList.remove('dl-sneak-lean','dl-sneak-reach');node.classList.add('dl-sneak-bitten');node.innerHTML=doroFrame(3);});
      later(2100,()=>{target.classList.remove('dl-bite');node.classList.remove('dl-sneak-bitten');node.classList.add('dl-sneak-away');node.innerHTML=doroFrame(1);});
      later(3300,()=>{node.classList.remove('dl-sneak','dl-sneak-away');node.innerHTML=doroFrame(0);idleAct=null;});
    }else{
      node.innerHTML=doroFrame(1);node.classList.add('dl-doze');
      node.insertAdjacentHTML('beforeend','<span class="dl-z" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>');
    }
  }
  const idleClock=window.setInterval(()=>{
    if(!host.canIdle()){if(idleAct&&idleAct!=='doze')clearIdle(false);return;}
    if(idleAct||idleIndex>=3)return;
    if(performance.now()-lastInput>=idleDueAt(idleIndex)){perform(idleActFor(idleIndex,Math.random()));idleIndex++;}
  },500);

  function noteInput():void{lastInput=performance.now();idleIndex=0;if(idleAct)clearIdle(true);}

  // ———— 首页戳一戳 ————
  function attachHome(root:ParentNode):void{
    const stage=root.querySelector<HTMLElement>('.home-character');if(!stage)return;
    const doro=()=>stage.querySelector<HTMLElement>('.home-doro');
    const replayTimers=new Map<string,number>();
    const replay=(cls:string,ms:number)=>{const el=stage;window.clearTimeout(replayTimers.get(cls));el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);replayTimers.set(cls,window.setTimeout(()=>el.classList.remove(cls),ms));};
    stage.addEventListener('pointerdown',event=>{
      if(!event.isPrimary||(event.target instanceof Element&&event.target.closest('button,a')))return;
      host.audio.unlock();pressing=true;inflated=false;
      window.clearTimeout(pressTimer);window.clearTimeout(popTimer);
      pressTimer=window.setTimeout(()=>{if(!pressing)return;inflated=true;stage.classList.add('dl-inflate');sound('inflate',.9);log.push('poke:inflate');
        popTimer=window.setTimeout(()=>{if(!pressing)return;pressing=false;pop();},1100);},520);
    });
    const release=()=>{
      if(!pressing)return;pressing=false;window.clearTimeout(pressTimer);window.clearTimeout(popTimer);
      if(inflated){stage.classList.remove('dl-inflate');stage.classList.add('dl-deflate');window.setTimeout(()=>stage.classList.remove('dl-deflate'),360);log.push('poke:deflate');return;}
      ledger={...ledger,pokes:Math.min(9999,ledger.pokes+1)};persist();
      const result=registerTap(poke,performance.now(),ledger.pokes-1);poke=result.state;log.push('poke:'+result.cue);
      if(result.cue==='dodge'){replay('dl-dodge',700);sound('boing',.5);return;}
      if(result.cue==='dizzy'){replay('dl-dizzy',1700);sound('dizzy');const d=doro();if(d){stage.classList.add('dl-dizzy-face');window.setTimeout(()=>stage.classList.remove('dl-dizzy-face'),1700);}return;}
      replay('dl-squash',320);sound('boing',.8);
    };
    const pop=()=>{
      stage.classList.remove('dl-inflate');replay('dl-pop',900);sound('pop');log.push('poke:pop');
      const heart=document.createElement('span');heart.className='dl-pop-heart';heart.innerHTML=sprite('fx',2);stage.appendChild(heart);window.setTimeout(()=>heart.remove(),1200);
    };
    stage.addEventListener('pointerup',release);
    stage.addEventListener('pointercancel',()=>{pressing=false;window.clearTimeout(pressTimer);window.clearTimeout(popTimer);stage.classList.remove('dl-inflate');});
    stage.addEventListener('pointerleave',()=>{if(pressing)release();});
  }

  // ———— 局内 ————
  function onLevelStart(level:LevelDef,state:GameState):void{
    streak=0;patchedThisRun=state.stats?assistCount(state.stats)>0:false;idleIndex=0;lastInput=performance.now();clearIdle(false);
    document.querySelector('.dl-wall-tally')?.remove();
    if(isWall(level)&&ledger.wallBumps>0&&!ledger.wallBroken){
      document.querySelector('.buffer-area')?.insertAdjacentHTML('beforeend',`<span class="dl-wall-tally" aria-hidden="true">${tallyHtml(ledger.wallBumps)}</span>`);
    }
  }
  function onLeave():void{clearIdle(false);stopKeygen();}
  function notePickPoint(point:Vec2|null):void{lastPickPoint=point;}
  function onPick(state:GameState,screwId:string,events:GameEvent[]):StreakCue{
    const screw=state.screws.find(s=>s.id===screwId);
    const toBuffer=screw?.place==='buffer'||screw?.place==='pocket';
    const result=nextStreak(streak,!!toBuffer);streak=result.streak;
    if(result.cue&&!host.reduced()){
      log.push('streak:'+result.cue+':'+streak);
      const node=reactionNode();
      if(result.cue==='hop'){host.react(4);node?.classList.add('dl-hop');window.setTimeout(()=>node?.classList.remove('dl-hop'),520);}
      else{host.react(5);const heart=document.createElement('span');heart.className='dl-streak-heart'+(result.cue==='sparkle'?' sparkle':'');heart.innerHTML=sprite('fx',result.cue==='sparkle'?0:2);node?.parentElement?.appendChild(heart);window.setTimeout(()=>heart.remove(),1100);}
    }
    void events;return result.cue;
  }
  function onStuck(level:LevelDef|null):void{
    if(!isWall(level))return;
    ledger=noteWallBump(ledger);persist();log.push('wall:bump:'+ledger.wallBumps);
  }

  // ———— 免费挂（破解版） ————
  function toolsPlate(wall:boolean):string{return keygenPlate(wall);}
  function decorateTools(root:ParentNode):void{stopKeygen();stopKeygen=runKeygen(root,()=>sound('keyTick',.7),host.reduced());}
  function onAssist():void{
    const first=!patchedThisRun;patchedThisRun=true;log.push('patch:'+(first?'first':'again'));
    patchSweep(document.querySelector<HTMLElement>('.buffer-area'),host.reduced(),()=>sound(first?'patchJingle':'patchShort',.9));
  }

  // ———— 破墙 ————
  /** 第二关清盘时先演仪式；返回 true 表示仪式里已经放过破墙声。 */
  async function beforeWin(level:LevelDef|null,state:GameState):Promise<boolean>{
    if(!isWall(level)||state.phase!=='won')return false;
    const screen=document.querySelector<HTMLElement>('.game-screen');if(!screen)return false;
    const rect=screen.getBoundingClientRect();
    const origin=lastPickPoint&&rect.width?{x:Math.max(12,Math.min(88,(lastPickPoint.x-rect.left)/rect.width*100)),y:Math.max(20,Math.min(80,(lastPickPoint.y-rect.top)/rect.height*100))}:null;
    const bumps=ledger.wallBumps;
    ledger=noteWallBroken(ledger);persist();log.push('wall:break');
    clearIdle(false);
    const show=playWallBreak(screen,{bumps,assisted:assistCount(state.stats)>0,total:state.screws.length,seconds:Math.round(state.stats.elapsedMs/1000),origin},{reduced:host.reduced(),onBeat:(beat:WallBeat)=>{
      log.push('beat:'+beat);
      if(beat==='crack')sound('crack',1,'impact');
      if(beat==='shatter')host.audio.play('wall');
      if(beat==='stamp'){sound('stamp',1,'reward');if(host.reduced())host.audio.play('wall');}
    }});
    await show.done;
    return true;
  }

  return{attachHome,noteInput,onLevelStart,onLeave,notePickPoint,onPick,onStuck,toolsPlate,decorateTools,onAssist,beforeWin,
    get ledger(){return ledger;},get streak(){return streak;},log,
    /** 仅验证模式使用：立刻演指定的空闲动作。 */
    debugIdle(act:IdleAct){clearIdle(false);perform(act);},
    /** 仅验证模式使用：在当前局面上预演破墙画面，不写账本、不结算。 */
    debugWall(bumps=3,assisted=false){const screen=document.querySelector<HTMLElement>('.game-screen');if(!screen)return Promise.resolve();return playWallBreak(screen,{bumps,assisted,total:120,seconds:0,origin:{x:58,y:62}},{reduced:host.reduced(),onBeat:beat=>{log.push('preview:'+beat);if(beat==='crack')sound('crack',1,'impact');if(beat==='shatter')host.audio.play('wall');if(beat==='stamp')sound('stamp',1,'reward');}}).done;},
    destroy(){window.clearInterval(idleClock);clearIdle(false);}};
}
export type Delight=ReturnType<typeof createDelight>;
