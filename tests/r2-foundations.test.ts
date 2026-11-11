import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine,assertConservation} from '../src/core';
import {packRun,unpackRun,writeJournal,readJournal,flushJournal} from '../src/journal';
import type {BoardDef,LevelDef} from '../src/types';

function board(id:string,x:number,depth=2,reserved=false):BoardDef{return{id,shape:'capsule',color:'cyan',x,y:100,width:120,height:44,angle:0,depth,geometryVersion:'v4',reserved,screws:[-40,0,40].map((x,i)=>({id:id+'s'+i,x,y:0,color:'rose'}))};}
function definition(count=3):LevelDef{return{id:2,name:'状态试验',subtitle:'',seed:422,contentVersion:'v4',geometryVersion:'v4',contentRevision:2,mode:'campaign',boards:Array.from({length:count},(_,i)=>board('b'+i,i*150,2,i>0)),boxQueue:Array(count).fill('rose'),witness:[]};}
test('后备逐包等待低入口250毫秒，未满足前置不开放；刷新与撤回保留计时和边界',()=>{
  const level=definition();level.revealPlan={threshold:4,stableMs:250,packets:[{id:'a',boardIds:['b1','b2'],requiresCleared:['b0']}]};
  const game=new GameEngine(level);
  for(let i=0;i<30;i++)assert.deepEqual(game.advanceWorld(100),[]);
  assert.equal(game.state.revealState!.pendingId,null);
  for(const s of level.boards[0].screws)assert(game.dispatch({type:'pick',screwId:s.id}).ok);
  game.advanceWorld(100);game.advanceWorld(100);assert.equal(game.state.boards[1].active,false);
  const checkpoint=unpackRun(JSON.parse(JSON.stringify(packRun(game.checkpoint()))))!;
  const resumed=new GameEngine(level,checkpoint.state,checkpoint.history);
  assert.equal(resumed.state.revealState!.lowEntryMs,200);
  assert.equal(resumed.advanceWorld(50)[0]?.type,'group-revealed');
  assert.deepEqual(resumed.state.revealState!.opened,['a']);
  assert(resumed.undo());assert.equal(resumed.state.moves,2);assert.equal(resumed.state.boards[1].active,false);
  assert.deepEqual(resumed.state.revealState!.opened,[]);assertConservation(resumed.state);
});
test('即使达到触发时长，新板也不会压住已经开放的钉',()=>{
  const level=definition();level.boards[1].x=0;level.boards[1].depth=4;
  level.revealPlan={threshold:4,stableMs:250,packets:[{id:'a',boardIds:['b1','b2'],requiresCleared:[]}]};
  const game=new GameEngine(level);for(let i=0;i<5;i++)game.advanceWorld(100);
  assert.equal(game.state.boards[1].active,false);assert.equal(game.available().length,3);assert.deepEqual(game.state.revealState!.opened,[]);
});
test('动作前态与撤回帧在后续操作中保持不变',()=>{
  const level=definition(1),game=new GameEngine(level),first=game.dispatch({type:'pick',screwId:'b0s0'}),json=JSON.stringify(first.before);
  game.dispatch({type:'pick',screwId:'b0s1'});game.undo();game.dispatch({type:'pick',screwId:'b0s2'});
  assert.equal(JSON.stringify(first.before),json);assert.equal(first.before!.screws[0].place,'board');
});
test('240次操作使用独立增量分片；数据库不可用时可从全部分片恢复长撤回链',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),store=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return store.size;},key:(i:number)=>[...store.keys()][i]??null,getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>store.set(key,value),removeItem:(key:string)=>store.delete(key)}});
  try{
    const level=definition(80);level.boards.forEach(b=>b.reserved=false);
    const game=new GameEngine(level),sizes:number[]=[];
    for(const screw of level.boards.flatMap(b=>b.screws)){
      const result=game.dispatch({type:'pick',screwId:screw.id});assert(result.ok);
      const owner=game.state.boards.find(b=>b.id===game.state.screws.find(s=>s.id===screw.id)!.boardId)!;
      if(!game.state.screws.some(s=>s.boardId===owner.id&&s.place==='board'))owner.gone=true;
      assert(writeJournal({version:4,completed:[],current:game.state},game.checkpoint()));
      sizes.push([...store.values()].at(-1)!.length);
    }
    await flushJournal();
    assert.equal(store.size,240);assert(sizes.at(-1)!<40000,JSON.stringify({early:sizes[1],late:sizes.at(-1)}));
    const entry=await readJournal(),run=unpackRun(entry!.run)!;
    assert.equal(run.state.moves,240);assert.equal(run.history.length,240);
    const resumed=new GameEngine(level,run.state,run.history);for(let i=0;i<240;i++)assert(resumed.undo());
    assert.equal(resumed.state.moves,0);assert.equal(resumed.state.stats.undos,240);assertConservation(resumed.state);
    await flushJournal();
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});
