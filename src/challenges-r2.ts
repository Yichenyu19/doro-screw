import {CONTENT_REVISION} from './run';
import {getR2Practice} from './authored-r2';
import {GameEngine,occupiedBuffer} from './core';
import type {GameState,LevelDef} from './types';
import {PRACTICE_VARIANTS} from './r2-catalog';

export async function getR2Challenge(theme:number,attempt:number,mode:'mastery'|'rescue',revision=CONTENT_REVISION):Promise<LevelDef>{
  const variant=attempt%PRACTICE_VARIANTS,level=getR2Practice(theme,variant,revision);level.mode=mode;level.attempt=attempt;level.seed=(revision>=3?0x530000:0x520000)+theme*100001+attempt;level.contentRevision=revision;
  if(mode==='mastery')return level;
  const {physicsSimulation}=await import('./matter-analysis'),game=new GameEngine(level),sim=physicsSimulation(game),desired=[36,42,48,54,60,33][variant];
  let chosen:{state:GameState;index:number;score:number}|null=null;
  for(const [index,step]of level.witness.entries()){
    sim.sync();let stable=0;for(let frame=0;frame<1200&&stable<12;frame++){sim.step();stable=game.canPick(step.screwId)?stable+1:0;}
    if(stable<12)throw Error('残局起点尚未通过物理可达检查');const result=game.dispatch({type:'pick',screwId:step.screwId});if(!result.ok||game.state.phase==='stuck')throw Error('残局起点未能合法到达');sim.sync();sim.step(Math.ceil((step.waitMs??50)/(1000/60)));
    const remaining=game.state.screws.filter(s=>s.place==='board').length;if(remaining<30)break;
    if(remaining<=60){const stored=occupiedBuffer(game.state),partial=game.state.boxes.reduce((n,b)=>n+b.screws.length,0),score=stored*4+partial-Math.abs(remaining-desired)*.3;if(!chosen||score>chosen.score)chosen={state:game.snapshot(),index:index+1,score};}
  }
  if(!chosen)throw Error('没有找到合适的合法残局');
  const rewardableIds=chosen.state.screws.filter(s=>s.place==='board').map(s=>s.id);level.challengeStart={state:chosen.state,rewardableIds,source:`主题 ${theme} · 编排 ${variant+1} 的实际物理第 ${chosen.index} 步`};level.witness=level.witness.slice(chosen.index);level.name=level.name.replace('精修','残局');level.subtitle='带着已有库存，把局面接回来';level.curriculum!.stages=[{until:rewardableIds.length,title:'先理库存，再拆玻璃',advice:'暂存和半盒已经占着位置。先看看哪颗钉能腾出下一次开路的空孔。'}];return level;
}
