import {occupiedBuffer} from './core';
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
export function teachingTip(level:LevelDef,state:GameState,events:GameEvent[],seen:string[]):string|null{
  if(seen.includes('skip'))return '';
  const campaign=level.mode==='campaign'&&(level.contentRevision??0)>=2;
  if(campaign&&level.id===1){
    if(state.moves===0)return `盒子要${boxText(state)}，这两种已经露出来了。先点它们。`;
    if(events.some(e=>e.type==='box-completed')&&state.stats.boxesCompleted===1)return '同色三颗就装满了。下一盒接着收。';
    if(events.some(e=>e.type==='board-released'&&e.remaining===1&&e.boardId.endsWith('-gate')))return '中间这块板还留着一颗，它会自己摆开。';
    if(events.some(e=>e.type==='routed'&&e.sourcePlace==='buffer'&&e.destination==='box'))return '同色盒子来了，孔里的钉会自己回去。';
    if(events.some(e=>e.type==='routed'&&e.destination==='buffer'))return '先放在孔里也没关系，同色盒来了会接回去。';
    return '先点和上面盒子一样的颜色。';
  }
  if(campaign&&level.id===2&&(level.contentRevision??0)>=4){
    if(state.moves===0)return `120 颗的墙。先看盒子要的是${boxText(state)}。过不去用免费辅助。`;
    if(events.some(e=>e.type==='routed'&&e.sourcePlace==='buffer'&&e.destination==='box'))return '同色钉接回去了。先装箱，再看下一座桥。';
    if(events.some(e=>e.type==='routed'&&e.destination==='buffer'))return '先放在孔里也行。空孔要省着花。';
    if(events.some(e=>e.type==='board-released'&&e.remaining===0))return '桥板落下了，两边的盒色露出来了。先装箱。';
    return '先看当前盒色，再决定空孔花在哪座桥。';
  }
  if(campaign&&level.id===2){
    if(state.moves===0)return `这座桥上的三颗会先占三个空孔。先看盒子要的是${boxText(state)}，再决定拆不拆桥。`;
    if(events.some(e=>e.type==='routed'&&e.sourcePlace==='buffer'&&e.destination==='box'))return '同色钉接回去了，空孔腾出来了。开桥前先看还剩几孔。';
    if(events.some(e=>e.type==='routed'&&e.destination==='buffer'))return '这两颗会先在孔里等着。这座桥要占三孔。';
    if(events.some(e=>e.type==='board-released'&&e.remaining===0))return '桥板落下后，两边的盒色会一起露出来。先装箱。';
    return '先看当前盒色，再决定空孔花在桥上还是两边。';
  }
  if(events.some(e=>e.type==='group-revealed'))return '新的一层露出来了。先看当前盒色。';
  return null;
}
