import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, assertConservation } from '../src/core';
import { boardPolygon, pointInPolygon, SCREW_RADIUS, setShapeOutlines } from '../src/geometry';
import { CAMPAIGN_COUNT, CAMPAIGN_TOTALS, getLevel, getLevelDesign } from '../src/levels';
import { COLORS, SHAPES, type BoardShape, type LevelDef, type Vec2 } from '../src/types';
import artMetadata from '../src/art-frames.json';
import {gameSimulation} from './helpers/matter';

setShapeOutlines(artMetadata.outlines as Partial<Record<BoardShape,Vec2[]>>);
function occupied(engine:GameEngine):number{return engine.state.buffer.filter(Boolean).length;}
/** 见证逐步驱动真实Matter；等待当前几何露出目标。 */
function replay(level:LevelDef):{peak:number;releaseMatches:number;interleaves:number}{
  const engine=new GameEngine(level),sim=gameSimulation(engine);
  assert.equal(engine.state.boxes.length,2);
  assert.equal(engine.state.capacity,5);
  assert.deepEqual(engine.state.buffer,[null,null,null,null,null]);
  let peak=0,releaseMatches=0,interleaves=0,lastBoard:string|null=null;
  const picked=new Set<string>();
  for(const [index,step] of level.witness.entries()){
    assert.ok(!picked.has(step.screwId),'重复见证钉');
    sim.sync();for(let f=0;f<900&&!engine.canPick(step.screwId);f++)sim.step();
    assert.equal(engine.canPick(step.screwId),true,level.id+'/'+level.attempt+' 第'+index+'步不可拆 '+step.screwId);
    const beforeAvailable=new Set(engine.available().map(s=>s.id));
    const pin=engine.state.screws.find(s=>s.id===step.screwId)!;
    if(lastBoard&&lastBoard!==pin.boardId&&engine.state.screws.some(s=>s.boardId===lastBoard&&s.place==='board'))interleaves++;
    lastBoard=pin.boardId;
    const result=engine.dispatch({type:'pick',screwId:step.screwId});
    assert.equal(result.ok,true,result.reason);
    picked.add(step.screwId);
    peak=Math.max(peak,occupied(engine));
    assert.notEqual(engine.state.phase,'stuck','见证填满暂存');
    assertConservation(engine.state);
    for(const event of result.events){
      if(event.type==='board-released'&&event.remaining===0){
        assert.ok((step.waitMs??0)>=1000,'整板释放要为下落留等待');
        sim.sync();sim.step(Math.ceil((step.waitMs??1300)/(1000/60)));
        const matches=engine.available().filter(s=>!beforeAvailable.has(s.id)&&engine.state.boxes.some(box=>box.color===s.color)).length;
        releaseMatches=Math.max(releaseMatches,matches);
      }
    }
    sim.sync();sim.step(Math.ceil((step.waitMs??24)/(1000/60)));
  }
  assert.equal(engine.state.phase,'won');
  assert.equal(engine.state.toolsUsed,0);
  assert.equal(engine.state.boxes.length,2);
  assert.equal(engine.state.capacity,5);
  assert.equal(picked.size,engine.state.screws.length);
  assert.equal(engine.state.collected.length,engine.state.screws.length);
  assert.equal(occupied(engine),0);
  return{peak,releaseMatches,interleaves};
}

test('实录前10关总量与原创后20关明确分开',()=>{
  assert.equal(CAMPAIGN_COUNT,30);
  assert.deepEqual(CAMPAIGN_TOTALS.slice(0,10),[15,120,129,135,141,156,156,168,162,195]);
  assert.deepEqual(CAMPAIGN_TOTALS.slice(10),[180,186,192,177,198,204,189,210,201,216,198,213,219,204,222,216,225,210,228,228]);
  for(let id=1;id<=30;id++){
    const level=getLevel(id);
    assert.equal(level.boards.reduce((n,b)=>n+b.screws.length,0),CAMPAIGN_TOTALS[id-1]);
    assert.equal(level.sourceKind,id<=10?'reference-inspired':'doro-original');
    assert.equal(level.attempt,0);
  }
});
test('第一关4板3/4/3/5与五色各三颗，不伪装为二色教程',()=>{
  const level=getLevel(1);
  assert.deepEqual(level.boards.map(b=>b.screws.length).sort(),[3,3,4,5]);
  const colors=level.boards.flatMap(b=>b.screws.map(s=>s.color));
  assert.equal(new Set(colors).size,5);
  for(const color of new Set(colors))assert.equal(colors.filter(c=>c===color).length,3);
});
for(let id=1;id<=30;id++){
  test('战役 '+id+'：实际初始两盒五孔，完整独立见证回放',()=>{
    const report=replay(getLevel(id));
    assert.ok(report.peak<=4);
    if(id>=2){assert.ok(report.interleaves>=8,'不能退化为最高板逐板拆除');assert.ok(report.peak>=2);}
    if(id===2)assert.ok(report.releaseMatches>=2,'第二关应有拆板后多颗当前盒色露出的释放时刻');
  });
}
test('全部30关的真实alpha、完整钉头、边界、间距和颜色供需',()=>{
  const shapes=new Set<string>(),counts=new Set<number>(),families=new Set<string>();
  for(let id=1;id<=30;id++){
    const level=getLevel(id),engine=new GameEngine(level),design=getLevelDesign(id);
    families.add(design.family);
    for(const color of COLORS)assert.equal(engine.state.screws.filter(s=>s.color===color).length,level.boxQueue.filter(c=>c===color).length*3);
    if(id>=2){
      assert.deepEqual([...new Set(level.boards.filter(b=>b.group!<5).map(b=>b.depth))],[0,1,2,3,4]);
      assert.ok(design.groupBoardCounts.slice(0,5).every(n=>n>=4),'基础功能层组必须包括多板');
      assert.ok(level.curriculum!.criticalBoardIds.length>=3,'V4开路模块必须有真实的多板依赖');
      const positions=engine.state.screws.map(pin=>engine.position(pin)); assert.ok(Math.max(...positions.map(p=>p.x))-Math.min(...positions.map(p=>p.x))>=240);
      assert.ok(Math.max(...positions.map(p=>p.y))-Math.min(...positions.map(p=>p.y))>=230);
    }
    for(const board of level.boards){
      shapes.add(board.shape);counts.add(board.screws.length);
      assert.ok(board.x>=25&&board.x<=365&&board.y>=25&&board.y<=385);
      const polygon=boardPolygon(board);
      for(const screw of board.screws){
        const p=engine.position(screw.id);
        assert.ok(p.x>=24&&p.x<=366&&p.y>=24&&p.y<=390,id+' '+screw.id+'中心越界');
        for(let n=0;n<32;n++){
          const angle=n*Math.PI/16;
          assert.ok(pointInPolygon({x:p.x+Math.cos(angle)*SCREW_RADIUS,y:p.y+Math.sin(angle)*SCREW_RADIUS},polygon),id+' '+screw.id+'钉头越过素材轮廓');
        }
      }
      for(let a=0;a<board.screws.length;a++)for(let b=a+1;b<board.screws.length;b++)assert.ok(Math.hypot(board.screws[a].x-board.screws[b].x,board.screws[a].y-board.screws[b].y)>=31);
    }
  }
  assert.equal(families.size,6);
  for(const count of [3,4,5,6,7,8,9,10,12])assert.ok(counts.has(count),'缺少'+count+'钉板');
  assert.ok(shapes.has('flower')&&shapes.has('cross')&&shapes.has('crescent')&&shapes.has('notchedSquare'));
  assert.equal(SHAPES.length,18);
});
test('随机挑战的尝试号更改布局与盒序；首批24个样本独立回放',()=>{
  const normalized=(items:string[])=>{const map=new Map<string,number>();return items.map(item=>{if(!map.has(item))map.set(item,map.size);return map.get(item);});};
  for(const id of [1,2,3,5,8,10,15,30])for(const attempt of [1,2,3]){
    const level=getLevel(id,attempt),base=getLevel(id,0);
    replay(level);
    assert.notEqual(level.seed,base.seed);
    assert.equal(level.attempt,attempt);
    assert.deepEqual(level,getLevel(id,attempt),'公开seed必须可复现');
    if(id>=2){
      assert.notDeepEqual(level.boards.map(b=>[b.x,b.y,b.angle,b.screws.map(s=>[s.x,s.y])]),base.boards.map(b=>[b.x,b.y,b.angle,b.screws.map(s=>[s.x,s.y])]));
      assert.notDeepEqual(normalized(level.boxQueue),normalized(base.boxQueue),'盒序不应仅做颜色双射');
    }
  }
});
test('无尽12个样本具有新的结构与可复现无道具见证',()=>{
  const signatures=new Set<string>();
  for(let id=31;id<=42;id++){
    const level=getLevel(id,id%3);
    replay(level);
    assert.equal(level.sourceKind,'doro-original');
    assert.ok(level.boards.reduce((n,b)=>n+b.screws.length,0)>=180);
    signatures.add(JSON.stringify(level.boards.map(b=>[b.x,b.y,b.angle,b.shape,b.screws.length])));
  }
  assert.equal(signatures.size,12);
});
test('读取关卡不共享可变状态，非法编号明确失败',()=>{
  const first=getLevel(2),copy=getLevel(2);
  copy.boards[0].screws[0].color='gray';copy.boxQueue.length=0;
  assert.deepEqual(getLevel(2),first);
  for(const id of [0,-1,1.5,NaN,Infinity])assert.throws(()=>getLevel(id),RangeError);
  for(const attempt of [-1,1.2,NaN])assert.throws(()=>getLevel(2,attempt),RangeError);
});


