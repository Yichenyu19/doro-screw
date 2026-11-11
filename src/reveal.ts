import {blockingBoards,isScrewExposed,remainingOnBoard} from './geometry';
import type {GameEvent,GameState,RevealPacket} from './types';

function prerequisites(state:GameState,packet:RevealPacket):boolean {
  return packet.requiresCleared.every(id=>{
    const board=state.boards.find(b=>b.id===id);
    return !!board&&board.active!==false&&(board.melted||remainingOnBoard(state,id).length===0);
  })&&(packet.requiresRemoved??[]).every(id=>state.screws.some(s=>s.id===id&&s.place!=='board'));
}

/** 仅推进已写入蓝图的下一包；在与真实物理相同的时间步上调用。 */
export function advanceReveal(state:GameState,milliseconds:number):GameEvent[] {
  const plan=state.revealPlan,progress=state.revealState;
  if(!plan||!progress||state.phase!=='playing'||milliseconds<=0)return [];
  const packet=plan.packets.find(p=>!progress.opened.includes(p.id));
  if(!packet)return [];
  if(!prerequisites(state,packet)){
    progress.pendingId=null;progress.lowEntryMs=0;return [];
  }
  const exposed=[];
  for(const screw of state.screws)if(isScrewExposed(state,screw.id)){exposed.push(screw);if(exposed.length>plan.threshold){progress.pendingId=null;progress.lowEntryMs=0;return [];}}
  if(progress.pendingId!==packet.id){progress.pendingId=packet.id;progress.lowEntryMs=0;}
  progress.lowEntryMs+=Math.min(milliseconds,100);
  if(progress.lowEntryMs+1e-6<plan.stableMs)return [];
  const boards=packet.boardIds.map(id=>state.boards.find(b=>b.id===id)).filter(b=>b!==undefined);
  if(boards.length!==packet.boardIds.length||boards.some(b=>b.active!==false))throw Error('显层蓝图与盘面不一致');
  // 以当前物理姿态核对，后备板不得重新遮住任何已开放的入口。
  for(const board of boards)board.active=true;
  const coversOpen=exposed.some(s=>blockingBoards(state,s.id).some(id=>packet.boardIds.includes(id)));
  if(coversOpen){for(const board of boards)board.active=false;return [];}
  progress.opened.push(packet.id);progress.pendingId=null;progress.lowEntryMs=0;
  state.actionRevision++;
  return [{type:'group-revealed',group:progress.opened.length,boardIds:[...packet.boardIds]}];
}
