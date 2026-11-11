import { createRequire } from 'node:module';
import { GameEngine } from '../../src/core';
import { remainingOnBoard } from '../../src/geometry';
import { capturePlatePhysics, configurePlatePhysics, createPlatePhysics, type PlatePhysics, type PlatePhysicsAdapter } from '../../src/physics';
const require=createRequire(import.meta.url),root='phaser/src/physics/matter-js/';
const Bodies=require(root+'lib/factory/Bodies.js'),Body=require(root+'lib/body/Body.js'),Engine=require(root+'lib/core/Engine.js'),Composite=require(root+'lib/body/Composite.js'),Constraint=require(root+'lib/constraint/Constraint.js'),Common=require(root+'lib/core/Common.js');
Common.setDecomp(require(root+'poly-decomp/index.js'));
export function gameSimulation(game:GameEngine){
  const engine=Engine.create({positionIterations:8,velocityIterations:8,constraintIterations:4,enableSleeping:false});engine.gravity.x=0;engine.gravity.y=.75;
  const views=new Map<string,PlatePhysics>();
  const adapter:PlatePhysicsAdapter={fromVertices:(...args)=>{const body=Bodies.fromVertices(...args);Composite.add(engine.world,body);return body;},setAngle:Body.setAngle,setVelocity:Body.setVelocity,setAngularVelocity:Body.setAngularVelocity,setStatic:Body.setStatic,addPin:(body,pointA,pointB)=>{const pin=Constraint.create({bodyB:body,pointA,pointB,length:0,stiffness:.97,damping:.14});Composite.add(engine.world,pin);return pin;},removePin:pin=>{Composite.remove(engine.world,pin);}};
  function sync(){for(const board of game.state.boards){if(board.active===false||board.gone||board.melted)continue;let view=views.get(board.id);if(!view){view=createPlatePhysics(board,adapter);views.set(board.id,view);}configurePlatePhysics(view,remainingOnBoard(game.state,board.id).map(s=>({x:s.localX,y:s.localY})),adapter);}}
  function step(frames=1){for(let i=0;i<frames;i++){Engine.update(engine,1000/60);for(const board of game.state.boards){const view=views.get(board.id);if(!view||board.gone||board.melted)continue;capturePlatePhysics(board,view);if(view.remaining===0&&board.y-Math.hypot(board.width,board.height)/2>440){board.gone=true;if(view.pin)adapter.removePin(view.pin);Composite.remove(engine.world,view.body);}}}}
  sync();return{engine,views,sync,step};
}
