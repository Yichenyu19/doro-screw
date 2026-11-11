import './geometry-setup';
import {strategyModule} from './strategy-modules';
import type {BoardDef,BoardShape,ColorId,DifficultyProfile,LevelDef,RevealPacket,Vec2,WitnessStep} from './types';
import {COLOR_NAMES} from './types';

import {R2_TOTALS,R2_NAMES,CAMPAIGN_NAMES,CAMPAIGN_TOTALS,R3_NAMES,R3_TOTALS} from './r2-catalog';
export {R2_TOTALS,R2_NAMES,CAMPAIGN_NAMES,CAMPAIGN_TOTALS,R3_NAMES,R3_TOTALS};
const COLORS:ColorId[]=['orange','cyan','red','purple','green','brown','yellow','blue','rose','gray'];
type Pin=[number,number,ColorId];
interface Scene {boards:BoardDef[];queue:ColorId[];route:string[];packets:string[][];critical:string[];decisions:string[];entry:string}
function plate(id:string,shape:BoardShape,x:number,y:number,width:number,height:number,depth:number,pins:Pin[],angle=0):BoardDef {
  return{id,shape,x,y,width,height,depth,angle,color:pins[0][2],geometryVersion:'v4',screws:pins.map(([x,y,color],i)=>({x,y,color,id:id+'-'+i}))};
}
function rotation(board:BoardDef,angle:number):void {
  const x=board.x-195,y=board.y-210;
  board.x=195+x*Math.cos(angle)-y*Math.sin(angle);board.y=210+x*Math.sin(angle)+y*Math.cos(angle);board.angle+=angle;
}
const row=(color:ColorId,span=35):Pin[]=>[[-span,0,color],[0,0,color],[span,0,color]];
const ids=(board:BoardDef)=>board.screws.map(s=>s.id);
function corners(prefix:string,palette:ColorId[],depth:number,orientation:number):Scene {
  const [a,b,r,c,d,s,t,u]=palette;
  const nw=plate(prefix+'-nw','square',100,130,120,100,depth,row(a));
  const ne=plate(prefix+'-ne','cloud',290,130,126,102,depth,row(b));
  const sw=plate(prefix+'-sw','square',100,282,120,100,depth,row(c));
  const se=plate(prefix+'-se','cloud',290,282,126,102,depth,row(d));
  const north=plate(prefix+'-north','capsule',195,130,342,74,depth+2,row(r,132));
  const south=plate(prefix+'-south','capsule',195,282,342,74,depth+2,row(s,132));
  const middle=plate(prefix+'-middle','capsule',195,208,132,66,depth+1,row(t));
  const bottom=plate(prefix+'-bottom','capsule',195,361,132,62,depth+1,row(u));
  const boards=[nw,ne,sw,se,middle,bottom,north,south];boards.forEach(b=>rotation(b,orientation));
  return{boards,queue:[a,b,r,c,d,s,t,u],route:[north,nw,ne,south,sw,se,middle,bottom].flatMap(ids),packets:[[nw.id,ne.id,north.id],[sw.id,se.id,south.id],[middle.id,bottom.id]],critical:[north.id,south.id],decisions:[`辨认${prefix}两座桥：只有一边的下层供给当前两盒。`,`给当前盒色的桥保留三孔；另一桥和中间旁支也能拆，但会消耗同一份暂存。`],entry:north.screws[2].id};
}
function timing(prefix:string,palette:ColorId[],depth:number,orientation:number):Scene {
  const [a,b,c,x,d,e,f]=palette;
  const top=plate(prefix+'-temptation','capsule',195,73,155,70,depth+5,[[-45,0,a],[45,0,a],[0,0,a]]);
  const main=plate(prefix+'-center','capsule',195,200,342,142,depth+4,[[-130,-40,x],[-47,-40,x],[47,40,x],[130,40,x],[0,0,a]]);
  const left=plate(prefix+'-west','square',100,202,120,100,depth,row(b));
  const right=plate(prefix+'-east','square',290,202,120,100,depth,row(c));
  const key=plate(prefix+'-west-key','capsule',100,202,126,70,depth+2,row(d));
  const late=plate(prefix+'-south','capsule',195,317,330,96,depth+2,[[-110,0,a],[-35,0,x],[35,0,a],[110,0,x]]);
  const sw=plate(prefix+'-sw','cloud',100,343,126,102,depth,row(e));
  const se=plate(prefix+'-se','cloud',290,343,126,102,depth,row(f));
  const boards=[left,right,sw,se,key,late,main,top];boards.forEach(b=>rotation(b,orientation));
  const route=[...ids(top).slice(0,2),...ids(main).slice(0,4),main.screws[4].id,...ids(right),...ids(key),...ids(left),top.screws[2].id,late.screws[0].id,late.screws[2].id,late.screws[1].id,late.screws[3].id,...ids(sw),...ids(se)];
  return{boards,queue:[a,b,c,x,d,a,x,e,f],route,packets:[[top.id,main.id,right.id],[left.id,key.id,late.id],[sw.id,se.id]],critical:[main.id,key.id],decisions:[`${prefix}：当前盒只差一颗时，比较外围同色钉与中央承重钉。`,`提前用外围同色钉换盒，会让中央承重钉也占用暂存；四颗开路钉仍未回流时不能再多存一颗。`,`中央打开后的颜色先接走四颗开路暂存，再给左侧挡板打开新盒。`],entry:main.screws[3].id};
}
function petals(prefix:string,palette:ColorId[],depth:number,orientation:number,withReturn=true):Scene {
  const [a,b,c,x,d,y,e,f,g]=palette;
  const heart=plate(prefix+'-heart','flower',195,210,150,154,depth+1,[[-20,-20,a],[20,-20,c],[0,35,c]]);
  const supply=plate(prefix+'-inner','disc',195,210,126,110,depth,row(d));
  const left=plate(prefix+'-left','cshape',100,210,140,240,depth+2,[[-20,-80,a],[-20,80,a],[-50,0,b]]);
  const right=plate(prefix+'-right','cshape',290,210,140,240,depth+2,[[20,-80,b],[20,80,b]],Math.PI);
  const cap=plate(prefix+'-cap','capsule',195,155,320,100,depth+4,[[-125,0,x],[125,0,x],[-44,0,x],[44,0,c]]);
  const sw=plate(prefix+'-sw','cloud',100,345,126,100,depth,row(e));
  const se=plate(prefix+'-se','cloud',290,345,126,100,depth,row(f));
  const gate=plate(prefix+'-base','capsule',195,345,330,72,depth+3,row(y,130));
  const last=plate(prefix+'-return','capsule',195,64,132,60,depth+3,row(g));
  const boards=[supply,heart,sw,se,left,right,cap,gate,...(withReturn?[last]:[])];boards.forEach(board=>rotation(board,orientation));
  return{boards,queue:[a,b,c,x,d,y,e,f,...(withReturn?[g]:[])],route:[...ids(cap),...ids(left),heart.screws[0].id,...ids(right),...ids(heart).slice(1),...ids(supply),...ids(gate),...ids(sw),...ids(se),...(withReturn?ids(last):[])],packets:[[cap.id,left.id,right.id],[heart.id,supply.id,gate.id],[sw.id,se.id,...(withReturn?[last.id]:[])]],critical:[cap.id,left.id,right.id,heart.id],entry:cap.screws[2].id,decisions:['当前两盒的三颗钉分布在外围与花心，清掉一侧还不能独自凑盒。','开路钉包含两种暂存颜色，先打开花心里的补色接回其中一种，再回到另一片花瓣。外圈完成后，中心内层才有当前盒。']};
}
function junction(prefix:string,palette:ColorId[],depth:number,orientation:number,splitBridge=false):Scene {
  const scene=corners(prefix,palette,depth,0),[a,b,r,c,d,s,t,u,v]=palette;
  const vertical=plate(prefix+'-vertical','capsule',290,205,74,342,depth+1,[[0,-75,v],[0,0,v],[0,130,v]]);scene.boards.push(vertical);
  const board=(name:string)=>scene.boards.find(b=>b.id===prefix+'-'+name)!;
  if(splitBridge){const north=board('north'),south=board('south'),last=south.screws.pop()!;north.screws[1].x=-44;north.screws.push({id:north.id+'-3',x:44,y:0,color:last.color});scene.decisions.push('共同横板还带着另一座桥的一颗颜色；整拆需要四孔，留下支点可能省孔，但必须比较两个后续入口。');}
  scene.queue=[a,b,r,v,c,d,s,t,u];scene.route=[board('north'),board('nw'),vertical,board('ne'),board('south'),board('sw'),board('se'),board('middle'),board('bottom')].flatMap(ids);
  scene.packets=[[prefix+'-north',vertical.id,prefix+'-nw'],[prefix+'-south',prefix+'-ne',prefix+'-sw'],[prefix+'-se',prefix+'-middle',prefix+'-bottom']];
  scene.critical=[prefix+'-north',vertical.id,prefix+'-south'];scene.decisions=['横板既挡住左侧当前盒色，又压住竖板的一颗钉；竖板还挡着右侧当前盒。',`看起来只剩两颗露出钉的竖板不能自行拆完。共同横板整拆需要${splitBridge?'四':'三'}孔，左侧装箱后才有盒接走竖板颜色。`,...(splitBridge?['横板带有两种开路颜色；留下端部支点可能省孔，要比较两个后续入口能否一起露出。']:[])];scene.boards.forEach(board=>rotation(board,orientation));return scene;
}
function carry(previous:Scene,next:Scene):void {
  const left=previous.boards.flatMap(b=>b.screws).find(s=>s.id===previous.route.at(-1))!;
  const right=next.boards.flatMap(b=>b.screws).find(s=>s.id===next.entry)!;
  if(left.color===right.color)throw Error(`跨段库存需要不同的两种颜色：${left.id} → ${right.id}`);
  [left.color,right.color]=[right.color,left.color];
  previous.decisions.push('本段末钉会提前占一孔，未完成的旧盒要靠下一批关键板上的一颗钉补齐。');
  next.decisions.push('先给旧盒接上最后一颗，再拿到下一盒所需的供给；显层不清空暂存，也不重置半盒。');
}
function carryTwo(previous:Scene,next:Scene):void {
  const owner=next.boards.find(b=>b.screws.some(s=>s.id===next.entry))!,targets=next.route.filter(id=>owner.screws.some(s=>s.id===id)).slice(0,2);
  const prior=previous.route.slice(-2).map(id=>previous.boards.flatMap(b=>b.screws).find(s=>s.id===id)!);
  const later=targets.map(id=>owner.screws.find(s=>s.id===id)!);
  for(let i=0;i<2;i++){if(prior[i].color===later[i].color)throw Error('两颗跨层补色必须实际改变供给');[prior[i].color,later[i].color]=[later[i].color,prior[i].color];}
  previous.decisions.push('段末有两颗颜色先进入暂存；旧盒尚缺的供给位于下一批关键板上。');next.decisions.push('显层后仍带着两颗库存，先认清旧盒的缺口，决定哪些钉可以继续延后。');
}
function splitInventory(scene:Scene):void {
  const main=scene.boards.find(b=>b.id.endsWith('-center'))!,late=scene.boards.find(b=>b.id.endsWith('-south'))!,end=scene.boards.find(b=>b.id.endsWith('-se'))!;
  for(let i=0;i<2;i++)[main.screws[i].color,end.screws[i].color]=[end.screws[i].color,main.screws[i].color];
  const pin=late.screws[1].id;scene.route=scene.route.filter(id=>id!==pin);scene.route.splice(10,0,pin);
  scene.decisions.push('四颗开路钉分属两色。新盒只接走两颗，第三颗要从外围补；另一色继续占两孔直到尾部。');
}
function dividedSupply(scene:Scene,orientation:number):void {
  const left=scene.boards.find(b=>b.id.endsWith('-west'))!,top=scene.boards.find(b=>b.id.endsWith('-temptation'))!;
  // 上方只能先拿到两颗；第三颗仍需解除中央板。两个开口之间不能各自凑盒。
  const replacement=plate(left.id,'capsule',195,170,135,234,left.depth,[[-40,-75,left.screws[0].color],[40,-75,left.screws[1].color],[0,40,left.screws[2].color]]);rotation(replacement,orientation);Object.assign(left,replacement);
  top.screws[1].x=45;top.screws[2].x=0;
  const last=top.screws[2].id;scene.route=scene.route.filter(id=>id!==last);const firstLeft=scene.route.indexOf(left.screws[0].id);scene.route.splice(firstLeft,0,last);
  scene.decisions.push('上方开口虽能露出两颗当前盒色，第三颗却仍被中央压住；先清掉看似高收益的小板，可能让中央同色承重钉失去当前盒。');
}
function hinges(prefix:string,palette:ColorId[],depth:number,orientation:number,distributed:boolean|'first'|'last'=false):Scene {
  const halves=[0,1].map(i=>{
    const part=strategyModule('hinge',prefix+'-h'+i,Array.from({length:5},(_,n)=>palette[(n+i*5)%palette.length]));
    part.boards.forEach(b=>{b.depth=depth-i*4+b.depth-5;rotation(b,orientation+(i?Math.PI:0));});
    const gate=part.boards.find(b=>b.id.endsWith('-hinge'))!,lock=part.boards.find(b=>b.id.endsWith('-lock'))!;
    let route=part.witness.map(s=>s.screwId);
    const scattered=distributed===true||distributed===(i===0?'first':'last');
    if(scattered){
      const window=part.boards.find(b=>b.id.endsWith('-window'))!,finish=part.boards.find(b=>b.id.endsWith('-finish'))!;
      [window.screws[1].color,lock.screws[2].color]=[lock.screws[2].color,window.screws[1].color];
      [window.screws[2].color,finish.screws[4].color]=[finish.screws[4].color,window.screws[2].color];
      route=[gate.screws[1].id,gate.screws[2].id,...ids(window),lock.screws[2].id,finish.screws[4].id,lock.screws[0].id,finish.screws[2].id,lock.screws[1].id,gate.screws[0].id,finish.screws[3].id,finish.screws[0].id,finish.screws[1].id];
    }
    const scene:Scene={boards:part.boards,queue:part.queue,route,packets:[[gate.id,lock.id],part.boards.filter(b=>b!==gate&&b!==lock).map(b=>b.id)],critical:[gate.id,lock.id],decisions:[part.curriculum.decision,part.curriculum.failure,...(scattered?['窗口打开后只能得到一颗当前盒色；另两颗分在锁板和底座。需带着四颗暂存完成这条跨板供给链。']:[])],entry:gate.screws[2].id};
    return scene;
  });
  carry(halves[0],halves[1]);
  return{boards:halves.flatMap(s=>s.boards),queue:halves.flatMap(s=>s.queue),route:halves.flatMap(s=>s.route),packets:halves.flatMap(s=>s.packets),critical:halves.flatMap(s=>s.critical),decisions:halves.flatMap(s=>s.decisions),entry:halves[0].entry};
}
function guardedHinges(prefix:string,palette:ColorId[],depth:number,orientation:number):Scene {
  const scene=hinges(prefix,palette,depth,orientation),guard=plate(prefix+'-relay','capsule',195,275,300,68,depth+1.5,[[-30,0,palette[5]],[40,0,palette[5]],[105,0,palette[5]]]);rotation(guard,orientation);scene.boards.push(guard);
  scene.queue.splice(2,0,palette[5]);scene.route.splice(5,0,...ids(guard));scene.packets[0].push(guard.id);scene.critical.push(guard.id);
  scene.decisions.push('窗口供给完成后先开接力盒，接力板既压住底座，也提前使用另一岸稍后还会出现的盒色。');return scene;
}
function singleHinge(prefix:string,palette:ColorId[],depth:number):Scene {
  const part=strategyModule('hinge',prefix,palette.slice(0,5));part.boards.forEach(b=>b.depth+=depth-5);
  const gate=part.boards.find(b=>b.id.endsWith('-hinge'))!,lock=part.boards.find(b=>b.id.endsWith('-lock'))!;
  return{boards:part.boards,queue:part.queue,route:part.witness.map(s=>s.screwId),packets:[[gate.id,lock.id],part.boards.filter(b=>b!==gate&&b!==lock).map(b=>b.id)],critical:[gate.id,lock.id],entry:part.witness[1].screwId,decisions:['最后一次开窗仍带着前层库存；根据旧盒缺口决定先收哪颗支点。']};
}
function profile(theme:string,decisions:string[],critical:string[],depth:number):DifficultyProfile {
  return{theme,decisions,dependencies:critical.slice(1).map((to,i)=>({from:critical[i],to,reason:'上一处开路改变当前盒序与后续开路所需空孔'})),planningDepth:depth,crossRegionLinks:critical.length,crossRevealLinks:0,bufferMargin:1,predecessorComparison:'待统一策略与整局物理对照验收。',originalComparison:'原作录像的四阶段画面已归档；待关键状态逐项对照。',verification:'pending',evidence:[]};
}
function assemble(id:number,scenes:Scene[],initialIds:string[],name:string=R2_NAMES[id-1],expectedTotal:number=R2_TOTALS[id-1],revision=2):LevelDef {
  const boards=scenes.flatMap(s=>s.boards),initial=new Set(initialIds),packets:RevealPacket[]=[];
  for(const [index,scene]of scenes.entries())for(const [part,boardIds]of scene.packets.entries()){
    const reserved=boardIds.filter(id=>!initial.has(id));if(!reserved.length)continue;
    if(reserved.length<2||reserved.length>3)throw Error('每批后备必须为2至3块板');
    packets.push({id:`act-${index+1}-${part+1}`,boardIds:reserved,requiresCleared:index>0?scenes[index-1].critical:[]});
  }
  boards.forEach(b=>{b.reserved=!initial.has(b.id);});
  const count=new Map(boards.map(b=>[b.id,b.screws.length])),owners=new Map(boards.flatMap(b=>b.screws.map(s=>[s.id,b.id] as const)));
  const witness:WitnessStep[]=scenes.flatMap(s=>s.route).map(screwId=>{const board=owners.get(screwId)!;const left=count.get(board)!-1;count.set(board,left);return{screwId,waitMs:left===0?1300:50,waitForExposure:true};});
  const total=boards.reduce((n,b)=>n+b.screws.length,0);
  if(total!==expectedTotal)throw Error(`第${id}关总量${total}不符`);
  const decisions=scenes.flatMap(s=>s.decisions),critical=scenes.flatMap(s=>s.critical);
  return{id,name,subtitle:'先看上下两处供给，再决定把空孔花在哪里',seed:(revision>=3?0x430000:0x420000)+id,attempt:0,mode:'campaign',contentRevision:revision,contentVersion:'v4',geometryVersion:'v4',theme:'quadrants',sourceKind:'doro-original',boards,boxQueue:scenes.flatMap(s=>s.queue),witness,revealPlan:{threshold:4,stableMs:250,packets},difficulty:profile(name,decisions,critical,id),strategy:'当前盒需要的颜色被哪座桥挡住？留意另一座桥会先占去几孔。',designNotes:['全关五轮双桥供给关系，开路决策持续到最后一轮；没有通用随机尾段。','初始十四块板；后续每批2至3块从更深处显露。盒序、颜色与显层蓝图在开局固定。'],curriculum:{objective:'在两座桥之间选择先投资哪一侧',prerequisites:['同色三颗装箱'],decision:decisions[0],failure:'把旁支颜色提前放进暂存，会挤掉当前盒色桥的开路空间。',release:'解除一座桥后，两个工区补齐当前盒，并接回开路暂存。',criticalBoardIds:critical,stages:scenes.map((s,i)=>({until:scenes.slice(0,i+1).reduce((n,s)=>n+s.route.length,0),title:`第${i+1}段 · 两处桥接`,advice:'比较两座桥下面的颜色。先拆哪座，会改变随后两盒接走什么。'}))}};
}

export function getR2Practice(theme:number,variant:number,revision=2):LevelDef {
  if(!Number.isInteger(theme)||theme<2||theme>8||!Number.isInteger(variant)||variant<0||variant>=6)throw Error('挑战主题或编排无效');
  const palette=(i:number)=>Array.from({length:10},(_,n)=>COLORS[(n+i*3+variant)%10]),prefix=(i:number)=>`r2-t${theme}-v${variant}-a${i+1}`,angle=(i:number)=>(i+variant)%2?Math.PI:0;
  let scenes:Scene[];
  if(theme===2){scenes=Array.from({length:variant===5?4:3},(_,i)=>corners(prefix(i),palette(i),60-i*12,angle(i)));
    if(variant===2||variant===3)for(const scene of scenes){const a=scene.boards.find(b=>b.id.endsWith('-nw'))!,b=scene.boards.find(b=>b.id.endsWith('-ne'))!;for(let i=0;i<2;i++)[a.screws[i].color,b.screws[i].color]=[b.screws[i].color,a.screws[i].color];}
    if(variant===4)for(const scene of scenes){const a=scene.boards.find(b=>b.id.endsWith('-middle'))!,b=scene.boards.find(b=>b.id.endsWith('-south'))!;for(let i=0;i<2;i++)[a.screws[i].color,b.screws[i].color]=[b.screws[i].color,a.screws[i].color];}
  }else if(theme===3){scenes=Array.from({length:3},(_,i)=>variant===2&&i===1?corners(prefix(i),palette(i),60-i*12,angle(i)):petals(prefix(i),palette(i),60-i*12,angle(i),variant===5?i===0:variant!==1&&variant!==4));}
  else if(theme===4){scenes=Array.from({length:3},(_,i)=>timing(prefix(i),palette(i),60-i*12,angle(i)));if(variant===1||variant===4)splitInventory(scenes[1]);if(variant===2||variant===5)dividedSupply(scenes[2],angle(2));}
  else if(theme===5){scenes=Array.from({length:3},(_,i)=>variant===2&&i===1?hinges(prefix(i),palette(i),60-i*14,0):variant===5&&i===2?corners(prefix(i),palette(i),60-i*14,angle(i)):junction(prefix(i),palette(i),60-i*14,angle(i)));
    if(variant===3||variant===4)for(const scene of scenes){const a=scene.boards.find(b=>b.id.endsWith(variant===3?'-vertical':'-middle'))!,b=scene.boards.find(b=>b.id.endsWith('-south'))!;for(let i=0;i<(variant===3?1:2);i++)[a.screws[i].color,b.screws[i].color]=[b.screws[i].color,a.screws[i].color];}
  }
  else if(theme===6){scenes=[junction(prefix(0),palette(0),60,angle(0)),timing(prefix(1),palette(1),44,angle(1)),variant===2||variant===5?timing(prefix(2),palette(2),28,angle(2)):variant===4?junction(prefix(2),palette(2),28,angle(2)):corners(prefix(2),palette(2),28,angle(2))];splitInventory(scenes[1]);if(variant===3)dividedSupply(scenes[1],angle(1));}
  else if(theme===7){scenes=Array.from({length:3},(_,i)=>(variant===5?i===0:variant%2&&i===1)?guardedHinges(prefix(i),palette(i),64-i*16,0):hinges(prefix(i),palette(i),64-i*16,0,(variant>=2&&i===2)||(variant===4&&i===1)));}
  else {scenes=[variant%2?guardedHinges(prefix(0),palette(0),64,0):hinges(prefix(0),palette(0),64,0,variant===2),timing(prefix(1),palette(1),44,angle(1)),variant>=3?timing(prefix(2),palette(2),28,angle(2)):junction(prefix(2),palette(2),28,angle(2))];splitInventory(scenes[1]);if(variant>=3)dividedSupply(scenes[2],angle(2));if(variant===5)splitInventory(scenes[2]);}
  if(theme>=3||variant===1||variant===3||variant===5)for(let i=1;i<scenes.length;i++){
    const previous=scenes[i-1],next=scenes[i],two=theme===6,oldIds=previous.route.slice(two?-2:-1),owner=next.boards.find(b=>b.screws.some(s=>s.id===next.entry))!,newIds=two?next.route.filter(id=>owner.screws.some(s=>s.id===id)).slice(0,2):[next.entry];
    const oldPins=oldIds.map(id=>previous.boards.flatMap(b=>b.screws).find(s=>s.id===id)!),newPins=newIds.map(id=>owner.screws.find(s=>s.id===id)!);
    while(oldPins.some((pin,j)=>pin.color===newPins[j].color)){for(const b of next.boards){for(const s of b.screws)s.color=COLORS[(COLORS.indexOf(s.color)+1)%10];b.color=b.screws[0].color;}next.queue=next.queue.map(c=>COLORS[(COLORS.indexOf(c)+1)%10]);}
    if(two)carryTwo(previous,next);else carry(previous,next);
  }
  const initial=[...scenes[0].boards.map(b=>b.id),...scenes[1].packets.slice(0,2).flat()],total=scenes.reduce((n,s)=>n+s.route.length,0),level=assemble(theme,scenes,initial,R2_NAMES[theme-1],total,revision);
  if(total<60||total>120)throw Error('主题挑战总量必须保持在60至120颗');
  level.name=R2_NAMES[theme-1]+' · 精修 '+(variant+1);level.subtitle='熟悉的主题，新的供给安排';level.mode='mastery';level.tutorial=false;level.strategy='比较当前盒、预告和挡板关系，再决定开路顺序。';
  level.curriculum!.objective='在不同供给编排中重新解决这个主题';level.curriculum!.stages.forEach((s,i)=>{s.title=`第${i+1}段 · 接好供给`;s.advice=level.strategy!;});level.designNotes=[`主题${theme}的第${variant+1}种确定编排。${total}颗，所有供给和后备在开局确定。`,'编排变化包括分散供给、单色与双色开路、跨段库存、连接次序及板件方向。'];return level;
}

export function getR2Prototype(id:number):LevelDef {
  if(id===1){
    const part=strategyModule('hinge','r2-l1',COLORS.slice(0,5));
    const scene:Scene={boards:part.boards,queue:part.queue,route:part.witness.map(s=>s.screwId),packets:[],critical:[part.hinge!.boardId],entry:part.witness[0].screwId,decisions:['比较留下不同支点时，下层入口会朝哪里展开。','拆非当前盒色要占用暂存；决定先开路还是先处理旁边的小板。']};
    const level=assemble(1,[scene],scene.boards.map(b=>b.id));level.theme='hinge';level.hinge=part.hinge;level.tutorial=true;level.subtitle='留下一颗，也是一种选择';level.strategy='先看当前盒色，再观察哪些支点能让下面的入口露出。';level.revealPlan=undefined;
    level.designNotes=['四块板构成完整的15颗支点题，保留真实单钉摆动。','规则教学不点名颜色和位置，也不自动给出整条解法。'];level.curriculum={...part.curriculum,objective:'理解支点和有限暂存的取舍',decision:scene.decisions[0],stages:[{until:5,title:'先看支点与空孔',advice:'同色三颗装一盒，其他颜色暂存。只剩一钉时，玻璃会围绕它摆动。'},{until:15,title:'接回暂存的颜色',advice:'新盒出现会自动接回同色钉。留意哪处入口可以帮助你打开下一盒。'}]};return level;
  }
  if(id===3){
    const scenes=Array.from({length:5},(_,i)=>i<3?petals(`r2-l3-a${i+1}`,Array.from({length:9},(_,n)=>COLORS[(n+i*3)%COLORS.length]),(5-i)*8,i%2?Math.PI:0):corners(`r2-l3-a${i+1}`,Array.from({length:9},(_,n)=>COLORS[(n+i*3)%COLORS.length]),(5-i)*8,i%2?Math.PI:0));
    for(let i=1;i<scenes.length;i++)carry(scenes[i-1],scenes[i]);
    const level=assemble(3,scenes,[...scenes[0].boards.map(b=>b.id),...scenes[1].packets.slice(0,2).flat()]);level.theme='embrace';level.subtitle='花心打开之后，还要回到外圈';level.strategy='当前盒缺的第三颗，可能在另一个开口里。';level.difficulty!.crossRevealLinks=4;
    level.designNotes=['三段27颗花心供给接到两段24颗外圈桥接；花心形成的半盒影响随后外围开路。','四处跨段补色：前一段最后一盒由后一段关键板补齐，显层不清空库存。'];level.curriculum!.objective='中心与外围交替供给，完成当前盒后再处理中心内层';level.curriculum!.stages.forEach((s,i)=>{s.title=`第${i+1}段 · 内外相接`;s.advice='比较中心和两侧各还缺哪一颗；打开中心后，别忘了另一侧的补色。';});return level;
  }
  if(id===5){
    const offsets=[0,3,6,8,2],palette=(i:number)=>Array.from({length:10},(_,n)=>COLORS[(n+offsets[i])%10]);
    const scenes=[junction('r2-l5-a1',palette(0),64,0,true),junction('r2-l5-a2',palette(1),52,Math.PI,true),junction('r2-l5-a3',palette(2),40,0,true),hinges('r2-l5-a4',palette(3),28,0),hinges('r2-l5-a5',palette(4),14,0,'last')];
    for(let i=1;i<scenes.length;i++)carry(scenes[i-1],scenes[i]);
    const level=assemble(5,scenes,[...scenes[0].boards.map(b=>b.id),...scenes[1].packets.slice(0,2).flat()]);level.theme='lattice';level.subtitle='这一块，能给几处让路？';level.strategy='比较共同挡板解除后，哪些工区和下一座桥可以一起推进。';level.difficulty!.crossRevealLinks=6;
    level.curriculum!.objective='比较共同挡板的整体收益，再把两侧解开的供给接到后层';level.curriculum!.stages.forEach((s,i)=>{s.title=i<3?`路口 ${i+1} · 共同遮挡`:`接力 ${i-2} · 支点开窗`;s.advice='剩下的钉少，不一定先拆它更划算。看它自己还被哪块板挡着。';});level.designNotes=['前三处交叉路口各27颗：横板同时挡住当前盒色与竖板关键钉。','后两组双侧窗口各30颗，与路口共享半盒和库存；没有随机尾段。'];return level;
  }
  if(id===6){
    const offsets=[0,3,6,8,2,5],palette=(i:number)=>Array.from({length:10},(_,n)=>COLORS[(n+offsets[i])%10]);
    const tail=singleHinge('r2-l6-a6',palette(5),0);
    const scenes=[junction('r2-l6-a1',palette(0),64,0,true),junction('r2-l6-a2',palette(1),52,Math.PI,true),junction('r2-l6-a3',palette(2),40,0,true),hinges('r2-l6-a4',palette(3),28,0),hinges('r2-l6-a5',palette(4),14,0,'last'),tail];
    for(let i=1;i<scenes.length;i++){if(i===5)carryTwo(scenes[i-1],scenes[i]);else carry(scenes[i-1],scenes[i]);}
    const level=assemble(6,scenes,[...scenes[0].boards.map(b=>b.id),...scenes[1].packets.slice(0,2).flat()]);level.theme='cascade';level.subtitle='给还没露出的那一层，留点余地';level.strategy='旧盒缺什么、暂存里留了什么，会一起进入下一次显层。';level.difficulty!.crossRevealLinks=8;
    level.curriculum!.objective='库存跨层接力，结合半盒和预告规划下一批开路';level.curriculum!.stages.forEach((s,i)=>{s.title=`第${i+1}批 · 库存随身`;s.advice='新玻璃露出时，空孔没有重置。先接上旧盒，再考虑旁边的顺手钉。';});level.designNotes=['完整保留上一关的共同路口与两岸供给，再连接15颗库存残局。','前四次交接保留单颗库存，最后一次保留双颗；最后一盒不能在原来的终点独立完成。'];return level;
  }
  if(id===7){
    const offsets=[0,3,6,9,2],palette=(i:number)=>Array.from({length:10},(_,n)=>COLORS[(n+offsets[i])%10]);
    const scenes=[guardedHinges('r2-l7-a1',palette(0),70,0),hinges('r2-l7-a2',palette(1),56,0),guardedHinges('r2-l7-a3',palette(2),42,Math.PI),hinges('r2-l7-a4',palette(3),28,0),hinges('r2-l7-a5',palette(4),14,0,true)];
    for(let i=1;i<scenes.length;i++)carry(scenes[i-1],scenes[i]);
    const level=assemble(7,scenes,[...scenes[0].boards.map(b=>b.id),...scenes[1].packets.slice(0,2).flat()]);level.theme='interlock';level.subtitle='这一岸松开，另一岸才接得住';level.strategy='先选支点，再把两岸缺的颜色接起来。';level.difficulty!.crossRevealLinks=9;
    level.curriculum!.objective='两岸供给、接力盒和单钉窗口相互依赖，用有限库存打破循环';level.curriculum!.stages.forEach((s,i)=>{s.title=`接力 ${i+1} · 两岸之间`;s.advice='一侧盒里的空位，可能要等另一侧的关键钉来补。保留能稳定开窗的支点。';});level.designNotes=['两组33颗接力结构和三组30颗双岸结构，共156颗。','两岸之间与结构之间都保留跨侧库存；最后一组将当前盒色分散在窗口、锁板和底座。'];return level;
  }
  if(id===8){
    const offsets=[0,3,6,9,2,5],palette=(i:number)=>Array.from({length:10},(_,n)=>COLORS[(n+offsets[i])%COLORS.length]);
    const scenes=[guardedHinges('r2-l8-open',palette(0),70,0),hinges('r2-l8-window',palette(1),56,0),guardedHinges('r2-l8-middle',palette(2),42,Math.PI),timing('r2-l8-reply',palette(3),28,0),hinges('r2-l8-return',palette(4),14,0,true),singleHinge('r2-l8-last',palette(5),0)];
    splitInventory(scenes[3]);dividedSupply(scenes[3],0);
    for(let i=1;i<scenes.length;i++){if(i===5)carryTwo(scenes[i-1],scenes[i]);else carry(scenes[i-1],scenes[i]);}
    const level=assemble(8,scenes,[...scenes[0].boards.map(b=>b.id),...scenes[1].packets.slice(0,2).flat()]);
    level.theme='embrace';level.subtitle='把上一层的选择，接到最后一盒';level.strategy='先看未完成的盒，再决定给下一层留下什么。';
    level.difficulty!.crossRevealLinks=10;
    level.curriculum!.objective='把开路、装箱时机和支点选择接成三阶段的完整资源安排';
    level.curriculum!.stages=[{until:63,title:'第一幕 · 两岸入局',advice:'保留一孔接下一岸，旧盒的最后一颗可能在关键挡板上。'},{until:123,title:'第二幕 · 花心有后手',advice:'先比较同色钉的结构作用，再决定何时装满。'},{until:168,title:'第三幕 · 接好最后一盒',advice:'分散的盒色和两颗库存还要接过最后一个窗口，再把最后几色接回家。'}];
    level.designNotes=['三阶段为63、60、45颗；前段留下的半盒和暂存会进入后段。','保留第七关前三组接力，接到装箱时机题，再以分散供给和双颗库存连接最后一窗；末段仍有支点与顺序取舍，之后才连续清空。'];
    return level;
  }
  if(id===4){
    const scenes=Array.from({length:5},(_,i)=>timing(`r2-l4-a${i+1}`,Array.from({length:7},(_,n)=>COLORS[(n+i*3)%COLORS.length]),(5-i)*8,i%2?Math.PI:0));
    const level=assemble(4,scenes,[...scenes[0].boards.map(b=>b.id),...scenes[1].packets.slice(0,2).flat()]);
    level.theme='cascade';level.subtitle='第三颗，选哪一颗？';level.strategy='同色钉也有先后：看这一次装箱，会留下什么遮挡。';
    level.designNotes=['全关五处装箱时机问题，中央承重钉、外围诱饵和左侧续盒互相约束。','每段27颗；8块板共同构成一段供给关系，没有随机扩充板件。'];
    level.curriculum!.objective='在当前盒的最后一格里，优先处理将来更难移开的承重钉';
    level.curriculum!.stages.forEach((stage,i)=>{stage.title=`第${i+1}段 · 先看承重`;stage.advice='装满当前盒之前，比较同色钉下面的入口和暂存余量。';});
    return level;
  }
  if(id!==2)throw Error('该代表样机仍在编排');
  const orientations=[0,Math.PI,Math.PI/2,-Math.PI/2,0];
  const scenes=orientations.map((orientation,i)=>corners(`r2-l2-a${i+1}`,Array.from({length:8},(_,n)=>COLORS[(n+i*3)%COLORS.length]),(5-i)*4,orientation));
  const level=assemble(2,scenes,[...scenes[0].boards.map(b=>b.id),...scenes[1].boards.filter(b=>['north','south','nw','ne'].some(name=>b.id.endsWith('-'+name))).map(b=>b.id)]);level.designNotes=['全关五轮双桥供给关系，关键开路选择贯穿全关。','初始十二块板，后层的下半区与旁支供给按低入口条件显露，避免开局过早跨段借色。'];return level;
}

function oldL2Palette(sceneIndex:number):ColorId[]{
  const wheel=COLORS.filter(color=>color!=='gray');
  return Array.from({length:8},(_,n)=>wheel[(n+sceneIndex*3)%wheel.length]);
}
function annotateCampaign(level:LevelDef,id:number,notes:string[],revision=3):LevelDef{
  if(revision===3)level.subtitle='第 '+id+' 关 · '+R3_TOTALS[id-1]+' 颗钉';
  else level.subtitle=level.subtitle||('第 '+id+' 关 · '+CAMPAIGN_TOTALS[id-1]+' 颗钉');
  level.contentRevision=revision;
  level.designNotes=notes;
  if(level.difficulty){
    level.difficulty.verification='verified';
    level.difficulty.evidence=[revision>=4?'tests/campaign-r4.test.ts 官方线 Matter 见证回放通过，未使用道具。':'tests/campaign-r3.test.ts 官方线 Matter 见证回放通过，未使用道具。'];
  }
  return level;
}
/** 未上线的修订 3 主线（24/48/48 短桥）。仅用于旧挑战码回放，不再进入修订 4 主线。 */
export function getCampaignLevelR3(id:number):LevelDef{
  if(id===1){
    const prefix='r3-l1';
    const start=plate(prefix+'-start','square',108,108,128,96,4,row('orange'));
    const cheek=plate(prefix+'-cheek','cloud',282,112,136,102,4,row('cyan'));
    const gate=plate(prefix+'-gate','capsule',195,228,328,126,2,[[-110,0,'red'],[0,0,'red'],[110,0,'red']]);
    const nest=plate(prefix+'-nest','square',195,208,150,118,1,row('purple'));
    const base=plate(prefix+'-base','cloud',195,304,168,118,0,[[-36,-18,'brown'],[0,-18,'brown'],[36,-18,'brown']]);
    const boards=[start,cheek,gate,nest,base];
    const route=[...ids(start),...ids(cheek),gate.screws[0].id,gate.screws[1].id,...ids(nest),gate.screws[2].id,...ids(base)];
    const scene:Scene={boards,queue:['orange','cyan','red','purple','brown'],route,packets:[],critical:[gate.id],entry:start.screws[0].id,decisions:['开局先把已经露出的当前盒色装完。','长板留下最后一颗时会自己摆开，拆光掉下去也可以。']};
    const level=assemble(1,[scene],boards.map(b=>b.id),R3_NAMES[0],R3_TOTALS[0],3);
    level.theme='hinge';level.tutorial=true;level.revealPlan=undefined;
    level.strategy='先点已经露出来的盒色，装满第一盒。长板留下一颗时会摆开，拆完掉下去也通。';
    level.curriculum={objective:'先装满已经露出的盒色，感受同色三颗装箱',prerequisites:['同色三颗装一盒'],decision:scene.decisions[0],failure:'这一关不靠占满五孔来考人；乱点一两次也应仍能装完。',release:scene.decisions[1],criticalBoardIds:[gate.id],stages:[{until:6,title:'先装满这一盒',advice:'上面两个盒子的钉子已经露出来了。先点它们，装满就会接上下一盒。'},{until:15,title:'看看板子怎么让路',advice:'中间这块板还剩一颗时，会自己摆开。留下来或拆完掉下去，下面的颜色都能看见。'}]};
    return annotateCampaign(level,1,['修订 3 再设计：开局至少有两组当前盒色可直接点，第一盒可以连续装满。','留支点和暂存孔的取舍放到第二关再教；第一关允许摆开或整板落下两条路，官方线无道具可解。']);
  }
  if(id===2){
    const scene=corners('r3-l2',oldL2Palette(0),20,0);
    const level=assemble(2,[scene],scene.boards.map(b=>b.id),R3_NAMES[1],R3_TOTALS[1],3);
    level.theme='quadrants';
    level.strategy='三颗桥钉会先占三个空孔，同时打开左右两个工区。先看清当前盒色再决定。';
    level.curriculum={objective:'只用一座桥学会开路成本',prerequisites:['同色三颗装箱'],decision:scene.decisions[0],failure:scene.decisions[1]??'',release:'桥板落下后左右盒色同时露出；先装箱，再接回开路暂存。',criticalBoardIds:scene.critical,stages:[{until:scene.route.length,title:'先拆这一座',advice:'桥钉会占三个空孔。左右两边的盒色会一起露出来，先装箱再收回开路的暂存。'}]};
    return annotateCampaign(level,2,['把旧第二关五座四角桥拆成短关。这一关只交一座桥，24 颗钉全部开局可见。','官方线无道具可解；见证含物理等待。']);
  }
  if(id===3){
    const scenes=[corners('r3-l3-a',oldL2Palette(1),16,Math.PI),corners('r3-l3-b',oldL2Palette(2),12,Math.PI/2)];
    const initial=[...scenes[0].boards.map(b=>b.id),...scenes[1].boards.filter(b=>['north','south','nw','ne'].some(name=>b.id.endsWith('-'+name))).map(b=>b.id)];
    const level=assemble(3,scenes,initial,R3_NAMES[2],R3_TOTALS[2],3);
    const open=COLOR_NAMES[level.boxQueue[0]]+'和'+COLOR_NAMES[level.boxQueue[1]];
    level.strategy='先拆已经转过来的这一座桥，再等下一层露出来。';
    level.curriculum={objective:'先解决眼前这座桥，再接下层新桥',prerequisites:['一座桥的开路成本'],decision:'先比较眼前这座已露出的桥下面是什么颜色。',failure:'还没清掉第一座的关键板，就去拆尚未露全的颜色，会把空孔提前占满。',release:'第一座关键板清掉后，下一层的桥才会稳定露出来。',criticalBoardIds:scenes[0].critical,stages:[{until:scenes[0].route.length,title:'先拆眼前这座',advice:'眼前这座桥已经翻过来了，当前盒子要的是'+open+'。先清掉这座桥下的关键板，下面才会再露出一座。'},{until:level.witness.length,title:'再接下一层',advice:'新的一层出现后，先装箱再决定开哪座桥，不要把空孔一次花完。'}]};
    return annotateCampaign(level,3,['旧第二关的第二、第三座桥。第一座清掉关键板后，下一层才会露出来。','48 颗钉，手作供给与显层，官方线无道具可解。开场提示按本关盒色与显层写具体。']);
  }
  if(id===4){
    const scenes=[corners('r3-l4-a',oldL2Palette(3),8,-Math.PI/2),corners('r3-l4-b',oldL2Palette(4),4,0)];
    const initial=[...scenes[0].boards.map(b=>b.id),...scenes[1].boards.filter(b=>['north','south','nw','ne'].some(name=>b.id.endsWith('-'+name))).map(b=>b.id)];
    const level=assemble(4,scenes,initial,R3_NAMES[3],R3_TOTALS[4-1],3);
    const open=COLOR_NAMES[level.boxQueue[0]]+'和'+COLOR_NAMES[level.boxQueue[1]];
    level.strategy='两座桥是竖着的。先看哪一座下面是当前盒色，先拆那一座。';
    level.curriculum={objective:'在竖桥之间选择先开哪一座，再接下层',prerequisites:['一座桥的开路成本和显层等待'],decision:'先比较左右竖桥下面谁在给当前盒色供货。',failure:'两座竖桥都去拆一点，可能在下层露出前把空孔占满。',release:'先拆通当前盒色的那座竖桥，关键板清掉后下层会再露出一座。',criticalBoardIds:scenes[0].critical,stages:[{until:scenes[0].route.length,title:'先选一座竖桥',advice:'这两座桥是竖着的。当前盒子要的是'+open+'，先拆下面有盒色的那一座；清掉关键板后，下层还会再露出一座。'},{until:level.witness.length,title:'再接下层',advice:'下层出现后，还是先看当前盒色在哪一座桥下面，再决定把空孔花在哪里。'}]};
    return annotateCampaign(level,4,['旧第二关的最后两座桥，收回“四角借路”这个名字。','48 颗钉，布局仍是手作四角桥。开场提示写明竖桥选择，盒色避开银灰。']);
  }
  if(id>=5&&id<=10){
    const previous=getR2Prototype(id-2);
    const level=structuredClone(previous);
    level.id=id;level.seed=0x430000+id;level.contentRevision=3;level.name=R3_NAMES[id-1];
    const notes=Array.isArray(level.designNotes)?[...level.designNotes]:[String(level.designNotes??'')];
    return annotateCampaign(level,id,[`修订 3 主线：旧第 ${id-2} 关按新顺序后移，布局保持手作。`,...notes]);
  }
  throw Error('战役关卡不存在');
}

export function getCampaignLevel(id:number):LevelDef{
  if(id===1){
    const level=structuredClone(getCampaignLevelR3(1));
    level.seed=0x440000+id;
    level.contentRevision=4;
    return annotateCampaign(level,1,[
      '修订 4 保留修订 3 重做的第一关：开局就能点到当前盒色，先装满一盒。',
      '第二关收回 120 颗大墙；这一关仍然允许少量失误，官方线无道具可解。',
    ],4);
  }
  if(id===2){
    const level=structuredClone(getR2Prototype(2));
    level.seed=0x440000+id;
    level.contentRevision=4;
    level.name=CAMPAIGN_NAMES[1];
    const notes=Array.isArray(level.designNotes)?[...level.designNotes]:[String(level.designNotes??'')];
    return annotateCampaign(level,2,[
      '修订 4 收回原第二关 120 颗大墙，五座四角桥保持手作，官方线无道具可解。',
      '这关难是故意的。过不去时用免费辅助即可，成绩会写明用了挂。',
      ...notes,
    ],4);
  }
  if(id>=3&&id<=8){
    const previous=getR2Prototype(id);
    const level=structuredClone(previous);
    level.id=id;level.seed=0x440000+id;level.contentRevision=4;level.name=CAMPAIGN_NAMES[id-1];
    const notes=Array.isArray(level.designNotes)?[...level.designNotes]:[String(level.designNotes??'')];
    return annotateCampaign(level,id,[`修订 4 主线：布局与修订 2 第 ${id} 关相同。`,...notes],4);
  }
  throw Error('战役关卡不存在');
}
