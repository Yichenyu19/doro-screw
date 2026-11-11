import Bodies from 'phaser/src/physics/matter-js/lib/factory/Bodies.js';
import Body from 'phaser/src/physics/matter-js/lib/body/Body.js';
import Engine from 'phaser/src/physics/matter-js/lib/core/Engine.js';
import Composite from 'phaser/src/physics/matter-js/lib/body/Composite.js';
import Constraint from 'phaser/src/physics/matter-js/lib/constraint/Constraint.js';
import Common from 'phaser/src/physics/matter-js/lib/core/Common.js';
import decomp from 'phaser/src/physics/matter-js/poly-decomp/index.js';
import {GameEngine} from './core';
import {remainingOnBoard} from './geometry';
import {capturePlatePhysics,configurePlatePhysics,createPlatePhysics,type PlatePhysics,type PlatePhysicsAdapter} from './physics';
import type {GameState,HintInfo,LevelDef} from './types';
Common.setDecomp(decomp);

export function physicsSimulation(game:GameEngine){
 const engine=Engine.create({positionIterations:8,velocityIterations:8,constraintIterations:4,enableSleeping:false});engine.gravity.x=0;engine.gravity.y=.75;
 const views=new Map<string,PlatePhysics>();
 const adapter:PlatePhysicsAdapter={fromVertices:(...args)=>{const body=Bodies.fromVertices(...args);Composite.add(engine.world,body);return body;},setAngle:Body.setAngle,setVelocity:Body.setVelocity,setAngularVelocity:Body.setAngularVelocity,setStatic:Body.setStatic,addPin:(body,pointA,pointB)=>{const pin=Constraint.create({bodyB:body,pointA,pointB,length:0,stiffness:.97,damping:.14});Composite.add(engine.world,pin);return pin;},removePin:pin=>{Composite.remove(engine.world,pin);}};
 function remove(id:string,view:PlatePhysics){if(view.pin)adapter.removePin(view.pin);Composite.remove(engine.world,view.body);views.delete(id);}
 function sync(){for(const board of game.state.boards){let view=views.get(board.id);if(board.active===false||board.gone||board.melted){if(view)remove(board.id,view);continue;}if(!view){view=createPlatePhysics(board,adapter);views.set(board.id,view);}configurePlatePhysics(view,remainingOnBoard(game.state,board.id).map(s=>({x:s.localX,y:s.localY})),adapter);}}
 function step(frames=1){for(let i=0;i<frames;i++){Engine.update(engine,1000/60);for(const [id,view]of views){const board=game.state.boards.find(b=>b.id===id)!;capturePlatePhysics(board,view);if(view.remaining===0&&board.y-Math.hypot(board.width,board.height)/2>440){board.gone=true;remove(id,view);}}if(game.advanceWorld(1000/60).length)sync();}}
 sync();return{engine,views,sync,step};
}

export function physicalHint(level:LevelDef,state:GameState,budgetMs=2200):HintInfo{
 const start=performance.now(),deadline=start+budgetMs,source=new GameEngine(level,state);let searchedNodes=0,budgetExhausted=false;
 if(state.phase!=='playing')return{type:'unknown',reason:'先处理当前救场，再判断下一步。',searchedNodes,budgetExhausted:false};
 const candidates:string[][]=[level.witness.map(s=>s.screwId).filter(id=>state.screws.find(s=>s.id===id)?.place==='board')];
 const verify=(route:string[]):HintInfo|null=>{
  if(!route.length)return null;const trial=new GameEngine(level,state),sim=physicsSimulation(trial);
  for(const id of route){
   if(performance.now()>deadline){budgetExhausted=true;return null;}
   sim.sync();let frames=0,stable=0;
   while(frames<900){
    if(trial.canPick(id)){stable++;if(stable>=6)break;}else stable=0;
    sim.step();frames++;if(frames%30===0&&performance.now()>deadline){budgetExhausted=true;return null;}
   }
   if(!trial.canPick(id)||stable<6)return null;searchedNodes++;
   const result=trial.dispatch({type:'pick',screwId:id});if(!result.ok||trial.state.phase==='stuck')return null;
   sim.sync();sim.step(result.events.some(e=>e.type==='board-released'&&e.remaining===0)?78:2);
  }
  if(trial.state.phase!=='won')return null;
  if(!source.canPick(route[0]))return{type:'wait',reason:'已核对一条完整物理路线，先等正在移动的玻璃露出入口。'};
  return{type:'move',id:route[0],reason:'从当前盘面重放了完整剩余路线，包含玻璃摆动、落下和暂存回流。',model:'matter-verified',verifiedSteps:route.length,searchedNodes};
 };
 for(const route of candidates){const result=verify(route);if(result)return result;}
 if(!budgetExhausted&&performance.now()<deadline-100){
  const candidate=source.hintInfo({maxMs:Math.min(650,deadline-performance.now()),maxNodes:10000,beamWidth:14});searchedNodes+=candidate.type==='move'||candidate.type==='unknown'?candidate.searchedNodes:0;
  if(candidate.type==='move'){const result=verify(source.hintContinuation());if(result)return result;}
 }
 return{type:'unknown',reason:'还没有在计算预算内核对出完整物理路线。这不代表这一局无解；可以先检查遮挡、撤回或使用辅助。',searchedNodes,budgetExhausted:budgetExhausted||performance.now()>=deadline};
}
