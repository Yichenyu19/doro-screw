import {blockingBoards,boardBounds,screwPosition,SCREW_RADIUS} from './geometry';
import type {BoardState,GameState} from './types';
type Rect={minX:number;minY:number;maxX:number;maxY:number};
interface Stamp {x:number;y:number;angle:number;active:boolean;gone:boolean;melted:boolean;depth:number;width:number;height:number;rect:Rect|null}
/** 只重新检查移动板件旧、新包围盒涉及的钉；点击时仍执行完整几何判定。 */
export class VisibilityCache {
  readonly exposed=new Set<string>();readonly readable=new Set<string>();
  private previous=new Map<string,Stamp>();private state:GameState|null=null;
  clear():void{this.previous.clear();this.exposed.clear();this.readable.clear();this.state=null;}
  update(state:GameState):number {
    const all=this.state!==state;if(all)this.clear();this.state=state;
    const regions:Rect[]=[],changed=new Set<string>(),boards=new Map<string,BoardState>();
    for(const board of state.boards){
      boards.set(board.id,board);const old=this.previous.get(board.id),active=board.active!==false;
      if(old&&old.x===board.x&&old.y===board.y&&old.angle===board.angle&&old.active===active&&old.gone===board.gone&&old.melted===board.melted&&old.depth===board.depth&&old.width===board.width&&old.height===board.height)continue;
      const rect=active&&!board.gone&&!board.melted?boardBounds(board):null;if(old?.rect)regions.push(old.rect);if(rect)regions.push(rect);changed.add(board.id);
      this.previous.set(board.id,{x:board.x,y:board.y,angle:board.angle,active,gone:board.gone,melted:board.melted,depth:board.depth,width:board.width,height:board.height,rect});
    }
    let checked=0;
    for(const screw of state.screws){
      const own=boards.get(screw.boardId)!;
      if(screw.place!=='board'||own.active===false||(own.gone&&!screw.detached)){this.exposed.delete(screw.id);this.readable.delete(screw.id);continue;}
      const p=screwPosition(screw,own);
      if(!all&&!changed.has(own.id)&&!regions.some(r=>p.x+SCREW_RADIUS>=r.minX&&p.x-SCREW_RADIUS<=r.maxX&&p.y+SCREW_RADIUS>=r.minY&&p.y-SCREW_RADIUS<=r.maxY))continue;
      const count=blockingBoards(state,screw.id).length;checked++;
      if(count===0)this.exposed.add(screw.id);else this.exposed.delete(screw.id);
      if((state.contentRevision??1)<2||count<=1)this.readable.add(screw.id);else this.readable.delete(screw.id);
    }
    return checked;
  }
}
