import {sprite} from './art';
import {COLORS,type GameEvent,type GameState,type Settings,type Vec2,type ColorId} from './types';
const copy=(s:GameState):GameState=>({...s,boxes:s.boxes.map(b=>({...b,screws:[...b.screws]})),buffer:[...s.buffer],pocket:[...s.pocket],collected:[...s.collected]});
interface Hooks{render:(state:GameState)=>void;screenPoint:(p:Vec2)=>Vec2|null;boxSound:()=>void;arriveSound?:()=>void}
interface Cohort{id:number;generation:number;color:ColorId|null;ids:string[];arrived:Set<string>;readyAt:number;lastArrival:number;closed:boolean;packing:boolean}
/** 归属即时预留，抵达仅改变显示；每个盒子的代次独立结算。 */
export class PresentationDirector{
 state:GameState|null=null;readonly closing=new Set<number>();
 private latest:GameState|null=null;private cohorts=new Map<string,Cohort>();private timers=new Set<number>();private flights=new Set<HTMLElement>();private sourceReady=new Map<string,number>();private arrived=new Set<string>();private epoch=0;private serial=0;private endAt=0;private waiters:Array<()=>void>=[];
 private anchors=new Map<string,Vec2>();
 private flightTemplates=new Map<ColorId,HTMLElement>();
 private anchorViewport='';
 constructor(private settings:Settings,private hooks:Hooks){}
 get busy():boolean{return this.timers.size>0;}
 private key(id:number,generation:number){return `${id}:${generation}`;}
 private displayed(id:number):Cohort|undefined{const box=this.latest?.boxes.find(b=>b.id===id);return box?this.cohorts.get(this.key(id,box.completed)):undefined;}
 nextColor(id:number):ColorId|null|undefined{const shown=this.displayed(id);return [...this.cohorts.values()].filter(c=>c.id===id&&!c.closed&&c.generation>(shown?.generation??-1)).sort((a,b)=>a.generation-b.generation)[0]?.color;}
 pendingCount(id:number):number{const shown=this.displayed(id);return [...this.cohorts.values()].filter(c=>c.id===id&&!c.closed&&c.generation>(shown?.generation??-1)).sort((a,b)=>a.generation-b.generation)[0]?.ids.length??0;}
 isArrived(id:string,boxId?:number):boolean{return boxId===undefined?this.arrived.has(id):this.displayed(boxId)?.arrived.has(id)??false;}
 reset(state:GameState):void{this.cancel();this.latest=copy(state);this.state=copy(state);for(const b of state.boxes)this.cohorts.set(this.key(b.id,b.completed),{id:b.id,generation:b.completed,color:b.color,ids:[...b.screws],arrived:new Set(b.screws),readyAt:0,lastArrival:0,closed:false,packing:false});this.arrived=new Set([...state.buffer.filter((id):id is string=>!!id),...state.pocket]);this.draw();}
 flush():void{if(this.latest)this.reset(this.latest);}
 cancel():void{this.epoch++;for(const t of this.timers)window.clearTimeout(t);this.timers.clear();for(const e of this.flights){e.getAnimations().forEach(a=>a.cancel());e.remove();}this.flights.clear();this.sourceReady.clear();this.cohorts.clear();this.arrived.clear();this.closing.clear();this.endAt=0;this.waiters.splice(0).forEach(r=>r());}
 whenIdle():Promise<void>{return this.busy?new Promise(r=>this.waiters.push(r)):Promise.resolve();}
 private at(time:number,callback:()=>void):void{const epoch=this.epoch;this.endAt=Math.max(this.endAt,time);const t=window.setTimeout(()=>{this.timers.delete(t);if(epoch!==this.epoch)return;callback();if(!this.timers.size)this.waiters.splice(0).forEach(r=>r());},Math.max(0,time-performance.now()));this.timers.add(t);}
 private draw():void{if(!this.latest)return;const state=copy(this.latest);this.closing.clear();for(const c of this.cohorts.values())if(c.packing&&!c.closed&&state.boxes.some(b=>b.id===c.id&&b.completed===c.generation))this.closing.add(c.id);this.state=state;this.hooks.render(state);}
 private measureAnchors():void {this.anchorViewport=innerWidth+':'+innerHeight;this.anchors.clear();for(const e of document.querySelectorAll<HTMLElement>('[data-box-id],[data-buffer-slot],[data-pocket-target]')){const kind=e.hasAttribute('data-box-id')?'box':e.hasAttribute('data-buffer-slot')?'buffer':'pocket',index=kind==='box'?e.dataset.boxId:kind==='buffer'?e.dataset.bufferSlot:'',r=e.getBoundingClientRect();this.anchors.set(kind+':'+(index??''),{x:r.left+r.width/2,y:r.top+r.height*(kind==='box'?.64:.5)});}}
 prepareLayout():void{this.measureAnchors();if(!this.flightTemplates.size)for(const color of COLORS){const wrapper=document.createElement('span');wrapper.innerHTML=sprite('heads',COLORS.indexOf(color));const e=wrapper.firstElementChild as HTMLElement;Object.assign(e.style,{position:'fixed',width:'28px',height:'28px',pointerEvents:'none',zIndex:'2500'});this.flightTemplates.set(color,e);}}
 private anchor(kind:'box'|'buffer'|'pocket',index?:number):Vec2|null{return this.anchors.get(kind+':'+(index??''))??null;}
 private fly(color:ColorId,from:Vec2|null,to:Vec2|null,duration:number):void{
  if(!from||!to)return;if(!this.flightTemplates.size)this.prepareLayout();const e=this.flightTemplates.get(color)!.cloneNode(true) as HTMLElement;e.style.left=`${from.x-14}px`;e.style.top=`${from.y-14}px`;document.body.appendChild(e);this.flights.add(e);const dx=to.x-from.x,dy=to.y-from.y;
  const frames=this.settings.reducedMotion?[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.63)`,opacity:.75}]:[{transform:'translate(0,0) rotate(0deg) scale(1)',opacity:1},{transform:`translate(${dx*.25}px,${dy*.45-20}px) rotate(150deg) scale(1.08)`,opacity:1,offset:.38},{transform:`translate(${dx}px,${dy}px) rotate(315deg) scale(.63)`,opacity:.8}];
  e.animate(frames,{duration,easing:'cubic-bezier(.2,.65,.35,1)'}).finished.finally(()=>{e.remove();this.flights.delete(e);}).catch(()=>{});
 }
 enqueue(events:GameEvent[],before:GameState,after:GameState):void{
  if(!this.state)this.reset(before);if(!this.anchors.size||this.anchorViewport!==innerWidth+':'+innerHeight)this.measureAnchors();const now=performance.now(),duration=this.settings.reducedMotion?80:225,serial=++this.serial;const fromBoard=new Map<string,Vec2>();for(const e of events)if(e.type==='picked')fromBoard.set(e.screwId,e.from);
  // 在孔位归属变化前取得回流起点，随后立即绘制最新的预留槽。
  const starts=new Map<GameEvent,Vec2|null>();for(const e of events)if(e.type==='routed'){const source=e.sourcePlace??before.screws.find(s=>s.id===e.screwId)?.place;starts.set(e,source==='buffer'?this.anchor('buffer',e.sourceSlotIndex??before.buffer.indexOf(e.screwId)):source==='pocket'?this.anchor('pocket'):fromBoard.has(e.screwId)?this.hooks.screenPoint(fromBoard.get(e.screwId)!):null);}
  this.latest=copy(after);
  if(after.boxes.length!==before.boxes.length||after.capacity!==before.capacity){this.draw();this.measureAnchors();}
  for(const e of events){
   if(e.type==='routed'){
    let cohort:Cohort|undefined;if(e.destination==='box'){const generation=e.boxGeneration??before.boxes.find(b=>b.id===e.boxId)?.completed??0,key=this.key(e.boxId!,generation);cohort=this.cohorts.get(key);if(!cohort){cohort={id:e.boxId!,generation,color:e.color,ids:[],arrived:new Set(),readyAt:now,lastArrival:now,closed:false,packing:false};this.cohorts.set(key,cohort);}if(!cohort.ids.includes(e.screwId))cohort.ids.push(e.screwId);}
    this.arrived.delete(e.screwId);const sourceTime=Math.max(now,this.sourceReady.get(e.screwId)??now),arrival=Math.max(sourceTime+duration,(cohort?.readyAt??now)+duration*.5);this.sourceReady.set(e.screwId,arrival);if(cohort)cohort.lastArrival=Math.max(cohort.lastArrival,arrival);
    const target=e.destination==='box'?this.anchor('box',e.boxId):e.destination==='buffer'?this.anchor('buffer',e.slotIndex):this.anchor('pocket');
    const fly=()=>this.fly(e.color,starts.get(e)??null,target,arrival-sourceTime);if(sourceTime<=now)fly();else this.at(sourceTime,fly);
    this.at(arrival,()=>{cohort?.arrived.add(e.screwId);if(this.latest?.buffer.includes(e.screwId)||this.latest?.pocket.includes(e.screwId))this.arrived.add(e.screwId);if(e.destination==='box')this.hooks.arriveSound?.();this.draw();});
   }else if(e.type==='box-completed'){
    const c=this.cohorts.get(this.key(e.boxId,e.boxGeneration??0));if(!c)continue;const completeAt=Math.max(now,c.lastArrival)+(this.settings.reducedMotion?15:55);const closeAt=completeAt+(this.settings.reducedMotion?35:135);
    this.at(completeAt,()=>{c.packing=true;this.hooks.boxSound();this.draw();});this.at(closeAt,()=>{c.closed=true;this.draw();});
    const nextKey=this.key(c.id,c.generation+1);if(!this.cohorts.has(nextKey))this.cohorts.set(nextKey,{id:c.id,generation:c.generation+1,color:null,ids:[],arrived:new Set(),readyAt:closeAt,lastArrival:0,closed:false,packing:false});
   }else if(e.type==='box-opened'){
    const generation=e.boxGeneration??0,key=this.key(e.boxId,generation),c=this.cohorts.get(key);if(c)c.color=e.color;else this.cohorts.set(key,{id:e.boxId,generation,color:e.color,ids:[],arrived:new Set(),readyAt:now,lastArrival:0,closed:false,packing:false});
   }
  }
  this.draw();this.at(this.endAt+25,()=>{if(serial===this.serial&&this.latest)this.reset(this.latest);});
 }
}
