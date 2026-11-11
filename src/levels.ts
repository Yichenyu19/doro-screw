import './geometry-setup';
import { COLORS, type BoardDef, type BoardShape, type ColorId, type HingeRule, type LevelDef, type StrategyTheme, type Vec2, type WitnessStep } from './types';
import { boardPolygon, localOutline, pointInPolygon, SCREW_RADIUS } from './geometry';
import { polygonCentroid, rotate } from './physics';
import { CAMPAIGN_TOTALS, LEVEL_TITLES, RELIEF_LEVELS, THEME_INFO, themeFor } from './level-catalog';
import {strategyModule} from './strategy-modules';
export { CAMPAIGN_COUNT, CAMPAIGN_TOTALS, LEVEL_TITLES } from './level-catalog';
export type LayoutFamily=StrategyTheme;
export interface ChoicePoint{atMove:number;bufferBefore:number;wrongScrewIds:string[];explanation:string}
export interface LevelDesign{sourceKind:'reference-inspired'|'doro-original';family:StrategyTheme;functionalGroups:number;groupBoardCounts:number[];activeColors:ColorId[];choices:ChoicePoint[];crossBoardSwitches:number;maxBuffer:number;generationPass:number;seed:number;chainCount:number}
class Random{
  constructor(private value:number){}
  next():number{let t=this.value+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
  int(n:number):number{return Math.floor(this.next()*n);}
  shuffle<T>(items:readonly T[]):T[]{const out=[...items];for(let i=out.length-1;i>0;i--){const j=this.int(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
function hash(text:string):number{let value=2166136261;for(const c of text){value^=c.charCodeAt(0);value=Math.imul(value,16777619);}return value>>>0;}
function distance(p:Vec2,a:Vec2,b:Vec2):number{const x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);}
function world(b:BoardDef,p:Vec2):Vec2{const r=rotate(p,b.angle);return{x:b.x+r.x,y:b.y+r.y};}
function covers(p:Vec2,polygon:Vec2[]):boolean{return pointInPolygon(p,polygon)||polygon.some((a,i)=>distance(p,a,polygon[(i+1)%polygon.length])<=SCREW_RADIUS+.001);}
function packedPoints(board:BoardDef,count:number,rng:Random):Vec2[]{
  for(let expansion=0;expansion<5;expansion++){
    const polygon=localOutline(board.shape,'v3').map(p=>({x:p.x*board.width,y:p.y*board.height})),candidates:Vec2[]=[];
    for(let y=-board.height/2+16;y<=board.height/2-16;y+=6)for(let x=-board.width/2+16;x<=board.width/2-16;x+=6){
      const p={x,y},w=world(board,p);
      if(w.x<24||w.x>366||w.y<24||w.y>390||!pointInPolygon(p,polygon))continue;
      if(polygon.some((a,i)=>distance(p,a,polygon[(i+1)%polygon.length])<SCREW_RADIUS+2))continue;
      candidates.push(p);
    }
    for(let trial=0;trial<6&&candidates.length;trial++){
      const selected=[candidates[rng.int(candidates.length)]];
      while(selected.length<count){let best:Vec2|undefined,spacing=-1;for(const p of candidates){const d=Math.min(...selected.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));if(d>spacing){best=p;spacing=d;}}if(!best||spacing<32)break;selected.push(best);}
      if(selected.length===count)return rng.shuffle(selected);
    }
    board.width*=1.075;board.height*=1.075;
  }
  throw new Error(`板件 ${board.shape} 无法容纳 ${count} 个安全钉位`);
}
function board(id:string,x:number,y:number,shape:BoardShape,width:number,height:number,count:number,group:number,angle:number,rng:Random):BoardDef{
  const value:BoardDef={id,x,y,shape,width,height,depth:group,group,reserved:group===0,angle,color:COLORS[rng.int(COLORS.length)],geometryVersion:'v3',screws:[]};
  value.screws=packedPoints(value,count,rng).map((p,i)=>({...p,id:`${id}-s${i+1}`,color:value.color}));return value;
}
function authored(id:string,shape:BoardShape,x:number,y:number,width:number,height:number,depth:number,points:Array<[number,number,ColorId]>):BoardDef{
  return{id,shape,x,y,width,height,depth,group:depth,angle:0,color:'cyan',geometryVersion:'v3',screws:points.map(([x,y,color],i)=>({id:`${id}-s${i+1}`,x,y,color}))};
}
export function hingePose(b:BoardDef,pivot:Vec2):HingeRule['settledPose']{
  const center=polygonCentroid(localOutline(b.shape,'v3').map(p=>({x:p.x*b.width,y:p.y*b.height})));
  const angle=Math.PI/2-Math.atan2(center.y-pivot.y,center.x-pivot.x),anchor=world(b,pivot),shift=rotate(pivot,angle);
  return{x:anchor.x-shift.x,y:anchor.y-shift.y,angle};
}
function layout(theme:StrategyTheme,slot:number,group:number,count:number,rng:Random):{x:number;y:number;shape:BoardShape;w:number;h:number;angle:number}{
  const turn=(group-1)*.025,jitter=()=>rng.next()*10-5;
  if(theme==='lattice'){
    const horizontal=slot%2===0;
    return{x:horizontal?195:slot===1?116:274,y:horizontal?(slot===0?125:295):210,shape:group%2?'capsule':'square',w:horizontal?310:Math.max(68,count>7?91:76),h:horizontal?Math.max(68,count>7?91:76):328,angle:0};
  }
  if(theme==='interlock'){
    if(slot===0||slot===1)return{x:(slot===0?104:286)+jitter(),y:208+jitter(),shape:(group+slot)%2?'cshape':'elbow',w:184,h:288,angle:slot===0?turn:Math.PI+turn};
    const positions=[[195,103],[195,316],[195,208],[123,198],[266,221]], [x,y]=positions[(slot-2)%positions.length];
    return{x:x+jitter(),y:y+jitter(),shape:slot<4?'capsule':slot===4?'bow':'notchedSquare',w:slot<4?322:204,h:slot<4?(count>=10?120:98):170,angle:slot<4?turn:(slot%2?-.14:.14)};
  }
  if(theme==='embrace'){
    if(slot===3&&group<=1)return{x:195+jitter(),y:208+jitter(),shape:'flower',w:208,h:196,angle:turn};
    const positions=[[195,95],[291,208],[195,324],[98,208],[195,205],[143,141],[247,275]], [x,y]=positions[slot%positions.length];
    return{x:x+jitter(),y:y+jitter(),shape:slot===4?'flower':(['leaf','heart','crescent','disc'] as BoardShape[])[(slot+group)%4],w:count>7?198:180,h:count>7?170:155,angle:slot*Math.PI/2+turn};
  }
  if(theme==='cascade'){
    const positions=[[100,92],[192,168],[288,251],[195,323],[97,250],[286,110]], [x,y]=positions[slot%positions.length];
    return{x:x+jitter(),y:y+jitter(),shape:(['cloud','capsule','bow','leaf','zigzag'] as BoardShape[])[(slot+group)%5],w:count>7?207:175,h:count>7?178:158,angle:(slot%2?.2:-.2)+turn};
  }
  const positions=theme==='hinge'?[[105,90],[282,95],[98,326],[285,326],[190,207],[105,207]]:[[99,100],[291,103],[100,316],[289,316],[195,200],[195,107],[195,307]];
  const [x,y]=positions[slot%positions.length],bridge=slot===4||(slot===3&&group%2===0&&theme==='quadrants');
  return{x:bridge?195:x+jitter(),y:bridge?200:y+jitter(),shape:bridge?'capsule':slot===5?'cross':(['triangle','disc','heart','star','square','doro','diamond'] as BoardShape[])[(slot+group)%7],w:bridge?287:slot===5?214:count>7?185:165,h:bridge?94:slot===5?202:count>7?175:151,angle:bridge?(group%2?.42:-.42):(rng.next()-.5)*.23};
}
/** 前十关采用实录可见的标志性板形和空间比例；实际钉位、盒序仍为可验证的Doro设计。 */
function referenceProfile(boards:BoardDef[],id:number,rng:Random):void{
  if(id<2||id>10)return;
  const slots=new Map<number,number>();
  for(const b of boards){
    const group=b.group!,slot=slots.get(group)??0;slots.set(group,slot+1);
    const count=b.screws.length;
    const set=(shape:BoardShape,x:number,y:number,w:number,h:number,angle=0)=>Object.assign(b,{shape,x,y,width:w,height:h,angle});
    if(id===2){if(Math.abs(b.x-195)<20)set('capsule',195,210,286,94,b.angle);else b.shape=(['cloud','square','elbow','cloud'] as BoardShape[])[(slot+group)%4];}
    if(id===3){
      const points=[[125,137],[265,137],[264,282],[126,282]], [x,y]=points[slot%4];
      set((['diamond','flower','leaf','flower'] as BoardShape[])[(slot+group)%4],x,y,182,178,(slot%2?-.2:.2));
      if(slot===3&&(group===1||group===4))set(group===4?'flower':'square',195,208,group===4?181:258,group===4?187:258,group===4?0:Math.PI/4);
    }
    if(id===4){
      const points=[[115,141],[274,145],[277,282],[111,282]],[x,y]=points[slot%4];set(slot%2?'disc':'leaf',x,y,184,161,slot%2?0:(group%2?.55:-.55));
      if(slot===3&&(group===1||group===4))set('disc',195,209,210,214);
    }
    if(id===5){
      const points=[[102,105],[287,315],[287,106],[104,314]],[x,y]=points[slot%4];set((['elbow','triangle','square','triangle'] as BoardShape[])[slot%4],x,y,173,164,slot%2?.12:-.12);
      if(group>=3&&slot>=2)set('capsule',195,210,340,count>=10?104:86,slot%2?Math.PI/4:-Math.PI/4);
      if(group===2&&slot===3)set('cross',195,210,181,184);
    }
    if(id===6){b.shape=(['cshape','zigzag','crescent','elbow'] as BoardShape[])[(slot+group)%4];b.width=Math.max(191,b.width);b.height=Math.max(174,b.height);b.angle=slot%2?.5:-.5;}
    if(id===7){
      if(slot<2)set('cshape',slot===0?104:286,210,181,222,slot===0?0:Math.PI);
      else if(slot===2)set('triangle',195,101,172,143);
      else set('square',group%2?265:125,318,158,136);
      if(group===4&&slot===3)set('capsule',195,216,88,297);
    }
    if(id===8){
      const points=[[116,109],[286,173],[266,310],[107,278]],[x,y]=points[slot%4];set('flower',x,y,count>=8?178:161,count>=8?178:161);
      if(slot===3&&(group===1||group===4))set('flower',195,213,219,218);
      if(group===0&&slot<2)set('capsule',slot===0?125:269,209,82,326);
    }
    if(id===9){
      const points=[[104,110],[286,110],[102,315],[288,315]],[x,y]=points[slot%4];set('cshape',x,y,178,169,slot%2?Math.PI:0);
      if(group<=1&&slot<2)set('capsule',slot===0?122:270,210,86,321);
      if(group===4&&slot===3)set('star',195,211,221,225);
    }
    if(id===10){
      if(slot===0)set('disc',195,209,168,176);
      else if(slot===1)set(group%2?'square':'capsule',195,208,288,132,.52);
      else set('cshape',slot===2?131:263,slot===2?178:244,223,229,slot===2?.52:Math.PI+.52);
    }
    const points=packedPoints(b,count,rng);b.screws=points.map((p,i)=>({...p,id:`${b.id}-s${i+1}`,color:b.color}));
  }
}
function geometry(id:number,total:number,theme:StrategyTheme,rng:Random):{boards:BoardDef[];hinge?:HingeRule;prefix:Array<{id:string;color:ColorId;wait?:boolean}>}{
  const n=20+2*Math.floor(Math.max(0,total-120)/18),counts=Array(n).fill(3) as number[],fixed=theme==='hinge'?new Set([n-2,n-1]):new Set<number>();
  for(const i of fixed)counts[i]=6;
  let left=total-counts.reduce((a,b)=>a+b,0);
  while(left>0)for(const i of rng.shuffle(counts.map((_,i)=>i))){if(!fixed.has(i)&&counts[i]<10&&left&&(rng.next()<.72||left<n)){counts[i]++;left--;}}
  for(const entry of [Math.floor(n/5)+(n%5>0?1:0),n-4]){if(fixed.has(entry))continue;let spare=counts[entry]-3;counts[entry]=3;while(spare>0){const target=rng.shuffle(counts.map((_,i)=>i)).find(i=>i!==entry&&!fixed.has(i)&&counts[i]<10);if(target===undefined)throw Error('入口数量调整失败');counts[target]++;spare--;}}
  if(id>=10&&id%5===0){const bridge=Math.floor(n/5)+(n%5>0?1:0)+4;while(counts[bridge]<12){const donor=rng.shuffle(counts.map((_,i)=>i)).find(i=>i!==bridge&&!fixed.has(i)&&counts[i]>3);if(donor===undefined)throw Error('宽桥数量分配失败');counts[donor]--;counts[bridge]++;}}
  const boards:BoardDef[]=[];let index=0;
  for(let group=0;group<5;group++)for(let slot=0;slot<Math.floor(n/5)+(group<n%5?1:0);slot++){
    const l=layout(theme,slot,group,counts[index],rng);
    boards.push(board(`l${id}-b${index+1}`,l.x,l.y,l.shape,l.w,l.h,counts[index],group,l.angle,rng));index++;
  }
  referenceProfile(boards,id,rng);
  if(theme!=='hinge')return{boards,prefix:[]};
  const gate=authored(`l${id}-gate`,'capsule',195,215,264,74,4,[[-108,0,'yellow'],[-65,0,'yellow'],[-22,0,'yellow'],[21,0,'yellow'],[64,0,'yellow'],[107,0,'yellow']]);
  const under=authored(`l${id}-window`,'square',262,215,136,100,4,[[-32,-17,'yellow'],[0,-17,'yellow'],[32,-17,'yellow'],[-32,17,'yellow'],[0,17,'yellow'],[32,17,'yellow']]);
  if(id===6){gate.angle=.52;const position=rotate({x:under.x-gate.x,y:under.y-gate.y},.52);under.x=gate.x+position.x;under.y=gate.y+position.y;under.angle=.52;}
  boards[n-2]=under;boards[n-1]=gate;
  return{boards,hinge:{boardId:gate.id,pivotId:gate.screws[0].id,targetIds:under.screws.slice(0,2).map(s=>s.id),settledPose:hingePose(gate,gate.screws[0])},prefix:[]};
}
class CollectionModel{
  boxes:Array<{color:ColorId|null;count:number}>;buffer:Array<ColorId|null>=Array(5).fill(null);cursor=2;completed=0;peak=0;maxChain=0;
  get occupied():number{return this.buffer.filter(c=>c!==null).length;}
  constructor(readonly queue:ColorId[],initialColors:Array<ColorId|null>=queue.slice(0,2)){this.boxes=initialColors.map(color=>({color,count:0}));}
  accepts(c:ColorId):boolean{return this.boxes.some(b=>b.color===c);}
  private route(c:ColorId):boolean{const b=this.boxes.find(b=>b.color===c);if(!b)return false;if(++b.count===3){this.completed+=3;b.color=this.queue[this.cursor++]??null;b.count=0;}return true;}
  pick(c:ColorId):boolean{const before=this.completed;if(!this.route(c)){const slot=this.buffer.indexOf(null);if(slot<0)return false;this.buffer[slot]=c;}for(;;){const i=this.buffer.findIndex(c=>c!==null&&this.accepts(c));if(i<0)break;const color=this.buffer[i]!;this.buffer[i]=null;this.route(color);}this.peak=Math.max(this.peak,this.occupied);this.maxChain=Math.max(this.maxChain,(this.completed-before)/3);return this.occupied<5;}
}
interface Pin{id:string;board:number;def:BoardDef['screws'][number];blockers:number[];color:ColorId|null;removed:boolean}
function makeQueue(total:number,palette:ColorId[],rng:Random,hinge:boolean,cascade:boolean):ColorId[]{
  const queue=cascade?[palette[0],palette[1],palette[2],...palette.slice(3)]:[...palette],rest=hinge?palette.slice(2):palette;
  while(queue.length<total/3){const frequencies=rest.map(c=>queue.filter(v=>v===c).length),min=Math.min(...frequencies),options=rest.filter((c,i)=>c!==queue[queue.length-1]&&frequencies[i]<=min+1);queue.push(options[rng.int(options.length)]);}return queue;
}
function construct(boards:BoardDef[],queue:ColorId[],rng:Random,theme:StrategyTheme,hinge:HingeRule|undefined,afterCleared:number,relief:boolean,initialColors?:Array<ColorId|null>):{witness:WitnessStep[];choices:ChoicePoint[];peak:number;switches:number;chains:number}{
  const poses=clone(boards),remaining=boards.map(b=>b.screws.length),model=new CollectionModel(queue,initialColors),quota=new Map<ColorId,number>();for(const c of queue)quota.set(c,(quota.get(c)??0)+3);
  const pins:Pin[]=boards.flatMap((b,own)=>b.screws.map(def=>({id:def.id,board:own,def,blockers:[],color:null,removed:false}))),byId=new Map(pins.map(p=>[p.id,p]));
  const recalc=()=>{const polygons=poses.map(boardPolygon);for(const p of pins){const own=poses[p.board],position=world(own,p.def);p.blockers=poses.flatMap((b,i)=>i!==p.board&&(b.depth>own.depth||(b.depth===own.depth&&i>p.board))&&covers(position,polygons[i])?[i]:[]);}};recalc();
  const revealed=()=>remaining.filter((r,i)=>r===0&&!boards[i].reserved).length>=afterCleared;
  const active=(i:number)=>!boards[i].reserved||revealed();
  const available=()=>pins.filter(p=>!p.removed&&active(p.board)&&p.blockers.every(i=>!active(i)||remaining[i]===0));
  const paint=(p:Pin,c:ColorId)=>{if((quota.get(c)??0)<1)throw new Error('预定颜色需求已用完');p.color=c;p.def.color=c;quota.set(c,quota.get(c)!-1);};
  const witness:WitnessStep[]=[],choices:ChoicePoint[]=[];let last=-1,switches=0,forced:string|null=null,protectedMoves=0;
  const take=(p:Pin,wait=false)=>{if(!available().includes(p))throw new Error(`见证目标被挡 ${p.id}`);if(!p.color||!model.pick(p.color))throw new Error(`暂存溢出 ${p.id}`);if(last!==-1&&last!==p.board&&remaining[last]>0)switches++;p.removed=true;remaining[p.board]--;witness.push({screwId:p.id,waitMs:remaining[p.board]===0?1300:24,...(wait?{waitForExposure:true}:{})});last=p.board;};
  if(hinge){
    const gate=boards.find(b=>b.id===hinge.boardId)!,under=boards[boards.length-2],colors=[queue[4],queue[2],queue[2],queue[2],queue[3],queue[0]];
    gate.screws.forEach((s,i)=>paint(byId.get(s.id)!,colors[i]));under.screws.slice(0,5).forEach((s,i)=>paint(byId.get(s.id)!,i<2?queue[0]:queue[1]));
    for(const s of gate.screws.slice(1))take(byId.get(s.id)!);
    Object.assign(poses[boards.indexOf(gate)],hinge.settledPose);recalc();
    take(byId.get(under.screws[0].id)!,true);take(byId.get(under.screws[1].id)!);take(byId.get(gate.screws[0].id)!);protectedMoves=4;
  }else if(theme==='cascade'){
    for(const c of [queue[2],queue[2],queue[2],queue[0],queue[0],queue[0]]){
      const open=available(),safe=open.filter(p=>!p.color&&(remaining[p.board]!==2||pins.filter(q=>q.board===p.board&&!q.removed).every(q=>open.includes(q))));
      const p:Pin|undefined=forced?byId.get(forced):rng.shuffle(safe)[0];if(!p)throw new Error('回流入口不足');paint(p,c);take(p);forced=remaining[p.board]===1?pins.find(q=>q.board===p.board&&!q.removed)!.id:null;
    }protectedMoves=3;
  }
  let checkpoint=0;const checkpoints=[Math.floor(pins.length*.2),Math.floor(pins.length*.55),Math.floor(pins.length*.78)];
  while(witness.length<pins.length){
    const open=available(),openIds=new Set(open.map(p=>p.id)),safe=open.filter(p=>remaining[p.board]!==2||pins.filter(q=>q.board===p.board&&!q.removed).every(q=>openIds.has(q.id)));
    if(!safe.length)throw new Error('未能找到可拆入口');
    if(checkpoint<checkpoints.length&&witness.length>=checkpoints[checkpoint]&&!forced){
      const chosen:Pin[]=[],counts=new Map<number,number>(),need=5-model.occupied;
      for(const p of rng.shuffle(safe.filter(p=>p.color===null))){if((counts.get(p.board)??0)>=remaining[p.board]-2)continue;chosen.push(p);counts.set(p.board,(counts.get(p.board)??0)+1);if(chosen.length===need)break;}
      if(chosen.length===need&&safe.length>=need+3){const supply=new Map([...quota].filter(([c,n])=>n&&!model.accepts(c)));if([...supply.values()].reduce((a,b)=>a+b,0)>=need){for(const p of chosen){const c=rng.shuffle([...supply].filter(([,n])=>n>0))[0][0];paint(p,c);supply.set(c,supply.get(c)!-1);}choices.push({atMove:witness.length,bufferBefore:model.occupied,wrongScrewIds:chosen.map(p=>p.id),explanation:'当前盒尚未打开这些颜色；同时拿满这一组会占住最后一孔。'});protectedMoves=4;checkpoint++;}}
    }
    const target=protectedMoves?0:relief?2:(witness.length%41<17?3:4),activeColors=new Set(model.boxes.map(b=>b.color));
    const targets=pins.filter(p=>!p.removed&&p.color&&activeColors.has(p.color));
    let options=safe.filter(p=>!p.color||model.accepts(p.color)||model.occupied<4);
    if(forced){options=options.filter(p=>p.id===forced);if(!options.length)throw new Error('末钉被遮挡或暂存不足');}
    const scored=options.map(p=>({p,score:rng.next()*19+(p.board===last?-8:16)+targets.filter(q=>q.blockers.includes(p.board)).length*12+(p.color&&model.accepts(p.color)?90:!p.color?55:model.occupied<target?5:-24)+(remaining[p.board]===2?14:0)})).sort((a,b)=>b.score-a.score),p=scored[0]?.p;
    if(!p)throw new Error('暂存压力下没有继续入口');
    if(!p.color){const colors=[...quota].filter(([,n])=>n>0).map(([c])=>c),matching=colors.filter(c=>model.accepts(c)),future=colors.filter(c=>!model.accepts(c));const pressure=!protectedMoves&&model.occupied<target&&future.length>0&&rng.next()<.29;const choices=pressure?future:matching.length?matching:future;if(!choices.length)throw new Error('颜色供给不足');const c=choices[rng.int(choices.length)];if(!model.accepts(c)&&model.occupied>=4)throw new Error('盒色仍在玻璃下');paint(p,c);}
    take(p);forced=remaining[p.board]===1?pins.find(q=>q.board===p.board&&!q.removed)!.id:null;
    if(remaining[p.board]===0)protectedMoves=Math.max(protectedMoves,3);protectedMoves=Math.max(0,protectedMoves-1);
  }
  if(model.completed!==pins.length||model.occupied||switches<8)throw new Error('路线未完全闭合');
  return{witness,choices,peak:model.peak,switches,chains:model.maxChain};
}
function tutorial(attempt:number):{level:LevelDef;design:LevelDesign}{
  const seed=hash('doro-v4-tutorial-'+attempt);
  const a=authored('l1-swing','capsule',190,175,300,120,3,[[-108,0,'blue'],[0,0,'red'],[95,0,'brown']]);
  const b=authored('l1-under','square',208,198,176,154,2,[[-44,-37,'orange'],[6,-37,'orange'],[46,-37,'orange'],[0,17,'cyan']]);
  const c=authored('l1-lock','triangle',82,145,145,150,4,[[-32,29,'red'],[31,29,'blue'],[0,-9,'brown']]);
  const d=authored('l1-finish','notchedSquare',210,291,166,140,1,[[-33,-31,'cyan'],[28,-31,'cyan'],[-47,38,'red'],[42,38,'blue'],[-2,9,'brown']]);
  const boards=[d,b,a,c],sequence:Array<[BoardDef,number,boolean?]>=[[a,1],[a,2],[b,0,true],[b,1],[b,2],[c,0],[d,2],[c,1],[c,2],[a,0,true],[d,3],[b,3],[d,0],[d,1],[d,4]],left=new Map(boards.map(b=>[b.id,b.screws.length]));
  const witness=sequence.map(([b,i,wait])=>{const n=left.get(b.id)!-1;left.set(b.id,n);return{screwId:b.screws[i].id,waitMs:n===0?1300:24,...(wait?{waitForExposure:true}:{})};});
  const palette:ColorId[]=['orange','cyan','red','blue','brown'];
  return{level:{id:1,name:LEVEL_TITLES[0].name,subtitle:'先腾出窗口，再让暂存回家',seed,attempt,contentVersion:'v4',geometryVersion:'v4',theme:'hinge',strategy:'暂存长板上的红钉与棕钉，留下左支点；打开橘色盒，让红钉回流',tutorial:true,sourceKind:'reference-inspired',designNotes:['实录数量基线：4板、15钉、5色各3颗；钉位、盒序与教学路线为Doro设计。','橘色三钉和薄荷入口被长板遮挡；左支点被三角板遮挡。长板摆动前至少需要两颗非当前盒色的钉。'],boards,boxQueue:palette,witness,hinge:{boardId:a.id,pivotId:a.screws[0].id,targetIds:b.screws.map(s=>s.id),settledPose:hingePose(a,a.screws[0])},curriculum:{objective:'经历暂存、单钉开窗和回流',prerequisites:[],decision:'先花两个空孔让长板绕左支点摆开，或先处理遮住支点的三角板',failure:'在当前盒色露出前连续拿满五颗其他颜色，会占满暂存',release:'长板剩左侧一钉并摆开后，橘色入口出现；三颗橘色装箱后红钉回流',criticalBoardIds:[a.id,b.id,c.id],stages:[{until:2,title:'留住支点',advice:'看长板上的红钉和棕钉。它们会先进入暂存。'},{until:5,title:'打开窗口',advice:'等长板摆开，收齐露出的三颗橘钉。'},{until:11,title:'暂存回家',advice:'新盒会自动接走同色暂存。用空出的孔位继续开路。'},{until:15,title:'轻松收尾',advice:'让剩余颜色各自凑满三颗。'}]}},design:{sourceKind:'reference-inspired',family:'hinge',functionalGroups:4,groupBoardCounts:[1,1,1,1],activeColors:palette,choices:[],crossBoardSwitches:9,maxBuffer:3,generationPass:0,seed,chainCount:1}};
}
const cache=new Map<string,{level:LevelDef;design:LevelDesign}>();
function obtain(id:number,attempt:number):{level:LevelDef;design:LevelDesign}{
  if(!Number.isInteger(id)||id<1||!Number.isInteger(attempt)||attempt<0)throw new RangeError('关卡从1开始，局面编号为非负整数');const key=`${id}/${attempt}`,cached=cache.get(key);if(cached)return cached;
  if(id===1){const value=tutorial(attempt);cache.set(key,value);return value;}
  const total=id>30?180+3*((id*7+attempt*11)%17):CAMPAIGN_TOTALS[id-1],theme=themeFor(id),sourceKind=id<=10?'reference-inspired':'doro-original',relief=RELIEF_LEVELS.has(id);
  let lastError:unknown;
  for(let pass=0;pass<96;pass++){
    const seed=hash(`doro-v4-r1-content-${id}-${attempt}-${pass}`),rng=new Random(seed);
    try{
      const palette=rng.shuffle(COLORS).slice(0,id===2||relief?8:id<=9?9:10),module=strategyModule(theme,`l${id}-key`,palette,id),baseTotal=total-module.witness.length;
      const {boards:base}=geometry(id,baseTotal,theme==='hinge'?'quadrants':theme,rng),queue=makeQueue(baseTotal,palette,rng,false,theme==='cascade'),afterCleared=Math.floor(base.length/5);
      const handoff=new CollectionModel([...module.queue,...queue]),modulePins=new Map(module.boards.flatMap(b=>b.screws.map(s=>[s.id,s.color] as const)));for(const step of module.witness)if(!handoff.pick(modulePins.get(step.screwId)!))throw Error('策略模块暂存溢出');
      if(handoff.occupied||handoff.boxes.some(b=>b.count))throw Error('策略模块尚未完成装箱');
      const result=construct(base,queue,rng,theme,undefined,afterCleared,relief,handoff.boxes.map(b=>b.color)),title=id<=30?LEVEL_TITLES[id-1].name:`无尽 · ${THEME_INFO[theme].name}`;
      const boards=[...base,...module.boards];for(const b of boards)b.geometryVersion='v4';
      const opening=module.witness.length,curriculum={...module.curriculum,prerequisites:id===2?['第一关的暂存与回流','五孔容量']:module.curriculum.prerequisites,stages:[{until:opening,title:'开路 · '+THEME_INFO[theme].name,advice:module.curriculum.decision},{until:Math.floor(total*.42),title:'暂存取舍',advice:relief?'先接当前盒色，给底层入口留两个空孔。':'长按检查挡住盒色的板，拿其他颜色前先算还剩几孔。'},{until:Math.floor(total*.8),title:'释放与回流',advice:'底层显露后对照盒色预告，接回暂存并交替清出入口。'},{until:total,title:'把尾巴收好',advice:'剩余颜色都在盘面上了，优先完成已有的两盒。'}]};
      const level:LevelDef={id,name:title,subtitle:id<=30?THEME_INFO[theme].strategy:`第 ${id-30} 次漫游 · ${THEME_INFO[theme].strategy}`,seed,attempt,contentVersion:'v4',geometryVersion:'v4',theme,strategy:THEME_INFO[theme].strategy,sourceKind,boards,boxQueue:[...module.queue,...queue],witness:[...module.witness,...result.witness],reveal:{group:0,afterCleared:afterCleared+module.boards.length},hinge:module.hinge,curriculum,designNotes:[id<=10?`采用实录数量基线 ${total} 颗；保留标志性构图，关键开路模块、钉位和盒序为Doro设计。`:'Doro原创续关。','经过独立验证的策略开场接入原构图的多层工区；底层后备组、钉位和盒序在开局确定。',module.curriculum.decision,module.curriculum.release,...(relief?['回落关：后段路线减少连续暂存压力。']:[])]};
      const design:LevelDesign={sourceKind,family:theme,functionalGroups:6,groupBoardCounts:[0,1,2,3,4,5].map(g=>boards.filter(b=>b.group===g).length),activeColors:palette,choices:result.choices.map(c=>({...c,atMove:c.atMove+opening})),crossBoardSwitches:result.switches,maxBuffer:Math.max(result.peak,theme==='hinge'?2:theme==='quadrants'||theme==='lattice'||theme==='cascade'?3:0),generationPass:pass,seed,chainCount:Math.max(result.chains,theme==='quadrants'||theme==='lattice'||theme==='cascade'?2:1)};
      const value={level,design};cache.set(key,value);return value;
    }catch(error){lastError=error;}
  }
  throw new Error(`关卡 ${id}/${attempt} 未能生成完整路线：${String(lastError)}`);
}
export function getLevel(id:number,attempt=0):LevelDef{return clone(obtain(id,attempt).level);}
export function getLevelDesign(id:number,attempt=0):LevelDesign{return clone(obtain(id,attempt).design);}

