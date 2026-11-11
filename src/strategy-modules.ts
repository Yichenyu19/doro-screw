import './geometry-setup';
import type {BoardDef,BoardShape,ColorId,Curriculum,HingeRule,LevelDef,StrategyTheme,WitnessStep} from './types';
import {localOutline} from './geometry';
import {polygonCentroid,rotate} from './physics';

export interface StrategyModule {boards:BoardDef[];queue:ColorId[];witness:WitnessStep[];hinge?:HingeRule;curriculum:Curriculum;pairedChange:string}
type Pin=[number,number,ColorId];
export function strategyModule(theme:StrategyTheme,prefix='probe',palette:ColorId[]=['orange','cyan','red','blue','brown'],variant=0):StrategyModule{
  const [o,c,r,b,k]=palette;
  const boards:BoardDef[]=[],sequence:Array<[BoardDef,number,boolean?]>=[];
  const plate=(name:string,shape:BoardShape,x:number,y:number,w:number,h:number,depth:number,pins:Pin[],angle=0)=>{
    const value:BoardDef={id:`${prefix}-${name}`,shape,x,y,width:w,height:h,depth:depth+5,group:5,angle,color:pins[0][2],geometryVersion:'v4',screws:pins.map(([x,y,color],i)=>({x,y,color,id:`${prefix}-${name}-s${i+1}`}))};boards.push(value);return value;
  };
  const row=(color:ColorId):Pin[]=>[[-34,0,color],[0,0,color],[34,0,color]];
  const take=(board:BoardDef,indices:number[]=board.screws.map((_,i)=>i),wait=false)=>{for(const i of indices)sequence.push([board,i,wait]);};
  let queue:ColorId[]=[],hinge:HingeRule|undefined,decision='',failure='',release='',pairedChange='';
  if(theme==='quadrants'||theme==='lattice'){
    const left=plate('west','square',110,207,114,88,0,row(o)),right=plate('east','square',280,217,114,88,0,row(c));
    let spare:BoardDef;
    if(theme==='lattice')spare=plate('vertical','capsule',280,210,80,304,1,[[0,-116,b],[0,116,b],[0,0,b]]);
    else spare=plate('south','cloud',195,327,160,118,0,[[-39,4,b],[0,-17,b],[39,4,b]]);
    const bridge=plate('bridge','capsule',195,210,328,90,2,[[-119,0,r],[119,0,r],[0,0,r]]);
    take(bridge);take(left,undefined,true);take(spare,undefined,true);take(right,undefined,true);queue=[o,c,r,b];
    decision=theme==='quadrants'?'三颗桥钉占用三个空孔，同时打开左右两个工区；先拿下方其他颜色会挤掉这笔开路空间':'横板同时挡住左侧盒色和竖板中钉；先解除共同遮挡，避免两块板一起消耗暂存';
    failure='还没打开当前盒色时，先拿两颗旁支钉再拿三颗桥钉，会填满五孔';
    release=theme==='quadrants'?'桥板落下后左右盒色同时露出；左侧三颗装箱，新盒接走桥钉':'横板落下后左侧盒色可达；装箱回流后，竖板颜色进入当前盒';
    pairedChange=theme==='quadrants'?'将桥移离左右目标，开路成本由三孔降为零':'把横板缩短，共同遮挡消失，横板不再同时释放两个工区';
  }else if(theme==='interlock'){
    const leftUnder=plate('west-key','square',55,205,68,132,0,[[0,-35,b],[0,0,b],[0,35,b]]);
    const rightUnder=plate('east-key','square',335,205,68,132,0,[[0,-35,r],[0,0,r],[0,35,c]]);
    const left=plate('west-ring','cshape',115,205,190,270,1,[[-5,-100,o],[-5,100,o],[-60,0,r]]);
    const right=plate('east-ring','cshape',275,205,190,270,1,[[-60,0,o],[-5,-100,c],[-5,100,c]],Math.PI);
    take(left,[0,1]);take(right,[0]);take(left,[2]);take(right,[1,2]);take(rightUnder,[2,0,1],true);take(leftUnder,undefined,true);queue=[o,c,r,b];
    decision='左环的两颗同色钉还缺右环的一颗；先跨到右侧完成当前盒，再接左环的最后一钉';
    failure='只追着左侧露出的下层颜色拿，会把尚未打开的盒色堆进暂存';
    release='右侧补齐第三颗后，新盒接收左环的钉；右环清空又露出补齐两盒的下层钉';
    pairedChange='交换左环末钉和右环首钉的颜色，左侧即可自行凑齐三颗，跨侧依赖消失';
  }else if(theme==='embrace'){
    const center=plate('center',variant===4?'disc':'flower',195,211,150,154,0,[[-32,-22,r],[32,-22,r],[0,29,r]]);
    const upper=plate('upper-petal','capsule',195,171,246,72,1,[[-86,0,o],[0,0,o],[86,0,c]]);
    const lower=plate('lower-petal','capsule',195,251,246,72,1,[[-86,0,c],[0,0,c],[86,0,o]]);
    take(upper);take(lower,[2]);take(center,[0,1],true);take(lower,[0,1]);take(center,[2],true);queue=[o,c,r];
    decision='上方开口只露出中心的一部分；到另一片花瓣补齐当前盒，再收中心颜色';
    failure='看到中心就连续取走它的颜色，会提前占用仍需留给外圈的暂存位置';
    release='上下两处开口逐步释放中心，外圈第三颗同色钉打开中心需要的新盒';
    pairedChange='把中心提升到外圈之上，外圈开口对中心可达性的作用消失';
  }else if(theme==='cascade'){
    const next=plate('next','cloud',195,112,170,118,0,[[-40,0,r],[0,-18,r],[40,0,r]]);
    const current=plate('current','square',102,248,130,100,0,row(o));
    const later=plate('later','cloud',195,339,160,105,0,[[-36,0,b],[0,-14,b],[36,0,b]]);
    const other=plate('other','square',290,248,130,100,0,row(c));
    take(next);take(current);take(later);take(other);queue=[o,c,r,b];
    decision='预告显示下一盒的颜色时，可以用三个空孔先收齐；当前盒最后一颗会触发连续装箱';
    failure='把不在近两盒预告中的颜色也拿进暂存，可能在回流前占满五孔';
    release='当前盒装满，三颗预存钉立刻进入新盒，连开下一盒';
    pairedChange='交换第三和第四个盒色，同一提前暂存不再在第一次装箱后触发连锁';
  }else{
    const finish=plate('finish','notchedSquare',210,291,166,140,0,[[-33,-31,c],[28,-31,c],[-47,38,r],[42,38,b],[-2,9,k]]);
    const under=plate('window','square',208,198,176,154,1,[[-44,-37,o],[6,-37,o],[46,-37,o],[0,17,c]]);
    const gate=plate('hinge','capsule',190,175,300,120,2,[[-108,0,b],[0,0,r],[95,0,k]]);
    const lock=plate('lock','triangle',82,145,145,150,3,[[-32,29,r],[31,29,b],[0,-9,k]]);
    take(gate,[1,2]);take(under,[0,1,2],true);take(lock,[0]);take(finish,[2]);take(lock,[1,2]);take(gate,[0],true);take(finish,[3]);take(under,[3]);take(finish,[0,1,4],true);queue=[o,c,r,b,k];
    const pivot=gate.screws[0],center=polygonCentroid(localOutline(gate.shape,'v4').map(p=>({x:p.x*gate.width,y:p.y*gate.height}))),angle=Math.PI/2-Math.atan2(center.y-pivot.y,center.x-pivot.x),offset=rotate(pivot,angle);
    hinge={boardId:gate.id,pivotId:pivot.id,targetIds:under.screws.map(s=>s.id),settledPose:{x:gate.x+pivot.x-offset.x,y:gate.y+pivot.y-offset.y,angle}};
    decision='用两孔暂存拆掉长板右侧两钉，保留左侧支点，让重心把长板带离窗口';
    failure='先把遮住支点的三角板清空，再想整块拆掉长板，会在露出当前盒色前占满五孔';
    release='长板绕左端摆下，三颗当前盒色稳定露出；装箱让暂存开始回流';
    pairedChange='把最后支点移到长板质心，单钉状态不再靠重力摆开原窗口';
  }
  const remaining=new Map(boards.map(p=>[p.id,p.screws.length]));
  const witness=sequence.map(([plate,index,wait])=>{const n=remaining.get(plate.id)!-1;remaining.set(plate.id,n);return{screwId:plate.screws[index].id,waitMs:n===0?1300:24,...(wait?{waitForExposure:true}:{})};});
  const total=witness.length;
  return{boards,queue,witness,hinge,pairedChange,curriculum:{objective:decision,prerequisites:['同色三颗装箱','暂存等待回流','长按检查遮挡'],decision,failure,release,criticalBoardIds:boards.map(p=>p.id),stages:[{until:Math.ceil(total*.3),title:'辨认关键关系',advice:decision},{until:Math.ceil(total*.7),title:'释放与回流',advice:release},{until:total,title:'接好最后几盒',advice:'观察当前两盒和预告，先完成已有的同色组合。'}]}};
}

export function strategyProbe(theme:StrategyTheme):LevelDef{
  const module=strategyModule(theme);return{id:1,name:theme,subtitle:'策略验证小关',seed:1,attempt:0,contentVersion:'v4',geometryVersion:'v4',mode:'campaign',contentRevision:1,theme,...module,boxQueue:module.queue};
}
