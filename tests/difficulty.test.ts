import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, assertConservation } from '../src/core';
import { setShapeOutlines } from '../src/geometry';
import { getLevel, getLevelDesign } from '../src/levels';
import type { BoardShape, LevelDef, Vec2 } from '../src/types';
import artMetadata from '../src/art-frames.json';
setShapeOutlines(artMetadata.outlines as Partial<Record<BoardShape,Vec2[]>>);

function pick(engine:GameEngine,id:string):void{
  assert.equal(engine.canPick(id),true,'诊断路线必须通过真实遮挡检查');
  const result=engine.dispatch({type:'pick',screwId:id});
  assert.equal(result.ok,true,result.reason);
  for(const event of result.events)if(event.type==='board-released'&&event.remaining===0)engine.state.boards.find(b=>b.id===event.boardId)!.gone=true;
  assertConservation(engine.state);
}
test('第二关三个实际选择点：坏顺序能占满5孔，同一盘面保留无道具正确线',()=>{
  for(const attempt of [0,1,2]){
    const level=getLevel(2,attempt),design=getLevelDesign(2,attempt);
    assert.equal(new Set(level.boards.flatMap(b=>b.screws.map(s=>s.color))).size,8);
    assert.equal(design.choices.length,3);
    for(const choice of design.choices){
      const engine=new GameEngine(level);
      for(const step of level.witness.slice(0,choice.atMove))pick(engine,step.screwId);
      assert.equal(engine.state.buffer.filter(Boolean).length,choice.bufferBefore);
      assert.equal(engine.state.phase,'playing');
      for(const id of choice.wrongScrewIds)pick(engine,id);
      assert.equal(engine.state.phase,'stuck','已存坏路线应确实触发救场');
      assert.equal(engine.state.buffer.filter(Boolean).length,5);
      assert.equal(engine.state.boxes.length,2);
      assert.equal(engine.state.toolsUsed,0);
    }
  }
});
function policy(level:LevelDef,kind:'random'|'matching'|'top',seed:number):{won:boolean;moves:number;peak:number}{
  const engine=new GameEngine(level);let peak=0,x=seed>>>0;
  const random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};
  while(engine.state.phase==='playing'){
    const open=engine.available();if(!open.length)break;
    let selected;
    if(kind==='matching'){
      const matching=open.filter(s=>engine.state.boxes.some(box=>box.color===s.color));
      const choices=matching.length?matching:open;selected=choices[Math.floor(random()*choices.length)];
    }else if(kind==='top'){
      selected=open.sort((a,b)=>engine.state.boards.findIndex(p=>p.id===b.boardId)-engine.state.boards.findIndex(p=>p.id===a.boardId)||a.id.localeCompare(b.id))[0];
    }else selected=open[Math.floor(random()*open.length)];
    pick(engine,selected.id);
    peak=Math.max(peak,engine.state.buffer.filter(Boolean).length);
  }
  return{won:engine.state.phase==='won',moves:engine.state.moves,peak};
}
test('弱策略诊断保留失败分支，输出仅为静态策略样本而非真人胜率',()=>{
  const results:Array<{id:number;kind:string;runs:number;wins:number;meanMoves:number}>=[];
  for(const id of [2,3,10,20,30])for(const kind of ['random','matching','top'] as const){
    const runs=kind==='top'?1:12;
    const outcomes=Array.from({length:runs},(_,i)=>policy(getLevel(id),kind,7919+i*3571));
    results.push({id,kind,runs,wins:outcomes.filter(r=>r.won).length,meanMoves:Math.round(outcomes.reduce((n,r)=>n+r.moves,0)/runs)});
  }
  const randomSecond=results.find(r=>r.id===2&&r.kind==='random')!;
  assert.ok(randomSecond.wins<randomSecond.runs,'第二关不能再次所有弱随机路线必过');
  console.log('STATIC_POLICY_DIAGNOSTIC '+JSON.stringify(results));
});

