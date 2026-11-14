import {isScrewExposed,remainingOnBoard} from './geometry';
import {COLOR_NAMES} from './types';
import type {GameEvent,GameState,LevelDef} from './types';
export function tutorialEvidence(level:LevelDef,before:GameState|undefined,events:GameEvent[]):Array<'buffer'|'refill'|'hinge'>{
 const found:Array<'buffer'|'refill'|'hinge'>=[];
 if(events.some(e=>e.type==='routed'&&e.destination==='buffer'))found.push('buffer');
 if(events.some(e=>e.type==='routed'&&e.sourcePlace==='buffer'&&e.destination==='box'))found.push('refill');
 if(before&&level.hinge){
  const rule=level.hinge,board=before.boards.find(b=>b.id===rule.boardId),original=level.boards.find(b=>b.id===rule.boardId);
  if(board&&original&&!board.melted&&remainingOnBoard(before,board.id).length===1&&Math.abs(board.angle-original.angle)>.12&&events.some(e=>e.type==='picked'&&rule.targetIds.includes(e.screwId)&&!before.screws.find(s=>s.id===e.screwId)?.detached&&isScrewExposed(before,e.screwId)))found.push('hinge');
 }
 return found;
}
export function teachingFlags(events:GameEvent[]):string[]{
  const flags:string[]=[];
  if(events.some(e=>e.type==='routed'&&e.destination==='buffer'))flags.push('buffer-tip');
  if(events.some(e=>e.type==='board-released'&&e.remaining===1))flags.push('window-tip');
  if(events.some(e=>e.type==='routed'&&e.sourcePlace==='buffer'&&e.destination==='box'))flags.push('refill-tip');
  return flags;
}
function boxText(state:GameState):string{
  const names=state.boxes.map(b=>b.color).filter((c):c is NonNullable<typeof c>=>!!c).map(c=>COLOR_NAMES[c]);
  return names.length?names.join('和'):'当前盒色';
}
export interface TeachingCue {key:string;text:string}
function take(seen:string[],key:string,text:string):TeachingCue|null{
  return seen.includes(key)?null:{key,text};
}
/** 每个关键事件只说一次；没有新事件时返回 null，由界面把旧提示清掉。 */
export function teachingCue(level:LevelDef,state:GameState,events:GameEvent[],seen:string[]):TeachingCue|null{
  if(seen.includes('skip'))return null;
  const campaign=level.mode==='campaign'&&(level.contentRevision??0)>=2;
  if(campaign&&(level.contentRevision??0)>=4)return null;
  if(campaign&&level.id===1){
    if(state.moves===0)return take(seen,'l1-open',`盒子要${boxText(state)}，这两种已经露出来了。先点它们。`);
    if(events.some(e=>e.type==='box-completed')&&state.stats.boxesCompleted===1)return take(seen,'l1-box','同色三颗就装满了。下一盒接着收。');
    if(events.some(e=>e.type==='board-released'&&e.remaining===1&&e.boardId.endsWith('-gate')))return take(seen,'l1-hinge','中间这块板还留着一颗，它会自己摆开。');
    if(events.some(e=>e.type==='routed'&&e.sourcePlace==='buffer'&&e.destination==='box'))return take(seen,'l1-refill','同色盒子来了，孔里的钉会自己回去。');
    if(events.some(e=>e.type==='routed'&&e.destination==='buffer'))return take(seen,'l1-buffer','先放在孔里也没关系，同色盒来了会接回去。');
    return null;
  }
  if(campaign&&level.id===2){
    if(state.moves===0)return take(seen,'l2-r3-open',`这座桥上的三颗会先占三个空孔。先看盒子要的是${boxText(state)}，再决定拆不拆桥。`);
    if(events.some(e=>e.type==='routed'&&e.sourcePlace==='buffer'&&e.destination==='box'))return take(seen,'l2-r3-refill','同色钉接回去了，空孔腾出来了。开桥前先看还剩几孔。');
    if(events.some(e=>e.type==='routed'&&e.destination==='buffer'))return take(seen,'l2-r3-buffer','这两颗会先在孔里等着。这座桥要占三孔。');
    if(events.some(e=>e.type==='board-released'&&e.remaining===0))return take(seen,'l2-r3-bridge','桥板落下后，两边的盒色会一起露出来。先装箱。');
    return null;
  }
  if(events.some(e=>e.type==='group-revealed'))return take(seen,'reveal-'+state.levelId+'-'+(state.revealState?.opened.length??0),'新的一层露出来了。先看当前盒色。');
  return null;
}
export function teachingTip(level:LevelDef,state:GameState,events:GameEvent[],seen:string[]):string|null{
  if(seen.includes('skip'))return '';
  return teachingCue(level,state,events,seen)?.text??null;
}
export function teachingStageKey(level:LevelDef):string{
  return `stage-${level.contentRevision??1}-${level.mode}-${level.id}`;
}
