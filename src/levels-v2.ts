import { COLORS, SHAPES, type BoardDef, type BoardShape, type ColorId, type LevelDef, type Vec2, type WitnessStep } from './types';
import { boardPolygon, localOutline, pointInPolygon, SCREW_RADIUS } from './geometry-v2';

export const CAMPAIGN_COUNT = 30;
export const CAMPAIGN_TOTALS = [15,120,129,135,141,156,156,168,162,195,180,186,192,177,198,204,189,210,201,216,198,213,219,204,222,216,225,210,228,228] as const;
export type LayoutFamily = 'quadrants'|'embrace'|'branches'|'lattice';
export interface ChoicePoint { atMove:number; bufferBefore:number; wrongScrewIds:string[]; explanation:string }
export interface LevelDesign {
  sourceKind:'reference-inspired'|'doro-original'; family:LayoutFamily; functionalGroups:number;
  groupBoardCounts:number[]; activeColors:ColorId[]; choices:ChoicePoint[];
  crossBoardSwitches:number; maxBuffer:number; generationPass:number; seed:number;
}
const TITLES = [
  ['先拆掉小烦恼','四块玻璃，认识五种颜色'],['四角大工程','左右都留条路，别急着拆完一边'],
  ['花心里的秘密','先松开花瓣，再找下一组同色'],['两岸来信','两边的盒色，要互相照应'],
  ['交错的糖纸','沿着空隙拆，留住转身的位置'],['薄荷桥下','拆开桥面，会露出一串好颜色'],
  ['Doro 的环抱','中央很诱人，入口却在外圈'],['左右都想要','这一边的钥匙，开另一边的路'],
  ['方格里的风','空出交叉口，下面还有惊喜'],['螺丝大作战','长长一局，记得给暂存留余地'],
  ['草莓四重奏','四个角轮流拆，别把路堵死'],['小爪爪抱紧','先开外圈，再拆掉中心的小麻烦'],
  ['奶茶分岔口','两条分支共享同一只盒子'],['棋盘午后茶','数量稍缓，交叉口仍要看清'],
  ['四角藏宝图','留一颗关键钉，等合适的盒色'],['花瓣邮局','开一层，收一串，慢慢拆到中央'],
  ['左右慢慢来','换一边想想，暂存就有了出口'],['玻璃方程式','横竖两条路，都能通向下一盒'],
  ['云朵工地','四个小工区，接成一个大工程'],['环绕的好心情','中心板释放时，记得先看盒色'],
  ['两杯青柠','长局里的小回落，也留着选择题'],['交叉装箱日','桥下藏着三颗，也藏着新颜色'],
  ['Doro 总动员','别只盯着眼前这一块'],['花心放个假','先给外圈腾位置，再拆中间'],
  ['双线小队长','两条路线交替推进'],['格子糖工厂','拆通一条线，带动另一条线'],
  ['四角接力赛','每次释放，都给下一角留机会'],['甜梦缓冲区','稍短的一局，仍要留好最后一孔'],
  ['最后一杯奶茶','慢一点，跨过最后几个交叉口'],['今天螺丝王','把全部小烦恼，一颗颗拆光'],
] as const;
export const LEVEL_TITLES = TITLES.map(([name,subtitle],index)=>({id:index+1,name,subtitle}));
const FAMILIES:LayoutFamily[]=['quadrants','embrace','branches','lattice'];
const FAMILY_NOTES:Record<LayoutFamily,string[]>={
  quadrants:['四个角分别保留入口，中间桥板会遮住相邻工区的一部分钉。','盒色在多个工区分散，见证跨板交错，不按最高板整板染色。','整板离场后同时露出桥下与旁侧的螺丝，形成局部释放。'],
  embrace:['外围板件环抱中心，不把所有板件叠在同一个中心点。','中央与外圈分担盒色，需要交替开口。','拆开外围缺口后，中心与下一段弧面一起变得可操作。'],
  branches:['左右两条分支具有各自入口，共用上方盒队列。','一侧的暂存颜色需要另一侧完成当前盒后接续。','两侧各有短桥，释放一边时不会自动清空另一边。'],
  lattice:['横向与纵向板件交错，中心交叉口连接多个入口。','相邻格子的目标颜色分散，不能只按单一行列清除。','移开桥板后会露出两条方向上的钉，给玩家重新选择。'],
};
class Random {
  constructor(private value:number) {}
  next():number {let t=this.value+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
  int(n:number):number{return Math.floor(this.next()*n);}
  shuffle<T>(items:readonly T[]):T[]{const out=[...items];for(let i=out.length-1;i>0;i--){const j=this.int(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
function hash(text:string):number{let value=2166136261;for(const char of text){value^=char.charCodeAt(0);value=Math.imul(value,16777619);}return value>>>0;}
function distanceSegment(p:Vec2,a:Vec2,b:Vec2):number{const x=b.x-a.x,y=b.y-a.y;const t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);}
function world(board:BoardDef,p:Vec2):Vec2{const c=Math.cos(board.angle),s=Math.sin(board.angle);return{x:board.x+p.x*c-p.y*s,y:board.y+p.x*s+p.y*c};}
function overlapsHead(p:Vec2,polygon:Vec2[]):boolean{return pointInPolygon(p,polygon)||polygon.some((a,i)=>distanceSegment(p,a,polygon[(i+1)%polygon.length])<=SCREW_RADIUS+.001);}

/** 钉位直接从当前正式素材轮廓里取点；透明凹口和边缘不摆钉。 */
function packedPoints(board:BoardDef,count:number,rng:Random):Vec2[] {
  for(let expansion=0;expansion<5;expansion++){
    const polygon=localOutline(board.shape).map(p=>({x:p.x*board.width,y:p.y*board.height}));
    const candidates:Vec2[]=[];
    for(let y=-board.height/2+17;y<=board.height/2-17;y+=6)for(let x=-board.width/2+17;x<=board.width/2-17;x+=6){
      const p={x,y},w=world(board,p);
      if(w.x<25||w.x>365||w.y<25||w.y>385||!pointInPolygon(p,polygon))continue;
      if(polygon.some((a,i)=>distanceSegment(p,a,polygon[(i+1)%polygon.length])<SCREW_RADIUS+2))continue;
      candidates.push(p);
    }
    for(let trial=0;trial<9&&candidates.length;trial++){
      const selected:Vec2[]=[];
      const first=trial===0?candidates.reduce((best,p)=>Math.hypot(p.x,p.y)<Math.hypot(best.x,best.y)?p:best):candidates[rng.int(candidates.length)];
      selected.push(first);
      while(selected.length<count){
        let best:Vec2|undefined,bestDistance=-Infinity;
        for(const p of candidates){
          const spacing=Math.min(...selected.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));
          if(spacing>bestDistance){best=p;bestDistance=spacing;}
        }
        if(!best||bestDistance<31)break;
        selected.push(best);
      }
      if(selected.length===count)return rng.shuffle(selected);
    }
    board.width=Math.min(248,board.width*1.12);
    board.height=Math.min(216,board.height*1.12);
  }
  throw new Error('轮廓无法容纳安全钉位：'+board.shape+'/'+count);
}
function makeBoard(id:string,x:number,y:number,shape:BoardShape,count:number,depth:number,angle:number,rng:Random,color:ColorId):BoardDef{
  const size=count>=9?[212,184]:count>=7?[176,154]:count>=5?[158,138]:[140,118];
  const board:BoardDef={id,x,y,shape,width:size[0],height:size[1],depth,angle,color,screws:[]};
  const points=packedPoints(board,count,rng);
  board.screws=points.map((p,index)=>({...p,id:id+'-s'+(index+1),color}));
  return board;
}
function anchors(family:LayoutFamily):Vec2[]{
  if(family==='quadrants')return[{x:102,y:111},{x:286,y:110},{x:104,y:305},{x:283,y:307},{x:195,y:206},{x:193,y:108},{x:104,y:208},{x:281,y:211}];
  if(family==='embrace')return[{x:195,y:86},{x:292,y:208},{x:195,y:330},{x:98,y:208},{x:195,y:210},{x:120,y:126},{x:270,y:286},{x:268,y:126}];
  if(family==='branches')return[{x:99,y:109},{x:285,y:113},{x:101,y:305},{x:287,y:302},{x:101,y:208},{x:283,y:210},{x:195,y:139},{x:195,y:275}];
  return[{x:100,y:106},{x:287,y:108},{x:100,y:306},{x:286,y:306},{x:195,y:207},{x:196,y:106},{x:101,y:209},{x:285,y:210}];
}
function pickShape(count:number,slot:number,group:number,family:LayoutFamily,rng:Random):BoardShape{
  const small:BoardShape[]=['cloud','heart','triangle','star','elbow','bow','leaf','doro','crescent','cshape','zigzag'];
  const medium:BoardShape[]=['capsule','elbow','square','notchedSquare','disc','flower','cross'];
  const large:BoardShape[]=['flower','cross','disc','square'];
  let choices=count>=7?large:count>=5?medium:small;
  if(family==='lattice'&&count>=5)choices=['cross','notchedSquare','square','capsule'];
  if(family==='embrace'&&count<=5)choices=['crescent','cshape','leaf','cloud','heart'];
  return choices[(slot+group+rng.int(choices.length))%choices.length];
}
function geometry(id:number,total:number,family:LayoutFamily,rng:Random):BoardDef[]{
  const count=20+2*Math.floor(Math.max(0,total-120)/18);
  const groups=Array.from({length:4},(_,g)=>Math.floor(count/4)+(g<count%4?1:0));
  const positions=anchors(family);
  const configs:Array<{group:number;slot:number;count:number}>=[];
  for(let group=0;group<4;group++)for(let slot=0;slot<groups[group];slot++)configs.push({group,slot,count:3});
  let left=total-configs.length*3;
  const budgetOrder=rng.shuffle(configs.map((_,index)=>index));
  while(left>0){
    let progress=false;
    for(const index of budgetOrder){
      const config=configs[index],capacity=config.slot>=4?12:8;
      if(config.count<capacity&&(rng.next()<.74||left<configs.length)){config.count++;left--;progress=true;if(!left)break;}
    }
    if(!progress)throw new Error('关卡数量超出容量');
  }
  // 保留少量三钉入口，腾出的钉分给宽桥，避免所有板数量趋同。
  for(const config of configs.filter(c=>c.slot===0).slice(0,2)){
    const spare=config.count-3;
    config.count=3;
    for(let n=0;n<spare;n++){
      const recipient=rng.shuffle(configs).find(c=>c!==config&&c.count<(c.slot>=4?12:8));
      if(!recipient)throw new Error('入口数量调整失败');
      recipient.count++;
    }
  }
  // 长局中的宽桥使用十二钉，数量从同组其他板迁入，总量保持不变。
  if(id>=10&&id%5===0){
    const bridge=configs.find(c=>c.group===1&&c.slot===4)!;
    while(bridge.count<12){
      const donor=rng.shuffle(configs).find(c=>c!==bridge&&c.count>3);
      if(!donor)throw new Error('十二钉桥板没有可转移的数量');
      donor.count--;bridge.count++;
    }
  }
  return configs.map((config,index)=>{
    const origin=positions[config.slot%positions.length];
    const x=origin.x+(rng.next()-.5)*14+(config.group%2?5:-5);
    const y=origin.y+(rng.next()-.5)*14;
    const degrees=(family==='lattice'?(config.slot%2?16:-16):rng.next()*34-17)+(config.group%2?7:-7);
    return makeBoard('l'+id+'-b'+(index+1),x,y,pickShape(config.count,config.slot,config.group,family,rng),config.count,config.group,degrees*Math.PI/180,rng,COLORS[rng.int(COLORS.length)]);
  });
}
interface Pin {id:string;board:number;def:BoardDef['screws'][number]; blockers:number[];color:ColorId|null;removed:boolean}
interface Slot {color:ColorId|null;count:number}
class CollectionModel {
  boxes:Slot[];buffer:Array<ColorId|null>=Array(5).fill(null);cursor=2;completed=0;peak=0;
  get occupied():number{return this.buffer.filter(c=>c!==null).length;}
  constructor(readonly queue:ColorId[]){this.boxes=[{color:queue[0],count:0},{color:queue[1],count:0}];}
  accepts(color:ColorId):boolean{return this.boxes.some(box=>box.color===color);}
  private route(color:ColorId):boolean{
    const box=this.boxes.find(b=>b.color===color);
    if(!box)return false;
    if(++box.count===3){this.completed+=3;box.color=this.queue[this.cursor++]??null;box.count=0;}
    return true;
  }
  pick(color:ColorId):boolean{
    if(!this.route(color)){const slot=this.buffer.indexOf(null);if(slot<0)return false;this.buffer[slot]=color;}
    for(;;){const index=this.buffer.findIndex(c=>c!==null&&this.accepts(c));if(index<0)break;const c=this.buffer[index]!;this.buffer[index]=null;this.route(c);}
    this.peak=Math.max(this.peak,this.occupied);
    return this.occupied<5;
  }
}
function makeQueue(total:number,palette:ColorId[],rng:Random):ColorId[]{
  const queue=[...palette];
  while(queue.length<total/3){
    const frequencies=palette.map(color=>queue.filter(c=>c===color).length);
    const minimum=Math.min(...frequencies);
    const options=palette.filter((color,index)=>color!==queue[queue.length-1]&&frequencies[index]<=minimum+2);
    queue.push(options[rng.int(options.length)]);
  }
  return queue;
}
function pinsFor(boards:BoardDef[]):Pin[]{
  const polygons=boards.map(boardPolygon);
  return boards.flatMap((board,own)=>board.screws.map(def=>{
    const p=world(board,def),blockers:number[]=[];
    boards.forEach((upper,index)=>{
      if(index===own||upper.depth<board.depth||(upper.depth===board.depth&&index<own))return;
      if(overlapsHead(p,polygons[index]))blockers.push(index);
    });
    return{id:def.id,board:own,def,blockers,color:null,removed:false};
  }));
}
function construct(boards:BoardDef[],queue:ColorId[],rng:Random):{witness:WitnessStep[];choices:ChoicePoint[];peak:number;switches:number}{
  const pins=pinsFor(boards),remaining=boards.map(b=>b.screws.length),model=new CollectionModel(queue);
  const quota=new Map<ColorId,number>();
  for(const color of queue)quota.set(color,(quota.get(color)??0)+3);
  const witness:WitnessStep[]=[],choices:ChoicePoint[]=[];
  const byId=new Map(pins.map(pin=>[pin.id,pin]));
  const available=()=>pins.filter(pin=>!pin.removed&&pin.blockers.every(b=>remaining[b]===0));
  const paint=(pin:Pin,color:ColorId)=>{if((quota.get(color)??0)<1)throw new Error('颜色需求用尽');pin.color=color;pin.def.color=color;quota.set(color,quota.get(color)!-1);};
  const checkpoints=[0,Math.floor(pins.length*.31),Math.floor(pins.length*.63)];
  let nextCheckpoint=0,lastBoard=-1,switches=0,forced:string|null=null,protectedMoves=0;
  let releasePins=new Set<string>();
  while(witness.length<pins.length){
    const open=available(),openSet=new Set(open.map(p=>p.id));
    const safe=open.filter(pin=>remaining[pin.board]!==2||pins.filter(p=>p.board===pin.board&&!p.removed).every(p=>openSet.has(p.id)));
    if(!safe.length)throw new Error('没有可拆入口');
    if(nextCheckpoint<checkpoints.length&&witness.length>=checkpoints[nextCheckpoint]&&!forced){
      const need=5-model.occupied;
      const candidates=rng.shuffle(safe.filter(p=>p.color===null));
      const chosen:Pin[]=[],perBoard=new Map<number,number>();
      for(const pin of candidates){
        if((perBoard.get(pin.board)??0)>=remaining[pin.board]-2)continue;
        chosen.push(pin);perBoard.set(pin.board,(perBoard.get(pin.board)??0)+1);
        if(chosen.length===need)break;
      }
      const future=queue.slice(model.cursor).filter(c=>!model.accepts(c)&&(quota.get(c)??0)>0);
      const supply=new Map<ColorId,number>();for(const c of new Set(future))supply.set(c,quota.get(c)!);
      if(chosen.length===need&&candidates.length>=need+3&&[...supply.values()].reduce((a,b)=>a+b,0)>=need){
        for(const pin of chosen){
          const colors=rng.shuffle([...supply.keys()].filter(c=>supply.get(c)!>0));
          const color=colors[0];paint(pin,color);supply.set(color,supply.get(color)!-1);
        }
        choices.push({atMove:witness.length,bufferBefore:model.occupied,wrongScrewIds:chosen.map(p=>p.id),explanation:'此时先拿这些非当前盒色会填满第五孔；需先完成盒色或打开另一入口。'});
        nextCheckpoint++;protectedMoves=4;
      }
    }
    const target=protectedMoves>0?0:(witness.length%37<14?3:4);
    const active=new Set(model.boxes.map(box=>box.color).filter((c):c is ColorId=>c!==null));
    const activeTargets=pins.filter(p=>!p.removed&&p.color!==null&&active.has(p.color));
    const blockingScore=(board:number)=>activeTargets.reduce((score,p)=>score+(p.blockers.includes(board)?1:0),0);
    let options=safe.filter(pin=>!pin.color||model.accepts(pin.color)||model.occupied<4);
    if(forced){const pin=options.find(p=>p.id===forced);if(!pin)throw new Error('末钉无法安全结算');options=[pin];}
    const scores=options.map(pin=>{
      const known=pin.color!==null;
      let score=rng.next()*22+(pin.board===lastBoard?-9:14)+blockingScore(pin.board)*11+(releasePins.has(pin.id)?35:0);
      if(known&&model.accepts(pin.color!))score+=85;
      else if(!known)score+=55;
      else score+=model.occupied<target?6:-22;
      if(remaining[pin.board]===2)score+=15;
      return{pin,score};
    }).sort((a,b)=>b.score-a.score);
    const selected=scores[0]?.pin;
    if(!selected)throw new Error('颜色入口已被暂存堵住');
    if(selected.color===null){
      const availableColors=[...quota.keys()].filter(c=>quota.get(c)!>0);
      const matching=availableColors.filter(c=>model.accepts(c));
      const future=availableColors.filter(c=>!model.accepts(c));
      const makePressure=protectedMoves===0&&model.occupied<target&&future.length>0&&rng.next()<.33;
      const palette=makePressure?future:matching.length?matching:future;
      if(!palette.length)throw new Error('无可用颜色');
      const color=palette[rng.int(palette.length)];
      if(!model.accepts(color)&&model.occupied>=4)throw new Error('当前盒所需颜色仍在遮挡下');
      paint(selected,color);
    }
    if(!model.pick(selected.color!))throw new Error('构造路线暂存溢出');
    if(lastBoard!==-1&&lastBoard!==selected.board&&remaining[lastBoard]>0)switches++;
    selected.removed=true;remaining[selected.board]--;
    releasePins.delete(selected.id);
    if(remaining[selected.board]===0){releasePins=new Set(available().filter(pin=>!openSet.has(pin.id)).map(pin=>pin.id));protectedMoves=Math.max(protectedMoves,3);}
    if(remaining[selected.board]===1)forced=pins.find(p=>p.board===selected.board&&!p.removed)!.id;
    else forced=null;
    witness.push({screwId:selected.id,waitMs:remaining[selected.board]===0?1300:24});
    lastBoard=selected.board;protectedMoves=Math.max(0,protectedMoves-1);
  }
  if(model.completed!==pins.length||model.occupied||choices.length<3||switches<8)throw new Error('构造缺少完成条件或交错选择点');
  for(const pin of pins)if(byId.get(pin.id)?.color===null)throw new Error('颜色未落盘');
  return{witness,choices,peak:model.peak,switches};
}
function tutorial(attempt:number):{level:LevelDef;design:LevelDesign}{
  const seed=hash('doro-v2-tutorial-'+attempt),rng=new Random(seed);
  const counts=[3,4,3,5],shapes:BoardShape[]=['heart','notchedSquare','star','notchedSquare'];
  const poses=[[79,300],[128,143],[236,140],[257,296]];
  const boards=counts.map((count,i)=>makeBoard('l1-b'+(i+1),poses[i][0],poses[i][1],shapes[i],count,i===2?1:0,0,rng,['blue','orange','yellow','green'][i] as ColorId));
  const colors:ColorId[][]=[['orange','orange','orange'],['brown','brown','red','brown'],['red','blue','red'],['cyan','cyan','cyan','blue','blue']];
  boards.forEach((board,i)=>board.screws.forEach((screw,j)=>screw.color=colors[i][j]));
  const sequence=[[0,0],[0,1],[0,2],[3,0],[3,1],[3,2],[3,3],[3,4],[2,1],[2,0],[2,2],[1,2],[1,0],[1,1],[1,3]];
  const left=[...counts];
  const witness=sequence.map(([b,s])=>({screwId:boards[b].screws[s].id,waitMs:--left[b]===0?1300:24}));
  const palette:ColorId[]=['orange','cyan','blue','red','brown'];
  return{level:{id:1,name:TITLES[0][0],subtitle:TITLES[0][1],seed,attempt,sourceKind:'reference-inspired',designNotes:['实录第一关量与活跃色：4板、3/4/3/5钉、5色各3颗。','布局和钉位为Doro重制，未声称复制原源码。'],boards,boxQueue:palette,witness},
    design:{sourceKind:'reference-inspired',family:'quadrants',functionalGroups:2,groupBoardCounts:[3,1],activeColors:palette,choices:[],crossBoardSwitches:0,maxBuffer:0,generationPass:0,seed}};
}
const cache=new Map<string,{level:LevelDef;design:LevelDesign}>();
function obtain(id:number,attempt:number):{level:LevelDef;design:LevelDesign}{
  if(!Number.isInteger(id)||id<1||!Number.isInteger(attempt)||attempt<0)throw new RangeError('关卡和尝试编号必须是非负整数，关卡从1开始');
  const geometrySignature=hash(SHAPES.map(shape=>JSON.stringify(localOutline(shape))).join('|'));
  const key=id+'/'+attempt+'/'+geometrySignature;
  const cached=cache.get(key);if(cached)return cached;
  if(id===1){const value=tutorial(attempt);cache.set(key,value);return value;}
  const endless=id>30;
  const total=endless?180+3*((id*7+attempt*11)%17):CAMPAIGN_TOTALS[id-1];
  const sourceKind=id<=10?'reference-inspired':'doro-original';
  const family=id===2?'quadrants':FAMILIES[((id<=10?id-2:id-11)+Math.floor(attempt/2)+(endless?attempt:0))%4];
  const title=endless?'无尽 · '+['四角接力','花心漫游','双线旅行','交错工坊'][FAMILIES.indexOf(family)]:TITLES[id-1][0];
  const subtitle=endless?'新的分区、桥接与盒序 · 第 '+(id-30)+' 次漫游':TITLES[id-1][1];
  let lastError:unknown=null;
  for(let pass=0;pass<96;pass++){
    const seed=hash('doro-v2-content-'+id+'-'+attempt+'-'+pass),rng=new Random(seed);
    try{
      const palette=rng.shuffle(COLORS).slice(0,id===2?8:id===3?10:id<=5?9:10);
      const boards=geometry(id,total,family,rng),queue=makeQueue(total,palette,rng);
      const result=construct(boards,queue,rng);
      const notes=[...FAMILY_NOTES[family],id<=10?'参考实录总量 '+total+' 钉；布局、钉色分布与盒序为Doro重制。':'Doro原创续关，非原作逐关复刻数值。','四个功能层组；同组各板的前后关系不等于额外难度层数。'];
      const level:LevelDef={id,name:title,subtitle,seed,attempt,sourceKind,designNotes:notes,boards,boxQueue:queue,witness:result.witness};
      const design:LevelDesign={sourceKind,family,functionalGroups:4,groupBoardCounts:[0,1,2,3].map(g=>boards.filter(b=>b.depth===g).length),activeColors:palette,choices:result.choices,crossBoardSwitches:result.switches,maxBuffer:result.peak,generationPass:pass,seed};
      const value={level,design};cache.set(key,value);return value;
    }catch(error){lastError=error;}
  }
  throw new Error('无法为关卡 '+id+' 尝试 '+attempt+' 构造已验证布局：'+String(lastError));
}
export function getLevel(id:number,attempt=0):LevelDef{return clone(obtain(id,attempt).level);}
export function getLevelDesign(id:number,attempt=0):LevelDesign{return clone(obtain(id,attempt).design);}


