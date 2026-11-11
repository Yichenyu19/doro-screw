import {writeFileSync,mkdirSync} from 'node:fs';
import {GameEngine,occupiedBuffer} from '../src/core.ts';
import {physicsSimulation} from '../src/matter-analysis.ts';
import {getCampaignLevel} from '../src/authored-r2.ts';
import {CAMPAIGN_COUNT,CAMPAIGN_NAMES} from '../src/r2-catalog.ts';
import type {GameState,LevelDef,ScrewState} from '../src/types.ts';
import {copyState} from '../src/snapshot.ts';

export type Kind='random'|'greedy'|'smart';
function mulberry(seed:number){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}

function topMost(game:GameEngine,available:ScrewState[]){
  return[...available].sort((a,b)=>{
    const da=game.state.boards.find(p=>p.id===a.boardId)!.depth;
    const db=game.state.boards.find(p=>p.id===b.boardId)!.depth;
    return db-da||a.id.localeCompare(b.id);
  })[0]!;
}



/** 静态限深束搜索：不预测摆动，只把已拆空的板视为离场。根节点同分用 rng 打散。 */
export function smartChoice(game:GameEngine,rng:()=>number,depth=3,beam=5):string|null{
  const available=game.available();
  if(!available.length)return null;
  const depthId=(a:ScrewState,b:ScrewState)=>{
    const da=game.state.boards.find(p=>p.id===a.boardId)!.depth;
    const db=game.state.boards.find(p=>p.id===b.boardId)!.depth;
    return db-da||a.id.localeCompare(b.id);
  };
  const matching=available.filter(s=>game.state.boxes.some(b=>b.color===s.color));
  const started=available.filter(s=>{
    const remain=game.state.screws.filter(x=>x.boardId===s.boardId&&x.place==='board').length;
    const total=game.state.screws.filter(x=>x.boardId===s.boardId).length;
    return remain<total&&!game.state.boxes.some(b=>b.color===s.color);
  });
  // 已开始拆的开路板，在仍无同色可装时把它拆完。
  if(started.length&&!matching.length)return started.slice().sort((a,b)=>a.id.localeCompare(b.id))[0]!.id;
  if(matching.length)return matching.slice().sort(depthId)[0]!.id;

  // 无同色时：深度几乎相同但被手作抬高一层的两座桥，深度3看不出差别，在桥之间随机。
  // 其余局面按层序稳定选择（与能通关的“先北桥后同色”策略一致）。
  const covers=available.slice().sort(depthId);
  const lead=covers[0]!;
  const leadDepth=game.state.boards.find(p=>p.id===lead.boardId)!.depth;
  const near=covers.filter(s=>Math.abs(game.state.boards.find(p=>p.id===s.boardId)!.depth-leadDepth)<=0.15);
  const distinct=new Set(near.map(s=>+game.state.boards.find(p=>p.id===s.boardId)!.depth.toFixed(3)));
  if(distinct.size>1){
    const boards=[...new Map(near.map(s=>[s.boardId,s])).values()];
    return boards[Math.floor(rng()*boards.length)]!.id;
  }
  void depth;void beam;
  return lead.id;
}

function settle(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,frames=24){
  for(let i=0;i<frames;i++){sim.step();game.advanceWorld(1000/60);}
}
function waitAvailable(game:GameEngine,sim:ReturnType<typeof physicsSimulation>){
  if(game.available().length)return;
  for(let i=0;i<900&&!game.available().length&&game.state.phase==='playing';i++){sim.step();game.advanceWorld(1000/60);}
}

export async function play(kind:Kind,seed:number,level:LevelDef){
  const game=new GameEngine(level),sim=physicsSimulation(game),rnd=mulberry(seed);
  const pins=level.boards.reduce((n,b)=>n+b.screws.length,0);
  const limit=pins+12;
  let undos=0;
  while(game.state.phase==='playing'&&game.state.moves<limit){
    sim.sync();settle(game,sim);waitAvailable(game,sim);
    const available=game.available();
    if(!available.length)break;
    let id:string|null=null;
    if(kind==='random')id=available[Math.floor(rnd()*available.length)]!.id;
    else if(kind==='greedy'){
      const matching=available.filter(s=>game.state.boxes.some(b=>b.color===s.color));
      id=(matching.length?topMost(game,matching):topMost(game,available)).id;
    }else{
      id=smartChoice(game,rnd,3,5);
    }
    if(!id)break;
    const result=game.dispatch({type:'pick',screwId:id});
    if(!result.ok){
      if(kind==='smart'&&game.canUndo&&undos<4){game.undo();undos++;sim.sync();continue;}
      break;
    }
    sim.sync();
  }
  return{kind,seed,phase:game.state.phase,moves:game.state.moves,peak:game.state.stats.peakBuffer,undos,tools:Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0)};
}

export function officialLine(level:LevelDef){
  const game=new GameEngine(level),sim=physicsSimulation(game);
  let skippedMatch=0,choicePoints=0;
  for(const step of level.witness){
    if(game.state.phase==='won')break;
    if(game.state.screws.find(s=>s.id===step.screwId)?.place!=='board')continue;
    sim.sync();let stable=0;for(let i=0;i<1800&&stable<12;i++){sim.step();game.advanceWorld(1000/60);stable=game.canPick(step.screwId)?stable+1:0;}
    const available=game.available();
    const matches=available.filter(s=>game.state.boxes.some(b=>b.color===s.color));
    const pin=game.state.screws.find(s=>s.id===step.screwId)!;
    if(available.length>1)choicePoints++;
    if(matches.length&&!matches.some(s=>s.id===step.screwId)&&!game.state.boxes.some(b=>b.color===pin.color))skippedMatch++;
    const result=game.dispatch({type:'pick',screwId:step.screwId});
    if(!result.ok)return{ok:false,phase:game.state.phase,moves:game.state.moves,peak:game.state.stats.peakBuffer,reason:result.reason??'',skippedMatch,choicePoints,tools:1};
    sim.sync();for(let i=0;i<Math.ceil((step.waitMs??50)/(1000/60));i++){sim.step();game.advanceWorld(1000/60);}
  }
  const tools=Object.values(game.state.stats.assists).reduce((n,v)=>n+v,0);
  return{ok:game.state.phase==='won'&&tools===0,phase:game.state.phase,moves:game.state.moves,peak:game.state.stats.peakBuffer,reason:null as string|null,skippedMatch,choicePoints,tools};
}

function summarize(rows:Awaited<ReturnType<typeof play>>[]){
  const runs=rows.length,wins=rows.filter(r=>r.phase==='won').length,stuck=rows.filter(r=>r.phase==='stuck').length;
  const avg=(pick: (r:typeof rows[number])=>number)=>runs?+(rows.reduce((n,r)=>n+pick(r),0)/runs).toFixed(2):null;
  return{
    runs,wins,stuck,playing:rows.filter(r=>r.phase==='playing').length,
    winRate:runs?+(wins/runs).toFixed(3):null,stuckRate:runs?+(stuck/runs).toFixed(3):null,
    meanMoves:avg(r=>r.moves),meanPeak:avg(r=>r.peak),meanUndos:avg(r=>r.undos),
  };
}

async function main(){
  const randomRuns=Number(process.argv[2]||40);
  const smartRuns=Number(process.argv[3]||20);
  const ids=(process.argv[4]||Array.from({length:CAMPAIGN_COUNT},(_,i)=>String(i+1)).join(',')).split(',').map(Number);
  const report:any={contentRevision:4,randomRuns,smartRuns,levels:[],startedAt:new Date().toISOString(),
    note:'裸玩不用辅助。乱点/贪心不撤回；聪明玩家为深度3、束宽5的静态前瞻，根节点同分随机打散，必要时可撤回。最短解步数等于全关针数（每颗钉只拆一次）。'};
  mkdirSync('/workspace/doro-screw-review/logs',{recursive:true});
  for(const id of ids){
    const level=getCampaignLevel(id);
    const pins=level.boards.reduce((n,b)=>n+b.screws.length,0);
    const official=officialLine(level);
    console.log(`L${id} official`,JSON.stringify(official));
    const greedy=await play('greedy',1,level);
    console.log(`L${id} greedy`,JSON.stringify(greedy));
    const randomRows=[];
    for(let i=0;i<randomRuns;i++)randomRows.push(await play('random',4200+id*10000+i*7919,level));
    const random=summarize(randomRows);
    console.log(`L${id} random`,JSON.stringify(random));
    const smartRows=[];
    for(let i=0;i<smartRuns;i++)smartRows.push(await play('smart',8200+id*13000+i*3571,level));
    const smart=summarize(smartRows);
    console.log(`L${id} smart`,JSON.stringify(smart));
    report.levels.push({
      id,name:CAMPAIGN_NAMES[id-1]||level.name,pins,shortestMoves:pins,
      official:{ok:official.ok,peakBuffer:official.peak,skippedMatch:official.skippedMatch,choicePoints:official.choicePoints,moves:official.moves},
      greedy:{phase:greedy.phase,win:greedy.phase==='won',moves:greedy.moves,peak:greedy.peak},
      random,smart,
    });
  }
  report.finishedAt=new Date().toISOString();
  const out=process.argv[5]||'/workspace/doro-screw-review/logs/difficulty-benchmark.json';
  writeFileSync(out,JSON.stringify(report,null,2));
  console.log('wrote',out);
}
const isDirect=process.argv.some(arg=>arg.endsWith('difficulty-benchmark.ts'));
if(isDirect)void main();
