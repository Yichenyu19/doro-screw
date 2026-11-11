import './style.css';
import { GameEngine } from './core';
import {remainingOnBoard} from './geometry';
import {observeVisible} from './visible-analysis';
import {tutorialEvidence,teachingCue,teachingFlags,teachingStageKey} from './teaching';
import { GameAudio } from './audio';
import { assetUrl, sprite, PANEL_SLICE, preloadFrames } from './art';
import {R2_TITLES,CAMPAIGN_TITLES,CAMPAIGN_COUNT,dailyPractice,practiceCampaignId} from './r2-catalog';
import { GameServices } from './worker-client';
import { assistCount, challengeCode, clearRank, readChallengeCode, RANK_NAMES, CONTENT_REVISION } from './run';
import type { ContentVersion,PlayMode } from './types';
import type { GameView } from './render';
import { loadSaveAsync, persistSave, awardVictory, ARTWORKS,ALBUM_VOLUME_COUNT,setCurrentRun,currentRun,exportRecovery,importRecovery,describeAlbumGoal,volumeCompleted,type ProgressSave } from './storage';
import {campaignBest,encoreUnlocked,quietRating,rankMarks,titleName} from './meta';
import {buildShareSpec,createShareCanvas,shareOrDownloadCard} from './share-card';
import {onSaveStatus,getSaveStatus,flushJournal,noteUnsaved} from './journal';
import { PresentationDirector } from './presentation';
import {renderTrays} from './hud-trays';
import { ScrewArtwork } from './collection';
import { COLORS, COLOR_NAMES, type Action, type GameEvent, type GameState, type LevelDef } from './types';
import { createDelight } from './delight';

const app=document.querySelector<HTMLDivElement>('#app')!;
let loaded:{data:ProgressSave;warning:string|null;run:import('./types').RunCheckpoint|null};
let save:ProgressSave;
const services=new GameServices();
let pendingLaunch:(()=>void)|null=null;
let pendingStart:{id:number;saved?:GameState;attempt?:number;version:ContentVersion;playMode:PlayMode;revision:number}|null=null;
let hintSequence=0;
let artHighDefinition=false;
let artworkIndex=-1;
let audio:GameAudio;
let engine:GameEngine|null=null;
let view:GameView|null=null;
let level:LevelDef|null=null;
let mode:'home'|'game'='home';
let modal:string|null=null;
let generation=0;
let meltMode=false;
let lastSaveWarning=false;
let toastTimer=0;
let reactionTimer=0;
let modalReturn:string|null=null;
let lastFocus:HTMLElement|null=null;
let presenter:PresentationDirector|null=null;
let artwork:ScrewArtwork|null=null;
let earnedThisRound=0;
let lastClockTime=performance.now();
let tipTimer=0;
let inspecting=false;
let recordFilter:'campaign'|'random'|'legacy'='campaign';
let recordPage=0;
let modalHistory:string[]=[];
let navigatingBack=false;
let lastDecision:string='';
let artPointerClickTarget:HTMLElement|null=null;
let saveFrame=0,saveTask=0;
let rulesPrepared=false;
let teachingTimers:number[]=[];
const htmlCache=new WeakMap<Element,string>();
const delight=createDelight({get audio(){return audio;},reduced:()=>save.settings.reducedMotion,canIdle:()=>mode==='game'&&!!engine&&!!view&&engine.state.phase==='playing'&&!modal&&!inspecting&&!document.hidden,react:index=>react(index)});
const occupied=(state:GameState)=>state.buffer.filter(id=>id!==null).length;
function setHtml(selector:string,html:string):void {const target=document.querySelector(selector);if(target&&htmlCache.get(target)!==html){target.innerHTML=html;htmlCache.set(target,html);}}
function setText(selector:string,value:string):void{const target=document.querySelector(selector);if(target&&target.textContent!==value)target.textContent=value;}
function tickClock(now=performance.now()):void {
  const time=Math.max(lastClockTime,now);
  if(mode==='game'&&engine&&view&&engine.state.phase==='playing'&&!modal&&!inspecting&&!document.hidden)engine.advanceClock(time-lastClockTime);
  lastClockTime=time;
}
const nextCampaignLevel=()=>Array.from({length:CAMPAIGN_COUNT},(_,i)=>i+1).find(id=>!save.completed.includes(id))??CAMPAIGN_COUNT;
const randomUnlocked=()=>save.completed.includes(2)||save.legacyCompleted.includes(2)||save.unlocked>2;
const endlessUnlocked=()=>save.r1Campaign.completed.length===30||save.legacyCompleted.length===30;
const themeUnlocked=(id:number)=>save.completed.includes(practiceCampaignId(id));
const modeName=(playMode?:PlayMode)=>playMode==='mastery'?'主题精修':playMode==='rescue'?'残局解围':playMode==='random'?'旧版随机':playMode==='endless'?'旧版无尽':playMode==='legacy'?'旧版关卡':'精品主线';
const starterImage=()=>new URL('runtime/starter-sticker-v4.webp',document.baseURI).href;

const ALBUM_NAMES=['睡到螺丝松','今天也摸鱼','草莓补给站','螺丝小宇宙','花田休息日','今日螺丝王'];
const escapeText=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const icon=(index:number,className='',label='')=>sprite('ui',index,`ui-art ${className}`,label);
const doro=(index:number,className='')=>sprite('doro',index,`doro-art ${className}`);
const artButton=(action:string,text:string,options:{secondary?:boolean;className?:string;icon?:number;attrs?:string}={})=>
  `<button type="button" class="art-button ${options.secondary?'secondary':''} ${options.className??''}" data-action="${action}" ${options.attrs??''}>${sprite('button',0,'button-surface')}${options.icon===undefined?'':icon(options.icon,'button-symbol')}<span class="button-label">${text}</span></button>`;

function applySettings():void {
  document.documentElement.classList.toggle('gentle',save.settings.reducedMotion);
  document.documentElement.classList.toggle('color-labels',save.settings.colorLabels);
  audio.setEnabled(save.settings.sound);
  document.documentElement.style.setProperty('--panel-slice',String(PANEL_SLICE));
  document.documentElement.style.setProperty('--panel-art',`url("${new URL(assetUrl('panel-v2.png'),document.baseURI).href}")`);
}

function saveNow(snapshot?:GameState):void {
  if(!save)return;
  if(saveFrame)cancelAnimationFrame(saveFrame);if(saveTask)clearTimeout(saveTask);saveFrame=saveTask=0;
  tickClock();
  if (mode==='game' && engine) {
    if(!snapshot)view?.capturePhysics();
    save.current=engine.state.phase==='won'?null:snapshot??engine.snapshot();
    setCurrentRun(save.current?engine.checkpoint(save.current):null);
  }
  if (!persistSave(save)) void flushJournal().then(()=>{if(getSaveStatus().status==='error'&&!lastSaveWarning){lastSaveWarning=true;toast('保存遇到问题。请保持页面开启，并点保存状态导出恢复记录。',5000);}});
}
function saveSoon(snapshot:GameState):void {
  if(!engine)return;
  save.current=engine.state.phase==='won'?null:snapshot;setCurrentRun(save.current?engine.checkpoint(save.current):null);
  noteUnsaved();
  if(saveFrame||saveTask)return;
  // 先让这次拆钉和新盒色完成绘制；离开或隐藏页面时 saveNow 会同步接管尚未提交的状态。
  saveFrame=requestAnimationFrame(()=>{saveFrame=0;saveTask=window.setTimeout(()=>{saveTask=0;if(!persistSave(save))void flushJournal().then(()=>{if(getSaveStatus().status==='error'&&!lastSaveWarning){lastSaveWarning=true;toast('保存遇到问题，请点保存状态导出恢复记录。',5000);}});},0);});
}

function toast(text:string,duration=2400):void {
  const node=document.querySelector<HTMLElement>('#toast');
  if (!node) return;
  window.clearTimeout(toastTimer);
  node.textContent=text;
  node.classList.add('visible');
  toastTimer=window.setTimeout(()=>node.classList.remove('visible'),duration);
}

function shellAccessories():string {
  return '<div id="modal-root"></div><div id="toast" class="toast" role="status" aria-live="polite"></div>';
}
function updateSaveStatus():void {const value=getSaveStatus();for(const element of document.querySelectorAll<HTMLElement>('[data-save-status]')){const text=value.status==='saved'?'已保存':value.status==='saving'?'正在保存…':value.status==='local'?'恢复日志已保存':'保存异常 · 导出';if(element.textContent!==text)element.textContent=text;if(element.dataset.status!==value.status)element.dataset.status=value.status;if(element.title!==value.message)element.title=value.message;}}
onSaveStatus((status)=>{
  updateSaveStatus();
  if(status==='error'&&!lastSaveWarning){lastSaveWarning=true;toast('保存遇到问题。请保持页面开启，并点保存状态导出恢复记录。',5000);}
  if(status==='saved'||status==='local')lastSaveWarning=false;
});


function markRow(rank:ReturnType<typeof rankMarks>,label:string):string{
  const dot=(on:boolean,gold=false)=>`<i class="clear-mark${on?' on':''}${gold?' gold':''}"></i>`;
  return `<span class="clear-marks" aria-label="${escapeText(label)}">${dot(rank.complete)}${dot(rank.independent)}${dot(rank.clean,true)}</span>`;
}
function bufferDots(peak:number,capacity:number):string{
  return `<span class="buffer-dots" aria-hidden="true">${Array.from({length:Math.max(0,capacity)},(_,i)=>`<i class="buffer-dot${i<peak?' on':''}"></i>`).join('')}</span>`;
}
function stampRow(ids:string[]):string{
  if(!ids.length)return'';
  return `<ul class="title-stamps">${ids.map(id=>`<li>${escapeText(titleName(id))}</li>`).join('')}</ul>`;
}
function dailyMark(date:string){return save.dailyMarks[date];}

function showHome():void {
  saveNow();
  generation++;services.cancelHint();hintSequence++;pendingLaunch=null;clearTeachingTimers();
  artwork?.destroy();artwork=null;presenter?.cancel();presenter=null;
  view?.destroy();
  view=null;
  engine=null;
  level=null;
  mode='home';
  modal=null;
  modalHistory=[];inspecting=false;
  meltMode=false;
  const next=nextCampaignLevel();
  const progress=save.completed.length;
  const daily=dailyPractice(),dailyReady=themeUnlocked(daily.theme);
  app.innerHTML=`<main class="home-screen">
    <img class="scene-backdrop" src="${assetUrl('backdrop.png')}" alt="" fetchpriority="high">
    <nav class="home-top"><span class="club-label">Doro · 打个螺丝</span><button class="icon-button" data-action="settings" aria-label="设置">${icon(save.settings.sound?5:6)}</button></nav>
    <header class="home-title"><span class="eyebrow">第二关？这里不看广告。</span><h1><img class="home-logo" src="${assetUrl('logo.png')}" alt="DORO 打个螺丝" fetchpriority="high"></h1><p class="home-quantity">第一关先装满一盒。第二关是墙。</p></header>
    <div class="home-character" aria-label="一只准备拆螺丝的 Doro">${doro(1,'home-doro')}${sprite('fx',2,'home-heart')}${sprite('heads',0,'floating-screw screw-one')}${sprite('heads',4,'floating-screw screw-two')}<span class="character-note">你先拆，我看着。</span></div>
    <section class="home-actions" aria-label="开始游戏">
      ${artButton(save.current?'continue':progress===CAMPAIGN_COUNT?'random-menu':'start',save.current?'继续拆！':progress===CAMPAIGN_COUNT?'来一局主题挑战':'开始拆！',{className:'start-button',icon:12})}
      <p class="continue-note">${save.current?`${modeName(save.current.mode)} · 已为你留好盘面`:progress===CAMPAIGN_COUNT?'主线已完成 · 接下来按自己的节奏玩':`从第 ${next} 关开始 · 随时暂停，自动存档`}</p>
      <div class="home-secondary">${artButton('levels','关卡地图',{secondary:true,icon:3})}${artButton('random-menu','主题挑战',{secondary:true,icon:12})}${artButton('artwork','螺丝画册',{secondary:true,icon:15})}${artButton('records','我的记录',{secondary:true,icon:7})}</div>
    </section>
    <section class="home-share" aria-label="每日挑战和挑战码">
      <button type="button" class="home-daily${dailyMark(daily.date)?' is-done':''}" data-action="${dailyReady?'daily-start':'random-menu'}">
        <span class="eyebrow">今日挑战${dailyMark(daily.date)?' · '+RANK_NAMES[dailyMark(daily.date)!.rank]:''}</span>
        <strong>${R2_TITLES[daily.theme-1].name}</strong>
        <span>${daily.date} UTC</span>
        <small>${dailyMark(daily.date)?'还可再拆同一局':dailyReady?'今天大家拆同一局':'完成第 '+practiceCampaignId(daily.theme)+' 关后可玩'}</small>
      </button>
      <button type="button" class="home-code text-tool" data-action="challenge">有挑战码？贴进来一起拆</button>
    </section>
    <footer class="home-footer"><span>Doro · 打个螺丝 · 修订4 · ${progress} / ${CAMPAIGN_COUNT}</span><button data-action="save-status" data-save-status>已保存</button></footer>
  </main>${shellAccessories()}`;
  updateSaveStatus();delight.onLeave();delight.attachHome(app);
}

function gameShell():void {
  app.innerHTML=`<main class="game-screen">
    <img class="scene-backdrop game-backdrop" src="${assetUrl('backdrop.png')}" alt="">
    <header class="game-top"><button class="icon-button" data-action="pause" aria-label="暂停游戏">${icon(4)}</button><div class="game-heading"><span id="level-number" class="eyebrow">正在准备</span><h1 id="level-name">这一局</h1></div><button class="icon-button sound-toggle" data-action="sound" aria-label="切换音效">${icon(save.settings.sound?5:6)}</button></header>
    <section class="collection-area" aria-label="同色收集盒"><div class="collection-label"><span>同色三颗，装箱</span><span id="collection-progress"></span></div><div id="box-tray" class="box-tray"></div></section>
    <div class="queue-preview"><span>之后两盒</span><div id="queue-colors"></div><span class="preview-note">先留好颜色</span></div>
    <section class="buffer-area" aria-label="螺丝暂存区"><div id="buffer-tray" class="buffer-tray"></div><button id="pocket-count" class="pocket-button" data-action="pocket" data-pocket-target aria-label="查看口袋">口袋 0</button><div id="doro-reaction" class="doro-reaction" aria-hidden="true">${doro(0)}</div></section>
    <section class="board-wrap" aria-label="玻璃拆解棋盘"><div id="game-canvas" class="game-canvas"></div><div id="board-loading" class="board-loading">${doro(0)}<span role="status">正在把玻璃摆好…</span></div><div class="board-camera" aria-label="棋盘视图"><button data-action="zoom-toggle" aria-expanded="false" aria-label="调整棋盘视图">视图</button><div class="camera-menu" hidden><button data-action="zoom-out" aria-label="缩小棋盘">−</button><button data-action="zoom-reset" aria-label="复位棋盘视图"><span id="zoom-value">100%</span><small>复位</small></button><button data-action="zoom-in" aria-label="放大棋盘">+</button></div></div><div id="board-inspect" class="board-inspect" hidden role="status"></div><div class="board-guide"><div id="board-tip" class="board-tip" aria-live="polite"></div><button data-action="help" class="guide-help" aria-label="查看玩法说明">?</button></div></section>
    <footer class="game-tools"><div class="play-toolbar"><button class="text-tool" data-action="undo">${icon(7)}撤回</button><button class="text-tool" data-action="hint">${icon(8)}看一看</button><button class="text-tool" data-action="tools">${icon(9)}免费辅助</button></div><div class="run-line"><span id="round-assists">按自己的节奏拆</span><button data-action="save-status" data-save-status>已保存</button><span id="run-detail" hidden></span></div></footer>
  </main>${shellAccessories()}`;
}

async function startLevel(id:number,saved?:GameState,forcedAttempt?:number,version:ContentVersion=saved?.contentVersion??'v4',playMode:PlayMode=saved?.mode??(version==='v4'?(id>30?'endless':'campaign'):'legacy'),revision=saved?.contentRevision??CONTENT_REVISION):Promise<void> {
  const token=++generation;services.cancelHint();hintSequence++;pendingLaunch=null;clearTeachingTimers();
  artwork?.destroy();artwork=null;presenter?.cancel();presenter=null;view?.destroy();view=null;engine=null;level=null;
  const key=version+':'+(version==='v4'?revision+':'+playMode+':':'')+id,attempt=saved?(saved.attempt??save.currentAttempt):version==='v4'&&playMode==='campaign'?0:(forcedAttempt??save.attempts[key]??0);
  pendingStart={id,saved,attempt,version,playMode,revision};mode='game';modal=null;modalReturn=null;modalHistory=[];meltMode=false;inspecting=false;earnedThisRound=0;lastDecision='';
  const starting=document.querySelector<HTMLButtonElement>('[data-action="start"],[data-action="continue"]');
  if(starting){starting.setAttribute('aria-busy','true');starting.disabled=true;const label=starting.querySelector('.button-label');if(label)label.textContent='正在准备…';}
  else app.insertAdjacentHTML('beforeend','<div class="toast visible" role="status">正在准备这一局…</div>');
  // 先让加载状态完成一次绘制，再加载引擎并在后台准备关卡。
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.setTimeout(resolve,0))));
  if(token!==generation)return;
  gameShell();
  await new Promise<void>(resolve=>requestAnimationFrame(()=>window.setTimeout(resolve,0)));
  if(token!==generation)return;
  try{
    const [prepared,renderer]=await Promise.all([services.prepare(id,attempt,version,playMode,revision),import('./render')]);if(token!==generation)return;
    const previous=currentRun();const active=new GameEngine(prepared,saved,saved&&previous?.state.runId===saved.runId?previous.history:[]);level=prepared;engine=active;save.currentAttempt=attempt;
    if(!rulesPrepared){const trial=new GameEngine(prepared,active.snapshot());for(let i=0;i<20;i++){const pin=trial.available()[i%Math.max(1,trial.available().length)];if(!pin)break;trial.dispatch({type:'pick',screwId:pin.id});trial.snapshot();trial.undo();}rulesPrepared=true;}
    preloadFrames('heads',COLORS.map((_,i)=>i));
    if(!saved){save.attempts[key]=Math.max(save.attempts[key]??0,attempt+1);save.attemptCounter++;}
    presenter=new PresentationDirector(save.settings,{render:()=>updateHUD(),screenPoint:point=>view?.screenPoint(point)??null,boxSound:()=>{audio.play('box');react(1);},arriveSound:()=>{const filled=Math.max(0,...(engine?.state.boxes.map(b=>b.screws.length)??[1]));audio.play('arrive',{tone:Math.min(2,Math.max(0,filled-1))});},refillSound:()=>audio.play('refill')});presenter.reset(active.snapshot());
    const mounted=await renderer.mountGame(document.querySelector<HTMLElement>('#game-canvas')!,active,save.settings,{onPick:pick,onBoard:meltBoard,onReveal:events=>{services.cancelHint();hintSequence++;presenter?.reset(active.snapshot());audio.play('reveal');showBoardTip('新的一层露出来了。先看当前盒色。');saveNow();},onAmbiguous:()=>{showBoardTip('两颗钉靠得太近，先放大再拆。');const menu=document.querySelector<HTMLElement>('.camera-menu');if(menu)menu.hidden=false;},onBlocked:ids=>{audio.play('blocked');showBoardTip(ids.length?'先移开闪动的玻璃，再拆下面这颗。':'先等玻璃摆稳。');},onFall:()=>audio.play('fall'),onInvalid:()=>showBoardTip('这颗钉被挡住了，或者位置变了。'),onInspect:text=>{tickClock();inspecting=!!text;lastClockTime=performance.now();const panel=document.querySelector<HTMLElement>('#board-inspect');if(panel){panel.hidden=!text;panel.textContent=text??'';}},onCamera:zoom=>{const label=document.querySelector('#zoom-value');if(label)label.textContent=Math.round(zoom*100)+'%';presenter?.flush();}});
    if(token!==generation){mounted.destroy();return;}view=mounted;lastClockTime=performance.now();document.querySelector('#board-loading')?.remove();delight.onLevelStart(prepared,active.state);view.setPaused(document.hidden||!!modal);presenter.prepareLayout();saveNow();
    if(active.state.phase==='stuck'){audio.play('full');showRescue();}else updateTeaching();if(save.settings.sound)audio.unlock();
  }catch(error){if(token!==generation)return;openModal('error',`${doro(3,'dialog-doro')}<h2>这一局还没准备好</h2><p>盘面记录仍保留着。请重新加载；如果仍未完成，可以先保存退出。</p><p class="small-note">${escapeText(error instanceof Error?error.message:'资源暂时不可用')}。</p>${artButton('retry','重新加载',{icon:12})}${artButton('home','保存退出',{secondary:true})}`,{closable:false});}
}

function updateHUD():void {
  if(!engine||!level||mode!=='game')return;const state=presenter?.state??engine.state;
  preloadFrames('cases',engine.state.boxQueue.slice(engine.state.queueCursor,engine.state.queueCursor+2).map(c=>COLORS.indexOf(c)));
  const challenge=state.mode==='rescue'||state.mode==='mastery';setText('#level-number',modeName(state.mode)+(challenge?` · 主题 ${level.id}`:level.id<=30?` · ${String(level.id).padStart(2,'0')} / ${(state.contentRevision??1)>=4?CAMPAIGN_COUNT:(state.contentRevision??1)===3?10:(state.contentRevision??1)>=2?8:30}`:` · ${level.id-30}`));setText('#level-name',level.name);
  const rewardable=state.rewardableIds;setText('#collection-progress',rewardable?`本局 ${state.screws.filter(s=>rewardable.includes(s.id)&&s.place!=='board').length} / ${rewardable.length}`:`${state.collected.length} / ${state.screws.length}`);
  renderTrays(state,presenter,save.settings);
  const preview=engine.state.boxQueue.slice(engine.state.queueCursor,engine.state.queueCursor+2);setHtml('#queue-colors',preview.length?preview.map((c,i)=>`<span class="preview-color">${sprite('heads',COLORS.indexOf(c))}<span>${i+1}. ${COLOR_NAMES[c]}</span></span>`).join(''):'<span>最后几盒啦</span>');
  setText('#pocket-count','口袋 '+state.pocket.length);setText('#round-assists',engine.state.goal&&engine.state.goal!=='complete'?'自选目标：'+RANK_NAMES[engine.state.goal]:stageInfo().title);setText('#run-detail',`撤回 ${engine.state.stats.undos} · 小抄 ${engine.state.stats.hintsShown} · 辅助 ${assistCount(engine.state.stats)}`);
  const sound=document.querySelector('.sound-toggle')!;setHtml('.sound-toggle',icon(save.settings.sound?5:6));sound.setAttribute('aria-label',save.settings.sound?'关闭音效':'开启音效');document.querySelector('.buffer-area')?.classList.toggle('buffer-danger',occupied(state)>=state.capacity-1);const undo=document.querySelector<HTMLButtonElement>('.play-toolbar [data-action="undo"]');if(undo)undo.disabled=!engine.canUndo;
}
function stageInfo(){return level?.curriculum?.stages.find(stage=>!engine||engine.state.moves<stage.until)??{until:Infinity,title:'按自己的节奏拆',advice:level?.strategy??''};}

function showBoardTip(text:string):void {setText('#board-tip',text);window.clearTimeout(tipTimer);}
function clearTeachingTimers():void{for(const id of teachingTimers)window.clearTimeout(id);teachingTimers=[];}
function laterTeach(ms:number,fn:()=>void):void{teachingTimers.push(window.setTimeout(fn,ms));}
function cueVisualTeaching(events:GameEvent[],opening=false):void {
  if(save.settings.reducedMotion)return;
  const flags=teachingFlags(events);
  const first=(name:string)=>{if(save.tutorialSeen.includes(name))return false;save.tutorialSeen.push(name);return true;};
  if((opening||flags.includes('refill-tip')||flags.includes('buffer-tip'))&&first(opening?'open-box-guide':'refill-guide')){
    document.querySelector('#box-tray')?.classList.add('guide-box-pulse','guide-match');
    if(!opening)document.querySelector('.buffer-area')?.classList.add('guide-refill');
    laterTeach(opening?2200:1600,()=>{document.querySelector('.buffer-area')?.classList.remove('guide-refill');document.querySelector('#box-tray')?.classList.remove('guide-box-pulse','guide-match');});
  }
  if(flags.includes('window-tip')&&first('window-guide')){
    document.querySelector('#game-canvas')?.classList.add('guide-window');
    laterTeach(1800,()=>document.querySelector('#game-canvas')?.classList.remove('guide-window'));
  }
}
function updateTeaching(events:GameEvent[]=[],before?:GameState):void {
  if(!engine||!level)return;const state=engine.state;
  const record=(name:string)=>{if(!save.tutorialSeen.includes(name))save.tutorialSeen.push(name);};
  for(const name of tutorialEvidence(level,before,events))record(name);
  for(const flag of teachingFlags(events))record(flag);
  if(save.tutorialSeen.includes('skip')){showBoardTip('');return;}
  const cue=teachingCue(level,state,events,save.tutorialSeen);
  cueVisualTeaching(events,!!cue&&state.moves===0);
  if(cue){record(cue.key);showBoardTip(cue.text);return;}
  // 修订2以后的主线不再走旧版 l1-swing 逐句讲稿。
  if(!level.tutorial||((level.contentRevision??0)>=2&&(level.mode??'campaign')==='campaign')){
    const stageKey=teachingStageKey(level);
    if(state.moves===0&&!save.tutorialSeen.includes(stageKey)){
      const advice=stageInfo().advice||'';
      if(advice){record(stageKey);showBoardTip(advice);}else showBoardTip('');
    }else showBoardTip('');
    return;
  }
  const pins=new Map(state.screws.map(s=>[s.id,s]));
  if(state.contentVersion!=='v4'){showBoardTip('同色进盒，别的颜色先暂存。');return;}
  if(state.moves===0)showBoardTip('先看长板的红钉与棕钉，它们要先暂存。');
  else if(remainingOnBoard(state,'l1-swing').length>1)showBoardTip('先拆长板右侧，留下左边当支点。');
  else if(pins.get('l1-under-s1')?.place==='board')showBoardTip('留着左支点，等长板摆开再取橘钉。');
  else if(save.tutorialSeen.includes('refill'))showBoardTip('新红盒一到，暂存红钉会自己回去。');
  else if(occupied(state)>0)showBoardTip('暂存钉等同色盒出现，会自己回去。');
  else showBoardTip('同色进盒，别的颜色先暂存。');
}

function react(index:number):void {
  window.clearTimeout(reactionTimer);
  const element=document.querySelector('#doro-reaction');
  if (element) element.innerHTML=doro(index);
  reactionTimer=window.setTimeout(()=>{
    const target=document.querySelector('#doro-reaction');
    if (target) target.innerHTML=doro(engine&&occupied(engine.state)>=engine.state.capacity-1?2:0);
  },1300);
}

function pick(id:string):void {
  if (!engine || modal || meltMode) return;
  audio.unlock();
  delight.notePickPoint(view?.getScrewScreenPosition(id)??null);
  runAction({type:'pick',screwId:id});
}

function runAction(action:Action):void {
  if (!engine) return;
  tickClock();services.cancelHint();hintSequence++;
  view?.capturePhysics();
  const result=engine.dispatch(action);
  if (!result.ok) {if(result.reason)toast(result.reason);audio.play('blocked');return;}
  if(action.type==='pick'){const picked=engine.state.screws.find(s=>s.id===action.screwId)!;const back=result.events.filter(e=>e.type==='routed'&&e.sourcePlace==='buffer'&&e.destination==='box').length;lastDecision=`刚拆的${COLOR_NAMES[picked.color]}钉${picked.place==='buffer'?'占用了一个暂存孔':'已进入收集流程'}；${back?'本次回流腾出 '+back+' 个孔':'本次没有暂存钉回流'}。`;}
  if(action.type==='pick')delight.onPick(engine.state,action.screwId,result.events);
  view?.setHint(null);
  view?.sync(result.events);
  const after=engine.snapshot();
  presenter?.enqueue(result.events,result.before!,after);
  audio.play(action.type==='pick'?'pick':'tool');
  if(result.events.some(e=>e.type==='board-released'&&e.remaining===1))audio.play('loosen');
  if(result.events.filter(e=>e.type==='box-completed').length>1){audio.play('chain');react(5);}else if(occupied(engine.state)>=engine.state.capacity-1)react(2);
  updateTeaching(result.events,result.before);
  if(engine.state.phase==='won')earnedThisRound=awardVictory(save,engine.state,level?.attempt??0);


  saveSoon(after);
  const active=engine,token=generation;
  if(engine.state.phase==='won'){
    void (async()=>{await presenter?.whenIdle();await view?.whenSettled(1800);if(engine===active&&generation===token&&!modal){const wall=await delight.beforeWin(level,engine.state);if(engine===active&&generation===token&&!modal)showWin(!wall);}})();
  }else if(engine.state.phase==='stuck'){
    audio.play('full');
    delight.onStuck(level);
    void (async()=>{await presenter?.whenIdle();if(engine===active&&generation===token&&engine.state.phase==='stuck'&&!modal)showRescue();})();
  }
}

function meltBoard(id:string):void {
  if (!meltMode || modal || !engine) return;
  meltMode=false;
  view?.setMeltMode(false);
  runAction({type:'melt',boardId:id});
  react(4);delight.onAssist();
  toast('玻璃融化啦，螺丝还在原位。');
}

function openModal(name:string,content:string,options:{wide?:boolean;closable?:boolean}={}):void {
  tickClock();
  artwork?.destroy();artwork=null;
  if(name!=='hint'){services.cancelHint();hintSequence++;}
  presenter?.flush();
  if(!navigatingBack&&modal&&modal!==name&&options.closable!==false)modalHistory.push(modal);
  navigatingBack=false;modal=name;
  lastFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  view?.capturePhysics();
  view?.setPaused(true);
  const target=document.querySelector('#modal-root')!;
  target.innerHTML=`<div class="modal-shade"><section class="dialog ${options.wide?'dialog-wide':''}" role="dialog" aria-modal="true" aria-label="${name}">${icon(2,'dialog-surface')}<div class="dialog-content">${options.closable===false?'':`<button class="icon-button dialog-close" data-action="close-modal" aria-label="关闭"><span class="close-mark" aria-hidden="true"></span></button>`}${content}</div></section></div>`;
  window.setTimeout(()=>target.querySelector<HTMLElement>('button:not([disabled]),input')?.focus({preventScroll:true}),30);
}

function closeModal():void {
  services.cancelHint();hintSequence++;
  artwork?.destroy();artwork=null;
  const returnTo=modalHistory.pop()??modalReturn;
  modal=null;
  modalReturn=null;
  document.querySelector('#modal-root')!.innerHTML='';
  view?.setPaused(document.hidden);
  lastClockTime=performance.now();
  lastFocus?.focus({preventScroll:true});
  if(returnTo){navigatingBack=true;if(returnTo==='pause'){showPause();return;}if(returnTo==='album'){showAlbum();return;}if(returnTo==='records'){showRecords();return;}if(returnTo==='random-menu'){showRandomMenu();return;}if(returnTo==='artwork'){showArtwork(artworkIndex);return;}if(returnTo==='challenge'){showChallenge();return;}if(returnTo==='settings'){showSettings();return;}if(returnTo==='help'){showHelp();return;}if(returnTo==='levels'){showLevels();return;}if(returnTo==='hint'){showHint();return;}if(returnTo==='tools'){showTools();return;}if(returnTo==='save-status'){showSaveState();return;}navigatingBack=false;}
  if (engine?.state.phase==='stuck') showRescue();
  else if(engine?.state.phase==='won')showWin(false);
}

function showPause():void {
  modalReturn=null;saveNow();openModal('pause',`${doro(0,'dialog-doro')}<h2>我帮你盯着。</h2><p>已拆 ${engine?.state.moves??0} 颗 · ${engine?.canUndo?'撤回记录也会一起保留':'从新的操作起保留撤回'}</p><button class="save-message" data-action="save-status" data-save-status>正在保存…</button>${artButton('resume','继续这一局',{icon:12})}<div class="dialog-button-grid">${artButton('help','怎么玩',{secondary:true})}${artButton('settings','游戏设置',{secondary:true})}${artButton('challenge','这局的挑战目标',{secondary:true})}${artButton('records','我的记录',{secondary:true})}${artButton('artwork','螺丝画册',{secondary:true})}</div><div class="pause-links"><button data-action="retry-same">重试同一盘面</button><button data-action="restart">换一局主题挑战</button><button data-action="levels">关卡地图</button><button data-action="home">保存退出</button></div>`);updateSaveStatus();
}
function confirmLaunch(launch:()=>void):void {
  const current=engine?.state.phase==='playing'||engine?.state.phase==='stuck'?engine.state:save.current;
  if(current&&current.moves>0){pendingLaunch=launch;if(modal)modalHistory.push(modal);navigatingBack=true;openModal('restart-confirm',`<h2>开始选择的盘面？</h2><p>已经拆了 ${current.moves} 颗。继续会重置这局未完成的盘面，记录仍保留。</p>${artButton('cancel-launch','保留盘面，返回')}${artButton('confirm-launch','确定，开始选择的局面',{secondary:true})}`,{closable:false});}else launch();
}
function showHelp():void {
  openModal('help',`<h2>先看盒，再拆钉。</h2><ul class="help-cards"><li class="help-card"><div class="help-fig help-fig-box" aria-hidden="true">${sprite('cases',1,'help-case')}<span class="help-pins">${sprite('heads',1,'help-pin')}${sprite('heads',1,'help-pin')}${sprite('heads',1,'help-pin')}</span></div><p>同色三颗装一盒。</p></li><li class="help-card"><div class="help-fig help-fig-buffer" aria-hidden="true">${sprite('screws',8,'help-hole')}${sprite('screws',8,'help-hole')}${sprite('heads',0,'help-fill')}${sprite('screws',8,'help-hole')}${sprite('screws',8,'help-hole')}</div><p>别的颜色先放孔里，新盒会接走。</p></li><li class="help-card"><div class="help-fig help-fig-hold" aria-hidden="true"><span class="hf-plate"></span><span class="hf-finger"></span></div><p>长按检查挡板，松手结束。</p></li><li class="help-card"><div class="help-fig help-fig-hinge" aria-hidden="true"><span class="hf-plate"></span>${sprite('heads',5,'help-pin')}</div><p>留一钉，板会自己摆开。</p></li><li class="help-card"><div class="help-fig help-fig-zoom" aria-hidden="true"><span class="hf-lens"></span><span class="hf-handle"></span></div><p>双指放大，拖动看清。</p></li></ul><p class="small-note">第二关？这里不看广告。用了挂会写在成绩上。</p>${artButton('close-modal','懂了，继续')}${level?.tutorial?artButton('skip-tutorial','跳过教学',{secondary:true}):''}`);
}
function showPocket():void {
  if(!engine)return;const counts=COLORS.map(color=>({color,n:engine!.state.pocket.filter(id=>engine!.state.screws.find(s=>s.id===id)?.color===color).length})).filter(x=>x.n);
  openModal('pocket',`<h2>都在口袋里。</h2><p>同色盒出现时，口袋里的螺丝会自动回流。</p><div class="pocket-inventory">${counts.length?counts.map(({color,n})=>`<span>${sprite('heads',COLORS.indexOf(color))}<b>${COLOR_NAMES[color]}</b> × ${n}</span>`).join(''):'<p>口袋还是空的。</p>'}</div>${artButton('close-modal','收好，继续',{secondary:true})}`);
}
function showTools(rescue=false):void {
  if(!engine)return;const previews=[{type:'expand-box' as const,label:'开启辅助盒'},{type:'expand-buffer' as const,label:'增加暂存孔'},{type:'clear-buffer' as const,label:'收进口袋'}].map(item=>({...item,preview:engine!.toolPreview({type:item.type})}));
  const rows=previews.filter(x=>x.preview.available&&(!rescue||x.preview.freed+x.preview.added>0)).map(({type,label,preview:p})=>`<button class="rescue-option" data-action="use-${type}"><strong>${label}</strong><span>${p.freed>0?'立即腾出 '+p.freed+' 个孔':p.added>0?'新增 '+p.added+' 个空孔':'现在腾出 0 孔'}${p.nextColor?' · '+COLOR_NAMES[p.nextColor]+'盒':''}</span></button>`).join('');
  const rewind=rescue?engine.solvableRewindPlan():{ok:false,steps:0,reason:''};
  const why=rescue?`<div class="rescue-cause"><p>${lastDecision||'暂存孔已经全部占满。'}</p><p>${engine.state.boxes.filter(b=>b.color).map(b=>COLOR_NAMES[b.color!]+'盒还差 '+(3-b.screws.length)+' 颗').join('；')}。${rewind.ok&&rewind.steps>1?'可以回到还能拆的那一步，或用免费辅助腾出空孔。':'先腾出空孔，就能继续。'}</p></div>`:'';
  const rewindButton=rescue&&rewind.ok&&rewind.steps>1?`<button class="rescue-option rescue-rewind" data-action="rewind-solvable"><strong>回到还能拆的地方</strong><span>撤回 ${rewind.steps} 步，记 ${rewind.steps} 次撤回。辅助仍全免费，会记进成绩档。</span></button>`:'';
  const wall=level?.mode==='campaign'&&level.id===2;
  const title=rescue?(wall?'别人这时候在看广告。这里不用。':'先腾出一点空间。'):(wall?'这关是墙，过不去很正常。':'要用挂，就用。');
  const blurb=wall?'用了会记成「完成（用了挂）」。':'用了会记进成绩。';
  openModal(rescue?'rescue':'tools',`${rescue||wall?doro(rescue?3:0,'dialog-doro'):''}${rescue?'':delight.toolsPlate(wall)}<h2>${title}</h2>${why}<p>${blurb}</p><div class="rescue-options">${rewindButton}${rescue&&engine.canUndo?'<button class="rescue-option" data-action="undo-rescue"><strong>撤回上一步</strong><span>换个选择 · 记一次撤回</span></button>':''}${rows}${rescue?'':'<button class="rescue-option" data-action="use-melt"><strong>融化一块玻璃</strong><span>选出一块，螺丝留在原处</span></button>'}</div><p class="small-note">独立解出：没用强辅助、没看具体目标，允许撤回。零回退还要求一次都没撤。</p>${artButton('home','保存退出',{secondary:true})}`,{closable:!rescue});
  if(!rescue)delight.decorateTools(document.querySelector('#modal-root')!);
}
function showHint():void {
  if(!engine)return;view?.capturePhysics();const available=engine.available(),matching=available.filter(s=>engine!.state.boxes.some(b=>b.color===s.color)),free=engine.state.capacity-occupied(engine.state);
  const colors=[...new Set(engine.state.boxes.map(b=>b.color).filter(Boolean))].map(c=>COLOR_NAMES[c!]).join('、');
  openModal('hint',`${doro(0,'dialog-doro')}<h2>一起看看盘面。</h2><p>现在接收：<strong>${colors}</strong>。还空着 <strong>${free}</strong> 个孔。</p><p>${matching.length?'可见螺丝里有 '+matching.length+' 颗当前盒色。先找能凑满第三颗的位置，再考虑暂存。':'当前盒色还被压着。看看哪块上层玻璃快拆空，或者等单钉板摆开。'}</p><div id="hint-relations"></div><p class="small-note">观察与关系说明不计小抄。主动显示具体目标会记录一次提示，材料照常。</p><div id="hint-next">${artButton('hint-relations','再解释一下关系',{secondary:true})}</div>${artButton('close-modal','我自己再想想',{secondary:true})}<p id="hint-status" role="status"></p>`);
}
async function requestRelations():Promise<void>{
  if(!engine||modal!=='hint')return;const active=engine,token=++hintSequence,revision=active.state.actionRevision,button=document.querySelector<HTMLButtonElement>('[data-action="hint-relations"]'),status=document.querySelector('#hint-status');if(button)button.disabled=true;if(status)status.textContent='正在对照可见盒色与挡板…';
  try{const result=await services.diagnose(observeVisible(active.state));if(token!==hintSequence||engine!==active||modal!=='hint'||result.runId!==active.state.runId||result.revision!==revision)return;setHtml('#hint-relations','<ol class="help-list">'+result.diagnosis.relations.map(text=>'<li>'+escapeText(text)+'</li>').join('')+'</ol>');setHtml('#hint-next',artButton('hint-arrow','仍需帮助，请标出一颗',{icon:8}));if(status)status.textContent='这些关系只依据当前可见盘面，还没有断言完整路线可解。';}
  catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;if(status)status.textContent='关系说明暂时没有加载，请重试。';if(button)button.disabled=false;}
}
async function requestHint():Promise<void> {
  if(!engine||!level||modal!=='hint')return;const active=engine,token=++hintSequence,revision=active.state.actionRevision;const b=document.querySelector<HTMLButtonElement>('[data-action="hint-arrow"]');if(b)b.disabled=true;const status=document.querySelector('#hint-status');if(status)status.textContent='Doro 正在看…';
  try{const result=await services.hint(level,active.snapshot());if(token!==hintSequence||engine!==active||modal!=='hint'||result.runId!==active.state.runId||result.revision!==revision||active.state.actionRevision!==revision)return;
    const hint=result.hint;if(hint.type==='move'&&active.canPick(hint.id)){const screw=active.state.screws.find(s=>s.id===hint.id)!;if(!active.state.boxes.some(b=>b.color===screw.color)&&occupied(active.state)+1>=active.state.capacity)throw Error('暂存不足');active.markHintShown();closeModal();view?.setHint(hint.id);showBoardTip('先看看圈出的这颗 '+COLOR_NAMES[screw.color]+' 螺丝。');saveNow();updateHUD();}
    else{if(status)status.textContent=hint.type==='wait'?'先关掉小抄，让玻璃摆稳。入口露出来后再看看。':hint.reason;if(b)b.disabled=false;}
  }catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;if(token!==hintSequence)return;if(status)status.textContent='这次没看清，先留好空孔，等玻璃摆稳后再试。';if(b)b.disabled=false;}
}
function showChallenge():void {
  const code=level?challengeCode(level.id,level.attempt??0,level.contentVersion,level.mode,level.contentRevision):'',record=engine?save.records[engine.state.attemptId]:null;
  const goal=engine?.state.goal??'complete';
  openModal('challenge',`<h2>把这局留给下次。</h2>${code?'<input id="current-code" class="challenge-code" aria-label="当前挑战码" readonly value="'+code+'"><div class="dialog-button-grid">'+artButton('copy-code','复制挑战码',{secondary:true})+(engine?.state.phase==='won'?artButton('share-card','收下成绩卡',{secondary:true}):'')+'</div>':''}${engine?.state.phase==='playing'?'<p class="code-label">给自己选个目标，随时可改</p><div class="record-tabs">'+(['complete','independent','clean'] as const).map(rank=>`<button data-action="set-goal" data-goal="${rank}" aria-pressed="${goal===rank}">${rank==='complete'?'轻松完成':RANK_NAMES[rank]}</button>`).join('')+'</div>':''}${record?'<p class="record-best">最佳：'+RANK_NAMES[record.rank]+(record.moves!=null?' · '+record.moves+' 步':'')+' · '+Math.round(record.elapsedMs/1000)+' 秒</p>':''}${artButton('records','查看全部历史记录',{secondary:true})}<label class="code-label" for="challenge-input">输入挑战码</label><input id="challenge-input" autocomplete="off" spellcheck="false" placeholder="D4-…（兼容 D2 / D3）"><p id="code-error" class="small-note" role="status"></p>${artButton('import-code','打开这个局面')}`);
}

function showRecords():void {
  const all=Object.values(save.records).filter(record=>recordFilter==='legacy'?record.contentVersion!=='v4'||(record.contentRevision??1)<2:recordFilter==='campaign'?record.contentVersion==='v4'&&(record.contentRevision??1)>=2&&(record.mode??'campaign')==='campaign':record.contentVersion==='v4'&&(record.contentRevision??1)>=2&&(record.mode==='rescue'||record.mode==='mastery')).sort((a,b)=>b.updatedAt-a.updatedAt);
  recordPage=Math.min(recordPage,Math.max(0,Math.ceil(all.length/20)-1));const rows=all.slice(recordPage*20,recordPage*20+20);
  openModal('records',`<h2>拆过的，都记着。</h2>${stampRow(save.titles)}<div class="record-tabs">${(['campaign','random','legacy'] as const).map(filter=>`<button data-action="record-filter" data-filter="${filter}" aria-pressed="${recordFilter===filter}">${filter==='campaign'?'主线':filter==='random'?'残局 / 精修':'旧版记录'}</button>`).join('')}</div><div class="record-list">${rows.length?rows.map(record=>`<article class="record-row"><div><strong>${record.contentVersion!=='v4'?record.contentVersion.toUpperCase()+' · ':record.contentRevision!==CONTENT_REVISION&&(record.contentRevision??1)>=2?'修订 '+record.contentRevision+' · ':record.mode==='rescue'?'残局 · ':record.mode==='mastery'?'精修 · ':''}${record.levelId>30?'无尽 '+(record.levelId-30):'第 '+record.levelId+' 关'}</strong><span>${markRow(rankMarks(record.rank),RANK_NAMES[record.rank])} ${RANK_NAMES[record.rank]}${record.moves!=null?' · '+record.moves+' 步':''} · ${Math.round(record.elapsedMs/1000)} 秒</span><small>${record.assists?'辅助 '+record.assists+' · ':''}完成 ${record.clears} 次</small></div><button data-action="record-replay" data-record="${escapeText(record.puzzleId)}">重玩同局</button></article>`).join(''):'<div class="record-empty">'+doro(0)+'<p>这里还没有记录。完成一局，成绩就会留在这里。</p></div>'}</div>${all.length>20?'<div class="record-pager"><button data-action="record-page" data-page="'+(recordPage-1)+'" '+(recordPage===0?'disabled':'')+'>上一页</button><span>'+(recordPage+1)+' / '+Math.ceil(all.length/20)+'</span><button data-action="record-page" data-page="'+(recordPage+1)+'" '+((recordPage+1)*20>=all.length?'disabled':'')+'>下一页</button></div>':''}${artButton('close-modal','返回',{secondary:true})}`,{wide:true});
}
function showRandomMenu():void {
  const unlocked=randomUnlocked(),daily=dailyPractice(),dailyReady=themeUnlocked(daily.theme);
  openModal('random-menu',`<h2>再拆一局新的。</h2><p>从见过的主题里选。打完按本局新拆的螺丝发材料。</p>${unlocked?`<label class="code-label" for="random-level">选择主题</label><select id="random-level">${R2_TITLES.filter(item=>item.id>=2).map(item=>`<option value="${item.id}" ${themeUnlocked(item.id)?'':'disabled'}>${item.id}. ${item.name}${themeUnlocked(item.id)?'':' · 完成这一关后开放'}</option>`).join('')}</select><div class="practice-options"><article><h3>残局解围</h3><p>已有暂存和半盒，从中途接回来。<br>本局新拆约 30–60 颗。</p>${artButton('practice-start','解开这个残局',{icon:12,attrs:'data-play-mode="rescue"'})}</article><article><h3>主题精修</h3><p>从头拆一盘，比较新的供给关系。<br>每局约 60–120 颗，六种编排。</p>${artButton('practice-start','来一局主题精修',{secondary:true,attrs:'data-play-mode="mastery"'})}</article></div>`:'<p class="unlock-note">完成第二关，残局解围和主题精修一起开放。</p>'}<section class="daily-practice${dailyMark(daily.date)?' is-done':''}"><span class="eyebrow">每日共享 · ${daily.date} UTC${dailyMark(daily.date)?' · '+RANK_NAMES[dailyMark(daily.date)!.rank]:''}</span><h3>${R2_TITLES[daily.theme-1].name}</h3>${dailyReady?artButton('daily-start',dailyMark(daily.date)?'再拆今日同一局':'打开今日精修',{secondary:true}):`<p class="small-note">完成主线第 ${practiceCampaignId(daily.theme)} 关后可玩。</p>`}</section><p class="small-note">每局只结算一次。残局预置库存不发材料。</p>${artButton('challenge','输入挑战码',{secondary:true})}${artButton('records','挑战记录',{secondary:true})}`);
}
function startPractice(id:number,playMode:'rescue'|'mastery',attempt?:number):void {if(!themeUnlocked(id)){showRandomMenu();return;}const nextAttempt=attempt??save.randomCounter++;confirmLaunch(()=>{void startLevel(id,undefined,nextAttempt,'v4',playMode,CONTENT_REVISION);});}
function startRandom(id:number):void{startPractice(Math.max(2,Math.min(8,id)),'mastery');}
function launchNext():void {
  if(level?.mode==='rescue'||level?.mode==='mastery'){startPractice(level.id,level.mode);return;}
  if(level?.contentVersion!=='v4'||(level.contentRevision??1)!==CONTENT_REVISION){void startLevel(nextCampaignLevel());return;}
  if(level.id===CAMPAIGN_COUNT){showRandomMenu();return;}
  void startLevel(level.id+1);
}
function showSaveState():void {const state=getSaveStatus();openModal('save-status',`<h2>${state.status==='saved'?'进度已妥善保存。':state.status==='local'?'恢复日志已保留。':'先把这份进度留好。'}</h2><p>${escapeText(state.message)||'盘面、撤回和已用的帮助会一起保存。'}</p>${artButton('export-save','导出恢复记录')}${artButton('import-save','导入恢复记录',{secondary:true})}${artButton('retry-save','重试保存',{secondary:true})}<p class="small-note">导入会使用文件中的进度，当前记录会先留存一份副本。</p>${artButton('close-modal','返回',{secondary:true})}`);}

function chooseRecovery():void {
  saveNow();const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{
    const restored=await importRecovery(await file.text(),save);
    // 先结束旧引擎，防止回到首页时把导入状态覆盖成旧局。
    generation++;services.cancelHint();presenter?.cancel();presenter=null;view?.destroy();view=null;engine=null;level=null;mode='home';
    Object.assign(save,restored.data);setCurrentRun(restored.run);applySettings();showHome();toast(restored.run?'已导入盘面和撤回记录，可继续这一局。':'已导入画册、材料和成绩。');
  }catch(error){toast(error instanceof Error?error.message:'恢复文件未能读取，当前记录保持原样。',6000);}};input.click();
}


function showSettings():void {
  const returnTo=modal==='pause'?'pause':modal==='settings'?modalReturn:null;
  openModal('settings',`<h2>玩得舒服一点</h2><div class="settings-list">${[
    ['sound','音效','拧出、入盒、回流、落板和通关的小声音'],['reducedMotion','轻柔动效','减少庆祝、飞行和界面动效'],['colorLabels','颜色辅助','钉头内显示清晰字标，盒子和暂存显示色名'],
  ].map(([key,name,description])=>`<button class="setting-row" data-action="setting" data-key="${key}" aria-pressed="${save.settings[key as keyof typeof save.settings]}"><span><strong>${name}</strong><small>${description}</small></span><span class="setting-state">${save.settings[key as keyof typeof save.settings]?'开启':'关闭'}</span></button>`).join('')}</div><p class="small-note">进度自动保存在这个浏览器里。</p>${artButton('close-settings','设置好了',{secondary:true})}`);
  modalReturn=returnTo;
}

function showLevels():void {
  const allowAll=import.meta.env.DEV||import.meta.env.MODE==='verification';
  const volumeDone=volumeCompleted(save.artworkProgress);
  openModal('levels',`<h2>主线八关。</h2><p class="small-note">已通关 ${save.completed.length} / ${CAMPAIGN_COUNT}${volumeDone?' · 这一卷已收齐':''}</p><div class="level-grid">${CAMPAIGN_TITLES.map(item=>{
    const unlocked=allowAll||item.id<=save.unlocked;
    const best=campaignBest(save,item.id);
    const marks=rankMarks(best?.rank);
    const status=save.completed.includes(item.id)?markRow(marks,RANK_NAMES[best!.rank]):unlocked?item.total+' 颗':'未到达';
    return `<button class="level-tile ${save.completed.includes(item.id)?'level-complete':''}" data-action="level" data-level="${item.id}" ${unlocked?'':'disabled'} aria-label="第 ${item.id} 关 ${escapeText(item.name)}${best?'，'+RANK_NAMES[best.rank]:''}">${icon(3,'level-tile-art')}<strong>${String(item.id).padStart(2,'0')}</strong><b>${item.name}</b><span>${status}</span></button>`;
  }).join('')}</div>${artButton('random-menu','残局与主题精修',{secondary:true})}`,{wide:true});
}

function showAlbum():void {
  audio.play('album');
  const showEncore=encoreUnlocked(save.artworkProgress);
  const visible=ARTWORKS.filter((_,index)=>index<ALBUM_VOLUME_COUNT||showEncore);
  const nextArt=visible.findIndex((art,index)=>save.artworkProgress[index]<art.columns*art.rows);
  const volumeDone=volumeCompleted(save.artworkProgress);
  const note=save.album.length===ARTWORKS.length?'画都收齐了。':volumeDone?'这一卷收齐了。':save.materialBalance?'还存着 '+save.materialBalance+' 颗。':'先拆出材料，再把画填上。';
  openModal('album',`<h2>Doro 的螺丝画册</h2>${save.starterSticker?'<div class="starter-album"><img src="'+starterImage()+'" alt="开工纪念Doro贴纸"><div><strong>开工纪念</strong><small>完成第一关得到的小纪念。</small></div></div>':''}${stampRow(save.titles)}<p class="small-note">${note}</p><div class="album-grid">${visible.map((art,index)=>{
    const unlocked=save.album.includes(art.id),amount=save.artworkProgress[index],total=art.columns*art.rows;
    const encoreHead=index===ALBUM_VOLUME_COUNT?'<p class="album-encore-label">后来</p>':'';
    return `${encoreHead}<button class="album-card ${unlocked?'':'album-in-progress'}${index>=ALBUM_VOLUME_COUNT?' album-encore':''}" data-action="album-card" data-album="${art.id}" ${unlocked||index===nextArt?'':'disabled'}>${unlocked?`<img src="${assetUrl(`album-${art.id}.png`,'thumb')}" alt="${art.title}" loading="lazy">`:doro(index%6,'locked-doro')}<strong>${art.title}</strong><span>${unlocked?'已经收好':index===nextArt?`${amount} / ${total}`:'下一幅'}</span></button>`;
  }).join('')}</div>`,{wide:true});
}

function showAlbumCard(id:number):void {if(!save.album.includes(id)){showArtwork(id-1);return;}showArtwork(id-1);}

function showArtwork(preferred?:number):void {
  const first=ARTWORKS.findIndex((art,i)=>save.artworkProgress[i]<art.columns*art.rows),index=preferred??first;if(index<0||index>=ARTWORKS.length){showAlbum();return;}artworkIndex=index;artHighDefinition=false;
  const art=ARTWORKS[index],total=art.columns*art.rows,progress=save.artworkProgress[index];
  openModal('artwork',`<div class="artwork-dialog"><h2>${art.title}</h2><div class="artwork-stage artwork-frame"><canvas aria-label="逐颗螺丝完成的 Doro 点阵作品"></canvas><img class="artwork-hd" hidden alt="${art.title}高清原图"></div><div class="artwork-meter"><span data-art-progress>${Math.round(progress/total*100)}% · ${progress} / ${total}</span><div class="progress-track">${sprite('button',0,'progress-art progress-base')}<span data-art-fill>${sprite('button',0,'progress-art')}</span></div></div><p class="artwork-balance">还存着 <strong data-art-balance>${save.materialBalance}</strong> 颗螺丝</p>${artButton('art-shoot','按住，一颗颗填入',{className:'artwork-launch',attrs:'data-art-launch'})}<div class="artwork-controls">${artButton('art-fill','一次填入',{secondary:true})}${artButton('album','查看画册',{secondary:true})}</div><button class="art-hd-toggle text-tool" data-action="art-hd" hidden>欣赏高清原图</button></div>`,{wide:true});
  const container=document.querySelector<HTMLElement>('.artwork-dialog')!;
  const stage=document.createElement('p');stage.dataset.artStage='';container.querySelector('.artwork-meter')!.insertAdjacentElement('afterend',stage);
  const update=()=>{const button=container.querySelector<HTMLButtonElement>('[data-art-launch]')!,complete=save.artworkProgress[index]>=total,busy=artwork?.busy??false;button.disabled=busy;button.dataset.action=complete?'art-claim':save.materialBalance?'art-shoot':'art-next';button.querySelector('.button-label')!.textContent=busy?'正在填入螺丝…':complete?'收下这只 Doro':save.materialBalance?'按住填入 · 越按越快':'继续拆螺丝';const fill=container.querySelector<HTMLButtonElement>('[data-action="art-fill"]')!;fill.disabled=complete||busy||!save.materialBalance;fill.hidden=complete;container.querySelector<HTMLElement>('[data-action="art-hd"]')!.hidden=!complete;container.querySelector('[data-art-balance]')!.textContent=String(save.materialBalance);};
  artwork=new ScrewArtwork(container,save,index,update,()=>{audio.play('win');update();persistSave(save);});update();
}


async function showShareCard():Promise<void>{
  if(!engine||!level){toast('先完成或打开一局，再收下成绩卡。');return;}
  const rating=quietRating(engine.state,save.records[engine.state.attemptId]);
  const spec=buildShareSpec(level,engine.state,rating,save.titles.map(titleName));
  try{
    const logo=new Image();
    logo.crossOrigin='anonymous';
    const src=assetUrl('logo.png');
    const ready=new Promise<HTMLImageElement|null>(resolve=>{
      const timer=window.setTimeout(()=>resolve(null),1200);
      logo.onload=()=>{window.clearTimeout(timer);resolve(logo);};
      logo.onerror=()=>{window.clearTimeout(timer);resolve(null);};
    });
    logo.src=src;
    const canvas=createShareCanvas(spec,await ready);
    const url=canvas.toDataURL('image/png');
    if(modal&&modal!=='share-card')modalHistory.push(modal);
    openModal('share-card',`<h2>成绩卡</h2><img class="share-preview" alt="本局成绩卡" src="${url}"><input id="current-code" aria-label="当前挑战码" readonly value="${spec.code}"><div class="dialog-button-grid">${artButton('download-share','保存图片')}${artButton('copy-code','复制挑战码',{secondary:true})}</div>${artButton('close-modal','返回',{secondary:true})}`);
    const preview=document.querySelector<HTMLImageElement>('.share-preview');
    if(preview)preview.dataset.ready='1';
    (window as unknown as {__doroShareCanvas?:HTMLCanvasElement}).__doroShareCanvas=canvas;
  }catch(error){toast(error instanceof Error?error.message:'成绩卡没有生成。');}
}

function showRescue():void {react(3);showTools(true);}

function showWin(celebrate=true):void {
  if(!engine||!level)return;
  const previous=save.records[engine.state.attemptId];
  const beforeTitles=save.titles.slice();
  const rating=quietRating(engine.state,previous);
  const additional=awardVictory(save,engine.state,level.attempt??0);if(additional)earnedThisRound=additional;persistSave(save);if(celebrate)audio.play(level.mode==='campaign'&&level.id===2?'wall':'win');
  const stats=engine.state.stats,rankId=clearRank(stats),rank=RANK_NAMES[rankId],seconds=Math.max(1,Math.round(stats.elapsedMs/1000)),time=seconds>=60?`${Math.floor(seconds/60)} 分 ${seconds%60} 秒`:`${seconds} 秒`;
  const starter=level.contentVersion==='v4'&&(level.contentRevision??1)>=2&&level.mode==='campaign'&&level.id===1;
  const challenge=level.mode==='rescue'||level.mode==='mastery',legacy=level.contentVersion!=='v4'||(level.contentRevision??1)<2,finished=!legacy&&!challenge&&level.id===CAMPAIGN_COUNT;
  const goal=describeAlbumGoal(save.artworkProgress,save.materialBalance);
  const canPaint=save.materialBalance>0&&goal.completedCount<ARTWORKS.length;
  const nextText=challenge?'再来一局新编排':legacy?'回到主线':finished?'看看主题挑战':'继续下一关',count=engine.state.rewardableIds?.length??engine.state.screws.length;
  const newStamps=save.titles.filter(id=>!beforeTitles.includes(id));
  const goalTitle=goal.volumeComplete&&goal.completedCount<=ALBUM_VOLUME_COUNT?'这一卷收齐了':goal.title;
  const showEncoreMeter=goal.volumeComplete?goal.index>=ALBUM_VOLUME_COUNT&&goal.filled>=goal.total/4:goal.index>=0;
  const nextGoal=`<section class="next-goal"><span class="eyebrow">${goal.volumeComplete?'画册':'下一幅'}</span><strong>${goalTitle}</strong><p>${earnedThisRound?'这局收好 '+earnedThisRound+' 颗。':''}${goal.summary}</p>${showEncoreMeter&&goal.index>=0?`<p class="next-goal-meter">${goal.filled} / ${goal.total}${goal.volumeComplete?'': ' · '+goal.stageName}</p>`:''}</section>`;
  const quiet=`<div class="quiet-rating" aria-label="${rating.moves} 步，暂存最高 ${rating.peakBuffer} / ${rating.capacity}"><span class="rating-moves">${rating.moves} 步${rating.improvedMoves?'<small>新</small>':''}</span>${bufferDots(rating.peakBuffer,rating.capacity)}</div>`;
  modalHistory=[];
  openModal('win',`<div class="win-character">${starter?'<img class="starter-win" src="'+starterImage()+'" alt="抱着金色螺丝的开工纪念Doro">':sprite('fx',5,'win-burst')+doro(5,'dialog-doro')}</div><span class="eyebrow">${rank}</span><h2>${starter?'第一颗小成就，收好。':finished?'主线拆完了。':'这一局，全拆完了。'}</h2>${starter?'<p class="starter-note">开工纪念贴纸已收入画册</p>':''}${finished?'<p>主线收好了。</p>':''}${stampRow(newStamps)}<p class="win-stats">${level.mode==='rescue'?'本局新拆 ':''}${count} 颗 · ${time}</p>${quiet}${markRow(rankMarks(rankId),rank)}${nextGoal}${finished?artButton('artwork','去画册收下这一卷',{icon:15}):canPaint?artButton('artwork','先填进画册',{icon:15}):artButton('next',nextText,{icon:12})}<div class="dialog-button-grid">${artButton('share-card','收下成绩卡',{secondary:true})}${artButton('challenge','挑战码',{secondary:true})}</div>${finished?artButton('home','回到首页',{secondary:true}):artButton('home','回到首页',{secondary:true})}`,{closable:false});
}

function rewindToLastSolvable():void {
  if(!engine)return;services.cancelHint();hintSequence++;
  tickClock();
  const result=engine.rewindToSolvable();
  modal=null;modalHistory=[];modalReturn=null;lastDecision='';
  document.querySelector('#modal-root')!.innerHTML='';
  meltMode=false;view?.setMeltMode(false);view?.sync([],true);view?.setPaused(document.hidden);
  presenter?.reset(engine.snapshot());
  lastClockTime=performance.now();saveNow();updateTeaching();
  audio.play('undo');
  toast(result.reason);
  if(engine.state.phase==='stuck')showRescue();
}

function undo():void {
  if (!engine) return;services.cancelHint();hintSequence++;
  tickClock();
  if (!engine.undo()) {toast('还没有可以撤回的操作。');return;}
  audio.play('undo');
  modal=null;
  modalHistory=[];modalReturn=null;lastDecision='';
  document.querySelector('#modal-root')!.innerHTML='';
  meltMode=false;
  view?.setMeltMode(false);
  view?.sync([],true);
  view?.setPaused(document.hidden);
  presenter?.reset(engine.snapshot());
  lastClockTime=performance.now();
  saveNow();updateTeaching();
  toast('回到上一步，用时和已用辅助仍保留。');
  if(engine.state.phase==='stuck')showRescue();
}

function dispatchButton(button:HTMLElement):void {
  const action=button.dataset.action;
  if(mode==='game'&&!view&&action!=='home'&&action!=='retry'){if(action==='pause')showHome();return;}
  if(mode==='game'&&view)audio.unlock();
  if(action==='retry-image'){
    const image=button.previousElementSibling;
    if(image instanceof HTMLImageElement){image.src=image.dataset.originalSrc??image.src;button.remove();}
    return;
  }
  if (action==='start') {void startLevel(nextCampaignLevel());return;}
  if (action==='continue') {if(save.current)void startLevel(save.current.levelId,save.current);return;}
  if (action==='level') {confirmLaunch(()=>{void startLevel(Number(button.dataset.level));});return;}
  if (action==='endless') {if(endlessUnlocked()||import.meta.env.DEV)confirmLaunch(()=>{void startLevel(save.endlessNextId,undefined,0,'v4','endless',1);});else showRandomMenu();return;}
  if (action==='next') {launchNext();return;}
  if (action==='restart') {showRandomMenu();return;}
  if (action==='retry-same') {if(level){const current=level;confirmLaunch(()=>{void startLevel(current.id,undefined,current.attempt??0,current.contentVersion,current.mode,current.contentRevision);});}return;}
  if (action==='retry') {if(pendingStart){const p=pendingStart;void startLevel(p.id,engine?.snapshot()??p.saved,p.attempt,p.version,p.playMode,p.revision);}return;}
  if(action==='random-menu'){showRandomMenu();return;}
  if(action==='random-start'){startRandom(Number(document.querySelector<HTMLSelectElement>('#random-level')?.value??2));return;}
  if(action==='practice-start'){const playMode=button.dataset.playMode;if(playMode==='rescue'||playMode==='mastery')startPractice(Number(document.querySelector<HTMLSelectElement>('#random-level')?.value??2),playMode);return;}
  if(action==='daily-start'){const daily=dailyPractice();startPractice(daily.theme,'mastery',daily.attempt);return;}
  if(action==='records'){recordPage=0;showRecords();return;}
  if(action==='record-filter'){const filter=button.dataset.filter;if(filter==='campaign'||filter==='random'||filter==='legacy'){recordFilter=filter;recordPage=0;showRecords();}return;}
  if(action==='record-page'){recordPage=Math.max(0,Number(button.dataset.page)||0);showRecords();return;}
  if(action==='record-replay'){const record=save.records[button.dataset.record??''];if(record)confirmLaunch(()=>{void startLevel(record.levelId,undefined,record.attempt,record.contentVersion,record.mode,record.contentRevision??1);});return;}
  if(action==='set-goal'){const goal=button.dataset.goal;if(engine&&(goal==='complete'||goal==='independent'||goal==='clean')){engine.state.goal=goal;saveNow();updateHUD();showChallenge();}return;}
  if(action==='zoom-in'){view?.zoomBy(1.3);return;}
  if(action==='zoom-out'){view?.zoomBy(1/1.3);return;}
  if(action==='zoom-reset'){view?.resetCamera();return;}
  if(action==='zoom-toggle'){const menu=document.querySelector<HTMLElement>('.camera-menu');if(menu){menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));}return;}
  if(action==='save-status'){showSaveState();return;}
  if(action==='import-save'){chooseRecovery();return;}
  if(action==='retry-save'){lastSaveWarning=false;saveNow();void flushJournal().then(()=>{if(modal==='save-status')showSaveState();});return;}
  if(action==='export-save'){saveNow();const text=exportRecovery(save),name='Doro-V4-恢复记录-'+new Date().toISOString().slice(0,10)+'.json';const handed=window.__DORO_MAPP__?.saveFile;if(handed){void Promise.resolve(handed(name,text)).then(()=>toast('恢复记录已导出，请保存好这份文件。')).catch(()=>toast('未能导出文件，可先复制文本备份。'));return;}const blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('恢复记录已导出，请保存好这份文件。');return;}
  if(action==='confirm-launch'){const launch=pendingLaunch;pendingLaunch=null;launch?.();return;}
  if(action==='cancel-launch'){pendingLaunch=null;closeModal();return;}
  if(action==='help'){showHelp();return;}
  if(action==='skip-tutorial'){if(!save.tutorialSeen.includes('skip'))save.tutorialSeen.push('skip');saveNow();closeModal();updateTeaching();return;}
  if(action==='tools'){meltMode=false;view?.setMeltMode(false);showTools();return;}
  if(action==='pocket'){showPocket();return;}
  if(action==='hint'){showHint();return;}
  if(action==='hint-relations'){void requestRelations();return;}
  if(action==='hint-arrow'){void requestHint();return;}
  if(action==='challenge'){showChallenge();return;}
  if(action==='copy-code'){const input=document.querySelector<HTMLInputElement>('#current-code');if(input){input.focus();input.select();input.setSelectionRange(0,input.value.length);const canClipboard=!import.meta.env.DORO_MAPP&&!!navigator.clipboard?.writeText;if(canClipboard){void navigator.clipboard.writeText(input.value).then(()=>toast('挑战码已复制')).catch(()=>toast('长按选中这段挑战码即可复制。'));}else toast('长按选中这段挑战码即可复制。');}return;}
  if(action==='import-code'){const input=document.querySelector<HTMLInputElement>('#challenge-input'),read=readChallengeCode(input?.value??'');const error=document.querySelector('#code-error');if(!read.ok){if(error)error.textContent=read.reason;return;}const parsed=read.value;if(parsed.contentVersion==='v4'&&((parsed.mode==='random'&&!randomUnlocked())||(parsed.mode==='endless'&&!endlessUnlocked()))){if(error)error.textContent=parsed.mode==='random'?'完成第二关后可打开随机挑战。':'完成三十关后可打开无尽挑战。';return;}if((parsed.contentRevision??1)>=2&&(parsed.mode==='rescue'||parsed.mode==='mastery')&&!themeUnlocked(parsed.levelId)){if(error)error.textContent='完成主线第 '+practiceCampaignId(parsed.levelId)+' 关后即可打开这个主题。';return;}confirmLaunch(()=>{void startLevel(parsed.levelId,undefined,parsed.attempt,parsed.contentVersion,parsed.mode,parsed.contentRevision??1);});return;}
  if(action==='share-card'){void showShareCard();return;}
  if(action==='download-share'){const canvas=(window as unknown as {__doroShareCanvas?:HTMLCanvasElement}).__doroShareCanvas;if(!canvas){void showShareCard();return;}void shareOrDownloadCard(canvas).then(way=>toast(way==='shared'?'已交给系统分享。':'成绩卡已保存。')).catch(()=>toast('成绩卡没有保存，可长按图片另存。'));return;}
  if (action==='home') {showHome();return;}
  if (action==='levels') {showLevels();return;}
  if (action==='album') {showAlbum();return;}
  if (action==='artwork') {showArtwork();return;}
  if (action==='art-next') {if(engine?.state.phase==='playing'||engine?.state.phase==='stuck')closeModal();else if(engine?.state.phase==='won')launchNext();else void startLevel(nextCampaignLevel());return;}
  if (action==='art-claim') {if(save.artworkProgress.every((filled,index)=>index>=ARTWORKS.length||filled>=ARTWORKS[index].columns*ARTWORKS[index].rows))showAlbum();else showArtwork();return;}
  if(action==='art-fill'){artwork?.fillAll();return;}
  if(action==='art-hd'){const image=document.querySelector<HTMLImageElement>('.artwork-hd'),canvas=document.querySelector<HTMLElement>('.artwork-stage canvas');if(image&&canvas&&save.album.includes(artworkIndex+1)){artHighDefinition=!artHighDefinition;if(artHighDefinition&&!image.src){const src=assetUrl('album-'+(artworkIndex+1)+'.png','hd');if(!src){toast('这个微应用包没有附带高清原图。');artHighDefinition=false;return;}image.src=src;}image.hidden=!artHighDefinition;canvas.hidden=artHighDefinition;button.textContent=artHighDefinition?'看看螺丝点阵':'欣赏高清原图';}return;}
  if (action==='art-retry') {artwork?.reload();return;}
  if (action==='art-shoot') {artwork?.start();window.setTimeout(()=>artwork?.stop(),100);return;}
  if (action==='album-card') {showAlbumCard(Number(button.dataset.album));return;}
  if (action==='pause') {showPause();return;}
  if (action==='settings') {showSettings();return;}
  if (action==='resume') {modalHistory=[];modalReturn=null;closeModal();return;}
  if (action==='close-modal'||action==='close-settings') {closeModal();return;}
  if (action==='sound') {
    save.settings.sound=!save.settings.sound;
    applySettings();saveNow();updateHUD();
    if(save.settings.sound)audio.play('ui');
    return;
  }
  if (action==='setting') {
    const key=button.dataset.key as keyof typeof save.settings;
    if (!['sound','reducedMotion','colorLabels'].includes(key)) return;
    save.settings[key]=!save.settings[key];
    applySettings();saveNow();view?.sync([],true);updateHUD();
    button.setAttribute('aria-pressed',String(save.settings[key]));
    button.querySelector('.setting-state')!.textContent=save.settings[key]?'开启':'关闭';
    if(key==='sound'&&save.settings.sound)audio.play('ui');
    return;
  }
  if (!engine || !view) return;
  if (action==='undo' || action==='undo-rescue') {undo();return;}
  if (action==='rewind-solvable') {rewindToLastSolvable();return;}
  if(action?.startsWith('use-')){
    const type=action.slice(4);modal=null;modalReturn=null;document.querySelector('#modal-root')!.innerHTML='';view.setPaused(document.hidden);lastClockTime=performance.now();
    if(type==='melt'){meltMode=true;view.setMeltMode(true);view.setHint(null);showBoardTip('点一块玻璃融化它。再次打开辅助可取消。');return;}
    if(type==='expand-box'||type==='expand-buffer'||type==='clear-buffer'){runAction({type});react(4);delight.onAssist();return;}
  }
  if(modal)return;



}

app.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest<HTMLElement>('[data-action]'):null;
  // 发射手势的合成 click 不再领取刚完成的作品，也不在松手后补射。
  const consumedPointer=artPointerClickTarget!==null&&target===artPointerClickTarget&&event.detail>0;
  artPointerClickTarget=null;
  if(consumedPointer){event.preventDefault();return;}
  if(target && !target.hasAttribute('disabled'))dispatchButton(target);
});
app.addEventListener('pointerdown',event=>{
  audio.unlock();
  if(event.target instanceof Element&&!event.target.closest('.board-camera')){const menu=document.querySelector<HTMLElement>('.camera-menu');if(menu){menu.hidden=true;document.querySelector('[data-action="zoom-toggle"]')?.setAttribute('aria-expanded','false');}}
  delight.noteInput();
  if(!event.isPrimary||event.button!==0)return;
  const target=event.target instanceof Element?event.target.closest<HTMLElement>('[data-action="art-shoot"]'):null;
  artPointerClickTarget=target;
  if(target&&!target.hasAttribute('disabled')){event.preventDefault();target.setPointerCapture(event.pointerId);artwork?.start();}
});
app.addEventListener('pointerup',event=>{if(event.isPrimary)artwork?.stop();});
app.addEventListener('pointercancel',event=>{if(event.isPrimary){artwork?.stop();artPointerClickTarget=null;}});
app.addEventListener('error',event=>{
  const image=event.target;
  if(!(image instanceof HTMLImageElement)||image.nextElementSibling?.matches('[data-action="retry-image"]'))return;
  image.dataset.originalSrc=image.src;
  const retry=document.createElement('button');
  retry.className='image-retry';
  retry.dataset.action='retry-image';
  retry.textContent='图片加载失败 · 点此重试';
  image.insertAdjacentElement('afterend',retry);
},true);
document.addEventListener('keydown',event=>{
  delight.noteInput();
  if (event.key==='Escape') {
    if(mode==='game'&&!view){showHome();return;}
    if(modal==='rescue'||modal==='win'||modal==='error')return;
    if(modal)closeModal();else if(mode==='game')showPause();
  }
  if (event.key==='Tab' && modal) {
    const targets=[...document.querySelectorAll<HTMLElement>('.dialog button:not([disabled]),.dialog input')];
    const first=targets[0],last=targets[targets.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
});
document.addEventListener('visibilitychange',()=>{
  lastClockTime=performance.now();
  if(document.hidden){
    presenter?.flush();artwork?.stop();saveNow();view?.setPaused(true);audio.suspend();
    // 微应用要求离开可见区域时暂停游戏；网站版仍只停物理和计时，不强制弹出暂停页。
    if(import.meta.env.DORO_MAPP&&mode==='game'&&!['pause','win','rescue','error'].includes(modal??''))showPause();
  }
  else {view?.setPaused(Boolean(modal));audio.unlock();}
});
window.addEventListener('pagehide',()=>{presenter?.flush();artwork?.stop();saveNow();view?.setPaused(true);audio.suspend();});
window.addEventListener('pageshow',()=>{lastClockTime=performance.now();view?.setPaused(Boolean(modal)||document.hidden);});
window.addEventListener('resize',()=>{presenter?.flush();view?.invalidateLayout();});
window.addEventListener('orientationchange',()=>{presenter?.flush();view?.invalidateLayout();});
visualViewport?.addEventListener('resize',()=>{presenter?.flush();view?.invalidateLayout();});
document.addEventListener('gesturestart',event=>event.preventDefault());
document.addEventListener('gesturechange',event=>event.preventDefault());
function clockFrame(time:number){tickClock(time);requestAnimationFrame(clockFrame);}
requestAnimationFrame(clockFrame);
window.setInterval(()=>{
  if(save&&mode==='game'&&engine&&!document.hidden)saveNow();
},5000);

export async function bootGame():Promise<void> {
  loaded=await loadSaveAsync();
  save=loaded.data;
  audio=new GameAudio(save.settings.sound);
  applySettings();
  showHome();
  if(loaded.warning)toast(loaded.warning,5500);
  if(import.meta.env.DEV||import.meta.env.MODE==='verification'||import.meta.env.DORO_MAPP&&new URLSearchParams(location.search).has('check')||new URLSearchParams(location.search).has('check')) {
    Object.defineProperty(window,'__DORO__',{value:{get engine(){return engine;},get view(){return view;},get level(){return level;},get presenter(){return presenter;},observe:()=>engine?observeVisible(engine.state):null,prepareLevel:(id:number,attempt=0)=>services.prepare(id,attempt),startLevel,pick,showHome,showAlbum,showLevels,showRecords,showWin,showShareCard,showRandomMenu,showChallenge,get save(){return save;},get artwork(){return artwork;},delight},configurable:true});
  }
}
if(!import.meta.env.DORO_MAPP)void bootGame();


