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
export function teachingTip(level:LevelDef,state:GameState,events:GameEvent[],seen:string[]):string|null{
  if(seen.includes('skip'))return '';
  const modern=level.mode==='campaign'&&level.id===1&&(level.contentRevision??0)>=2;
  if(modern){
    const names=state.boxes.map(b=>b.color).filter((c):c is NonNullable<typeof c>=>!!c).map(c=>COLOR_NAMES[c]);
    const boxText=names.length?names.join('和'):'当前盒色';
    if(state.moves===0)return `先看上面两个盒子：${boxText}还压在长板下面。红钉和棕钉会先占暂存孔。我帮你盯着空位。`;
    if(events.some(e=>e.type==='routed'&&e.sourcePlace==='buffer'&&e.destination==='box'))return '新盒子把暂存里的同色钉接回去了，空孔腾出来了。';
    if(events.some(e=>e.type==='board-released'&&e.remaining===1))return '只剩一颗钉了，这块板会绕着它摆开。窗口下面的盒色马上能看见。';
    if(events.some(e=>e.type==='routed'&&e.destination==='buffer'))return '这两颗不是当前盒色，先在孔里等着。有空位我会盯着。';
    if(occupiedBuffer(state)>0)return '其他颜色先在孔里待着。先把能开窗口的钉拆掉，我帮你盯着空位。';
    return '同色三颗装一盒。留下合适的支点，下面的入口才会露出来。';
  }
  if(events.some(e=>e.type==='group-revealed'))return '新的一层露出来了。先看当前盒色，再安排空孔。';
  return null;
}
