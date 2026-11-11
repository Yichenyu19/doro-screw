import {blockingBoards,remainingOnBoard,screwPosition} from './geometry';
import {COLOR_NAMES,type ColorId,type GameState,type Vec2} from './types';
export interface VisibleObservation {
 runId:string;revision:number;capacity:number;buffer:Array<ColorId|null>;preview:ColorId[];
 boxes:Array<{color:ColorId|null;count:number}>;
 plates:Array<{id:string;pins:number;moving:boolean}>;
 pins:Array<{id:string;boardId:string;color:ColorId;position:Vec2;blockers:string[];pickable:boolean}>;
}
export interface VisibleDiagnosis {summary:string;relations:string[];choices:Array<{id:string;score:number;basis:string}>;source:'visible-only'}
export function readablePins(state:GameState){
 const boards=new Map(state.boards.map(b=>[b.id,b]));
 return state.screws.filter(s=>{const b=boards.get(s.boardId);return s.place==='board'&&b?.active!==false&&!!b&&(!b.gone||s.detached);}).map(s=>({screw:s,board:boards.get(s.boardId)!,blockers:blockingBoards(state,s.id)})).filter(p=>(state.contentRevision??1)<2||p.blockers.length<=1);
}
/** 只序列化画面已显示的钉、板、当前盒和两盒预告；隐藏后备组与之后盒序不进入诊断接口。 */
export function observeVisible(state:GameState):VisibleObservation{
 const visible=readablePins(state),ids=new Set(visible.flatMap(p=>[p.board.id,...p.blockers])),boards=state.boards.filter(b=>ids.has(b.id)&&!b.gone&&!b.melted);
 return{runId:state.runId,revision:state.actionRevision,capacity:state.capacity,buffer:state.buffer.map(id=>state.screws.find(s=>s.id===id)?.color??null),preview:state.boxQueue.slice(state.queueCursor,state.queueCursor+2),boxes:state.boxes.map(b=>({color:b.color,count:b.screws.length})),plates:boards.map(b=>({id:b.id,pins:visible.filter(p=>p.board.id===b.id).length,moving:b.falling||remainingOnBoard(state,b.id).length===1})),pins:visible.map(({screw:s,board,blockers})=>({id:s.id,boardId:s.boardId,color:s.color,position:screwPosition(s,board),blockers,pickable:state.phase==='playing'&&!blockers.length}))};
}
export function diagnoseVisible(observation:VisibleObservation):VisibleDiagnosis{
 const {pins,boxes,plates}=observation,free=observation.buffer.filter(c=>c===null).length,boxFor=(c:ColorId)=>boxes.find(b=>b.color===c),matching=pins.filter(p=>boxFor(p.color)),open=matching.filter(p=>p.pickable),blocked=matching.filter(p=>!p.pickable),common=new Map<string,number>();
 for(const p of blocked)for(const b of p.blockers)common.set(b,(common.get(b)??0)+1);
 const shared=[...common].sort((a,b)=>b[1]-a[1]),relations:string[]=[];
 for(const box of boxes){if(!box.color)continue;const visible=pins.filter(p=>p.color===box.color&&p.pickable).length;relations.push(`${COLOR_NAMES[box.color]}盒还缺 ${3-box.count} 颗，当前可拆的同色钉有 ${visible} 颗。`);}
 if(shared[0]){const plate=plates.find(b=>b.id===shared[0][0]);relations.push(`一块还剩 ${plate?.pins??0} 钉的玻璃共同遮住了 ${shared[0][1]} 颗当前盒色。打开它可能同时释放这些入口，仍需留意其他挡板。`);}
 if(plates.some(p=>p.pins===1))relations.push('有单钉板正在摆动或已经悬挂。窗口未稳定时先等一会，长按会暂停物理供你检查。');
 if(free<=1)relations.push('只剩最后一个空孔：拿不进当前盒的颜色会触发救场。');
 const choices=pins.filter(p=>p.pickable&&(boxFor(p.color)||free>1)).map(p=>{
  const box=boxFor(p.color),plate=plates.find(b=>b.id===p.boardId),release=common.get(p.boardId)??0,score=(box?50+box.count*35:0)+(release?release*14/Math.max(1,plate?.pins??1):0)+(plate?.pins===1?6:0)+(!box&&observation.preview[0]===p.color?5:0)-(!box?(6-free)*8:0);
  return{id:p.id,score,basis:box?`直接补入${COLOR_NAMES[p.color]}盒` :release?`为 ${release} 颗当前盒色解除遮挡；这一步需暂存`:'当前两盒预告和空孔数量支持的局部尝试，尚未证明后续可解'};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return{source:'visible-only',summary:`当前可拆盒色 ${open.length} 颗，被挡盒色 ${blocked.length} 颗，空孔 ${free} 个。`,relations,choices};
}
