import type {Vec2} from './types';
export interface PickTarget {kind:'screw'|'board';id:string}
export interface GestureHost {
  target(point:Vec2):PickTarget|null;activate(target:PickTarget):void;
  world(point:Vec2):Vec2;camera():{zoom:number;center:Vec2};setCamera(zoom:number,center:Vec2):void;
  inspect(target:PickTarget|null):void;enabled():boolean;
  invalid?():void;
}
interface Contact{start:Vec2;point:Vec2;target:PickTarget|null;cancelled:boolean}
interface PointerLike{pointerId:number;clientX:number;clientY:number;pointerType:string;button:number;preventDefault():void}
/** 输入只在抬手且目标未改变时提交；平移、缩放和检查永不附带拆钉。 */
export class BoardGestures {
  private contacts=new Map<number,Contact>();private timer=0;private inspecting=false;
  private pinch:{distance:number;zoom:number;world:Vec2}|null=null;private cleanups:Array<()=>void>=[];
  constructor(private canvas:HTMLCanvasElement,private host:GestureHost){
    canvas.style.touchAction='none';canvas.tabIndex=0;canvas.setAttribute('aria-label','棋盘。按住检查，双指缩放，放大后拖动。键盘加减缩放、零复位。');
    const on=<K extends keyof HTMLElementEventMap>(name:K,fn:(event:HTMLElementEventMap[K])=>void,options?:AddEventListenerOptions)=>{canvas.addEventListener(name,fn as EventListener,options);this.cleanups.push(()=>canvas.removeEventListener(name,fn as EventListener,options));};
    on('pointerdown',e=>this.down(e));on('pointermove',e=>this.move(e));on('pointerup',e=>this.up(e));on('pointercancel',()=>this.cancel());
    on('lostpointercapture',e=>this.lost(e as PointerEvent));
    // 微信 X5 / 旧 WebView 可能没有 PointerEvent，用触摸和鼠标回退；有指针事件时不再并听，以免点两次。
    if(typeof PointerEvent==='undefined'){
      on('touchstart',e=>this.touches(e,'down'),{passive:false});
      on('touchmove',e=>this.touches(e,'move'),{passive:false});
      on('touchend',e=>this.touches(e,'up'),{passive:false});
      on('touchcancel',e=>this.touches(e,'cancel'),{passive:false});
      on('mousedown',e=>this.mouse(e,'down'));on('mousemove',e=>this.mouse(e,'move'));on('mouseup',e=>this.mouse(e,'up'));
    }
    on('wheel',e=>{if(!host.enabled())return;e.preventDefault();this.cancel();const at={x:e.clientX,y:e.clientY},anchor=host.world(at),before=host.camera();host.setCamera(before.zoom*Math.exp(-e.deltaY*.002),before.center);const after=host.world(at),camera=host.camera();host.setCamera(camera.zoom,{x:camera.center.x+anchor.x-after.x,y:camera.center.y+anchor.y-after.y});},{passive:false});
    on('keydown',e=>{if(!host.enabled())return;const camera=host.camera();if(e.key==='+'||e.key==='='){e.preventDefault();host.setCamera(camera.zoom*1.2,camera.center);}else if(e.key==='-'){e.preventDefault();host.setCamera(camera.zoom/1.2,camera.center);}else if(e.key==='0'){e.preventDefault();host.setCamera(1,{x:195,y:210});}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();host.setCamera(camera.zoom,{x:camera.center.x+(e.key==='ArrowRight'?24:e.key==='ArrowLeft'?-24:0)/camera.zoom,y:camera.center.y+(e.key==='ArrowDown'?24:e.key==='ArrowUp'?-24:0)/camera.zoom});}});
    on('contextmenu',e=>e.preventDefault());
  }
  private point(e:PointerLike):Vec2{return{x:e.clientX,y:e.clientY};}
  private capture(id:number):void{try{this.canvas.setPointerCapture?.(id);}catch{/* 旧内核没有指针捕获。 */}}
  private fromTouch(touch:Touch,button=0):PointerLike{
    return{pointerId:touch.identifier+2,clientX:touch.clientX,clientY:touch.clientY,pointerType:'touch',button,preventDefault(){}};
  }
  private touches(event:TouchEvent,phase:'down'|'move'|'up'|'cancel'):void{
    if(!this.host.enabled()&&phase==='down')return;
    event.preventDefault();
    if(phase==='cancel'){this.cancel();return;}
    for(const touch of [...event.changedTouches]){
      const pointer=this.fromTouch(touch);
      if(phase==='down')this.down(pointer);
      else if(phase==='move')this.move(pointer);
      else this.up(pointer);
    }
  }
  private mouse(event:MouseEvent,phase:'down'|'move'|'up'):void{
    if(phase==='down'&&event.button!==0)return;
    if(phase!=='down'&&!this.contacts.has(1))return;
    const pointer:PointerLike={pointerId:1,clientX:event.clientX,clientY:event.clientY,pointerType:'mouse',button:event.button,preventDefault:()=>event.preventDefault()};
    if(phase==='down')this.down(pointer);else if(phase==='move')this.move(pointer);else this.up(pointer);
  }
  private down(e:PointerLike){
    if(!this.host.enabled()||(e.pointerType==='mouse'&&e.button!==0&&e.button!==1))return;e.preventDefault();
    const point=this.point(e);this.contacts.set(e.pointerId,{start:point,point,target:this.host.target(this.host.world(point)),cancelled:e.button===1});this.capture(e.pointerId);
    if(this.contacts.size>1){this.stopInspection();for(const p of this.contacts.values())p.cancelled=true;const[a,b]=[...this.contacts.values()],mid={x:(a.point.x+b.point.x)/2,y:(a.point.y+b.point.y)/2};this.pinch={distance:Math.max(1,Math.hypot(a.point.x-b.point.x,a.point.y-b.point.y)),zoom:this.host.camera().zoom,world:this.host.world(mid)};}
    else {clearTimeout(this.timer);this.timer=window.setTimeout(()=>{const contact=this.contacts.get(e.pointerId);if(!contact||contact.cancelled)return;contact.cancelled=true;this.inspecting=true;this.host.inspect(contact.target);},380);}
  }
  private move(e:PointerLike){
    const contact=this.contacts.get(e.pointerId);if(!contact)return;e.preventDefault();const previous=contact.point;contact.point=this.point(e);
    if(this.pinch&&this.contacts.size>=2){const[a,b]=[...this.contacts.values()],mid={x:(a.point.x+b.point.x)/2,y:(a.point.y+b.point.y)/2};const zoom=this.pinch.zoom*Math.hypot(a.point.x-b.point.x,a.point.y-b.point.y)/this.pinch.distance;this.host.setCamera(zoom,this.host.camera().center);const now=this.host.world(mid),camera=this.host.camera();this.host.setCamera(camera.zoom,{x:camera.center.x+this.pinch.world.x-now.x,y:camera.center.y+this.pinch.world.y-now.y});return;}
    if(Math.hypot(contact.point.x-contact.start.x,contact.point.y-contact.start.y)>8){contact.cancelled=true;clearTimeout(this.timer);}
    if(contact.cancelled&&!this.inspecting){const a=this.host.world(previous),b=this.host.world(contact.point),camera=this.host.camera();this.host.setCamera(camera.zoom,{x:camera.center.x+a.x-b.x,y:camera.center.y+a.y-b.y});}
  }
  private up(e:PointerLike){
    const contact=this.contacts.get(e.pointerId);if(!contact)return;e.preventDefault();const target=this.host.target(this.host.world(this.point(e)));
    const tap=this.contacts.size===1&&!this.pinch&&!contact.cancelled&&!this.inspecting&&this.host.enabled()&&Math.hypot(e.clientX-contact.start.x,e.clientY-contact.start.y)<=8;
    const activate=tap&&contact.target&&target?.id===contact.target.id&&target.kind===contact.target.kind;
    this.contacts.delete(e.pointerId);clearTimeout(this.timer);this.stopInspection();if(!this.contacts.size)this.pinch=null;
    if(activate)this.host.activate(contact.target!);
    else if(tap&&contact.target)this.host.invalid?.();
  }
  private lost(e:PointerEvent){
    if(!this.contacts.has(e.pointerId))return;
    this.contacts.delete(e.pointerId);clearTimeout(this.timer);this.stopInspection();if(!this.contacts.size)this.pinch=null;
  }
  private stopInspection(){clearTimeout(this.timer);this.timer=0;if(this.inspecting){this.inspecting=false;this.host.inspect(null);}}
  cancel(){this.stopInspection();this.contacts.clear();this.pinch=null;}
  destroy(){this.cancel();for(const cleanup of this.cleanups)cleanup();this.cleanups=[];}
}
