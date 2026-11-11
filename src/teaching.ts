import {isScrewExposed,remainingOnBoard} from './geometry';
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
