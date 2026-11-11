import {writeFileSync,mkdirSync,readFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {availableParallelism} from 'node:os';
import {GameEngine,occupiedBuffer} from '../src/core.ts';
import {physicsSimulation} from '../src/matter-analysis.ts';
import {getCampaignLevel} from '../src/authored-r2.ts';
import {CAMPAIGN_COUNT,CAMPAIGN_NAMES} from '../src/r2-catalog.ts';
import type {GameState,LevelDef,ScrewState} from '../src/types.ts';
import {copyState} from '../src/snapshot.ts';
import {isScrewExposed} from '../src/geometry.ts';

export type Kind='random'|'greedy'|'smart'|'smart-weak'|'smart-strong';
function mulberry(seed:number){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}

function topMost(game:GameEngine,available:ScrewState[]){
  return[...available].sort((a,b)=>{
    const da=game.state.boards.find(p=>p.id===a.boardId)!.depth;
    const db=game.state.boards.find(p=>p.id===b.boardId)!.depth;
    return db-da||a.id.localeCompare(b.id);
  })[0]!;
}



/** 静态限深束搜索：不预测摆动，只把已拆空的板视为离场。根节点同分用 rng 打散。 */
export type SmartProfile={name:string;depth:number;beam:number;jitter:number;close:number;trapWeight:number;trapHorizon:number;eagerMatch:boolean};
export const SMART_PROFILES={
  'smart-weak':{name:'略弱聪明玩家',depth:2,beam:3,jitter:14,close:8,trapWeight:28,trapHorizon:8,eagerMatch:false},
  smart:{name:'聪明玩家',depth:4,beam:5,jitter:10,close:6,trapWeight:70,trapHorizon:16,eagerMatch:false},
  'smart-strong':{name:'更强聪明玩家',depth:6,beam:7,jitter:6,close:5,trapWeight:80,trapHorizon:24,eagerMatch:false},
} as const satisfies Record<'smart-weak'|'smart'|'smart-strong',SmartProfile>;
export function smartChoice(game:GameEngine,rng:()=>number,profile:SmartProfile=SMART_PROFILES.smart):string|null{
  const {depth,beam}=profile;

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

  // 第2关保持原墙：开局近高两桥随机，之后只装箱/按层序，不用新的跳色搜索。
  if(isCampaignWall(game)){
    if(started.length&&!matching.length)return started.slice().sort((a,b)=>a.id.localeCompare(b.id))[0]!.id;
    if(!matching.length&&isNearEqualCoverFork(game,available)){
      const covers=available.slice().sort(depthId);
      const leadDepth=game.state.boards.find(p=>p.id===covers[0]!.boardId)!.depth;
      const near=covers.filter(s=>Math.abs(game.state.boards.find(p=>p.id===s.boardId)!.depth-leadDepth)<=0.15);
      const boards=[...new Map(near.map(s=>[s.boardId,s])).values()];
      return boards[Math.floor(rng()*boards.length)]!.id;
    }
    if(matching.length)return matching.slice().sort(depthId)[0]!.id;
    return available.slice().sort(depthId)[0]!.id;
  }

  if(started.length&&!matching.length){
    const boardId=started[0]!.boardId;
    const left=game.state.screws.filter(x=>x.boardId===boardId&&x.place==='board').length;
    if(left<=game.state.capacity-occupiedBuffer(game.state))return started.slice().sort((a,b)=>a.id.localeCompare(b.id))[0]!.id;
  }

  const byBoard=(list:ScrewState[])=>{
    const seen=new Set<string>();
    return list.filter(s=>{if(seen.has(s.boardId))return false;seen.add(s.boardId);return true;});
  };
  const matchBoards=byBoard(matching).sort(depthId);
  const free=game.state.capacity-occupiedBuffer(game.state);
  const fitting=byBoard(available.filter(s=>!game.state.boxes.some(b=>b.color===s.color)))
    .filter(s=>game.state.screws.filter(x=>x.boardId===s.boardId&&x.place==='board').length<=free)
    .sort(depthId);
  // 有同色时，只有在本档深度/视野里已经能看见“再装箱会卡死”才去搜索跳色；看不见陷阱就装箱。不用“能露盒色”当默认跳色理由。
  const seeTrap=greedyTrapsSoon(game,profile.trapHorizon);
  const mustSearch=!matching.length||free<=2||(!profile.eagerMatch&&seeTrap);
  if(matching.length&&!mustSearch)return matchBoards[0]!.id;

  const candidates=(matchBoards.length?[...matchBoards.slice(0,4),...fitting.slice(0,3)]:(fitting.length?fitting:byBoard(available).sort(depthId)).slice(0,6));
  const start=copyState(game.state);
  const trial=new GameEngine(game.definition,start);
  const scoreMove=(id:string)=>{
    type Node={state:GameState;score:number};
    trial.state=copyState(start);
    const first=trial.dispatch({type:'pick',screwId:id});
    if(!first.ok)return -20_000;
    normalizeEmpty(trial.state);
    if(trial.state.phase==='won')return 20_000;
    if(trial.state.phase==='stuck')return -15_000;
    const firstBoard=start.screws.find(s=>s.id===id)?.boardId??'';
    const remain=start.screws.filter(x=>x.boardId===firstBoard&&x.place==='board').length;
    const localDepth=Math.min(8,Math.max(depth,remain));
    const firstBonus=peekBonus(start,firstBoard);
    let frontier:Node[]=[{state:copyState(trial.state),score:heuristic(trial.state)+firstBonus}];
    for(let d=1;d<localDepth;d++){
      const next:Node[]=[];
      for(const node of frontier){
        trial.state=node.state;
        const choices=limitedChoices(trial,6,firstBoard);
        if(!choices.length){next.push(node);continue;}
        for(const s of choices){
          trial.state=copyState(node.state);
          const result=trial.dispatch({type:'pick',screwId:s.id});
          if(!result.ok)continue;
          normalizeEmpty(trial.state);
          next.push({state:copyState(trial.state),score:heuristic(trial.state)});
        }
      }
      if(!next.length)break;
      next.sort((a,b)=>b.score-a.score);
      frontier=next.slice(0,beam);
    }
    const end=frontier[0];
    if(!end)return -1000;
    const trap=greedyTrapsSoon(new GameEngine(game.definition,end.state),profile.trapHorizon);
    return end.score+firstBonus+(trap?-profile.trapWeight:Math.round(profile.trapWeight*0.3))+(rng()-.5)*profile.jitter;
  };
  const ranked=candidates.map(s=>({id:s.id,board:s.boardId,score:scoreMove(s.id),match:game.state.boxes.some(b=>b.color===s.color),peek:peekBonus(game.state,s.boardId)})).sort((a,b)=>b.score-a.score);
  const best=ranked[0]!;
  const close=ranked.filter(r=>r.score>=best.score-profile.close);
  return close[Math.floor(rng()*close.length)]!.id;
}

function normalizeEmpty(state:GameState){
  for(const board of state.boards)if(!board.melted&&state.screws.filter(s=>s.boardId===board.id&&s.place==='board').length===0)board.gone=true;
}

function heuristic(state:GameState){
  if(state.phase==='won')return 20_000+state.collected.length;
  if(state.phase==='stuck')return -20_000-state.moves;
  const occ=occupiedBuffer(state),free=state.capacity-occ;
  const avail=state.screws.filter(s=>s.place==='board'&&isScrewExposed(state,s.id));
  const matchN=avail.filter(s=>state.boxes.some(b=>b.color===s.color)).length;
  const reserve=free>=3?16:free===2?2:free===1?-14:-36;
  return state.collected.length*6+state.stats.boxesCompleted*20+state.boxes.reduce((n,b)=>n+b.screws.length,0)*5
    +state.boards.filter(b=>b.gone||b.melted).length*3+matchN*7-occ*11+reserve;
}

function peekBonus(state:GameState,boardId:string){
  if(!boardId)return 0;
  const next=copyState(state);
  for(const screw of next.screws)if(screw.boardId===boardId&&screw.place==='board')screw.place='done';
  const board=next.boards.find(b=>b.id===boardId);if(board)board.gone=true;
  normalizeEmpty(next);
  const before=state.screws.filter(s=>s.place==='board'&&isScrewExposed(state,s.id)&&state.boxes.some(b=>b.color===s.color)).length;
  const after=next.screws.filter(s=>s.place==='board'&&isScrewExposed(next,s.id)&&next.boxes.some(b=>b.color===s.color)).length;
  return Math.max(0,after-before)*14;
}

function limitedChoices(game:GameEngine,cap:number,preferBoard?:string){
  const available=game.available();
  const matching=available.filter(s=>game.state.boxes.some(b=>b.color===s.color));
  const free=game.state.capacity-occupiedBuffer(game.state);
  if(preferBoard){
    const left=available.filter(s=>s.boardId===preferBoard);
    const remain=game.state.screws.filter(x=>x.boardId===preferBoard&&x.place==='board').length;
    if(left.length&&remain<=free)return left.slice(0,cap);
  }
  const byBoard=(list:ScrewState[])=>{
    const seen=new Set<string>();
    return list.filter(s=>{if(seen.has(s.boardId))return false;seen.add(s.boardId);return true;});
  };
  const depthId=(a:ScrewState,b:ScrewState)=>{
    const da=game.state.boards.find(p=>p.id===a.boardId)!.depth;
    const db=game.state.boards.find(p=>p.id===b.boardId)!.depth;
    return db-da||a.id.localeCompare(b.id);
  };
  const others=byBoard(available.filter(s=>!game.state.boxes.some(b=>b.color===s.color)))
    .filter(s=>game.state.screws.filter(x=>x.boardId===s.boardId&&x.place==='board').length<=free)
    .sort(depthId);
  const matches=byBoard(matching).sort(depthId);
  return (matches.length?[...matches.slice(0,4),...others.slice(0,2)]:others).slice(0,cap);
}

function greedyTrapsSoon(game:GameEngine,steps:number){
  const trial=new GameEngine(game.definition,copyState(game.state));
  for(let i=0;i<steps&&trial.state.phase==='playing';i++){
    normalizeEmpty(trial.state);
    const available=trial.available();
    if(!available.length)return false;
    const matching=available.filter(s=>trial.state.boxes.some(b=>b.color===s.color));
    const pick=(matching.length?topMost(trial,matching):topMost(trial,available));
    const occ=occupiedBuffer(trial.state);
    if(!trial.state.boxes.some(b=>b.color===pick.color)&&occ+1>=trial.state.capacity)return true;
    const result=trial.dispatch({type:'pick',screwId:pick.id});
    if(!result.ok||trial.state.phase==='stuck')return true;
    normalizeEmpty(trial.state);
  }
  return trial.state.phase==='stuck';
}

function isCampaignWall(game:GameEngine){
  return game.state.levelId===2&&(game.definition.contentRevision??0)>=4&&game.definition.mode==='campaign';
}

function isNearEqualCoverFork(game:GameEngine,available:ScrewState[]){
  if(!isCampaignWall(game))return false;
  const boards=[...new Map(available.map(s=>[s.boardId,game.state.boards.find(b=>b.id===s.boardId)!])).values()];
  if(boards.length<2)return false;
  const top=[...boards].sort((a,b)=>b.depth-a.depth||a.id.localeCompare(b.id));
  const gap=Math.abs(top[0]!.depth-top[1]!.depth);
  // 只在手作抬高的那一类“几乎同高但深度不同”时随机；深度完全相同的后续桥按编号稳定走北桥。
  return gap>0.0001&&gap<=0.15;
}

function settle(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,frames=24){
  for(let i=0;i<frames;i++){sim.step();game.advanceWorld(1000/60);}
}
function boardMoving(game:GameEngine){
  return game.state.boards.some(b=>!b.gone&&!b.melted&&b.active!==false&&(Math.hypot(b.vx??0,b.vy??0)>0.03||Math.abs(b.angularVelocity??0)>0.0006));
}
function settleQuiet(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,max=720){
  let quiet=0;
  for(let i=0;i<max;i++){
    sim.step();game.advanceWorld(1000/60);
    quiet=boardMoving(game)?0:quiet+1;
    if(i>=24&&quiet>=16)return;
  }
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
    sim.sync();settleQuiet(game,sim);waitAvailable(game,sim);
    const available=game.available();
    if(!available.length)break;
    let id:string|null=null;
    if(kind==='random')id=available[Math.floor(rnd()*available.length)]!.id;
    else if(kind==='greedy'){
      const matching=available.filter(s=>game.state.boxes.some(b=>b.color===s.color));
      id=(matching.length?topMost(game,matching):topMost(game,available)).id;
    }else{
      const profile=kind==='smart-strong'?SMART_PROFILES['smart-strong']:kind==='smart-weak'?SMART_PROFILES['smart-weak']:SMART_PROFILES.smart;
      id=smartChoice(game,rnd,profile);
    }
    if(!id)break;
    const result=game.dispatch({type:'pick',screwId:id});
    if(!result.ok){
      if(kind.startsWith('smart')&&game.canUndo&&undos<4){game.undo();undos++;sim.sync();continue;}
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

function argFlag(name:string){
  const hit=process.argv.find(arg=>arg.startsWith(`--${name}=`));
  return hit?hit.slice(name.length+3):undefined;
}

function shardIndices(count:number,shardIndex:number,shardCount:number){
  return Array.from({length:count},(_,i)=>i).filter(i=>i%shardCount===shardIndex);
}

async function runShardedJobs(jobs:number,randomRuns:number,smartRuns:number,ids:number[],out:string,variants:Kind[]){
  const script=process.argv.find(arg=>arg.endsWith('difficulty-benchmark.ts'))!;
  const loader=process.execArgv.length?process.execArgv:['--import','tsx'];
  const children=Array.from({length:jobs},(_,k)=>{
    const shardOut=`${out}.shard${k}`;
    const args=[...loader,script,String(randomRuns),String(smartRuns),ids.join(','),shardOut,variants.join(','),`--shard=${k}/${jobs}`];
    const child=spawn(process.execPath,args,{stdio:'inherit',cwd:process.cwd()});
    return new Promise<string>((resolve,reject)=>{
      child.on('exit',code=>code===0?resolve(shardOut):reject(new Error(`shard ${k} exited ${code}`)));
      child.on('error',reject);
    });
  });
  const files=await Promise.all(children);
  const shards=files.map(file=>JSON.parse(readFileSync(file,'utf8')));
  const report:any={...shards[0],jobs,levels:shards[0].levels.map((row:any,index:number)=>{
    const merged:any={...row};
    const randomRows=shards.flatMap((shard:any)=>shard.levels[index].randomRows??[]);
    merged.random=summarize(randomRows);
    delete merged.randomRows;
    for(const kind of variants){
      const key=kind==='smart'?'smart':kind;
      const rows=shards.flatMap((shard:any)=>shard.levels[index][key+'Rows']??[]);
      merged[key]=summarize(rows);
      delete merged[key+'Rows'];
    }
    return merged;
  })};
  report.finishedAt=new Date().toISOString();
  writeFileSync(out,JSON.stringify(report,null,2));
  for(const file of files)try{unlinkSync(file);}catch{}
  for(const row of report.levels){
    console.log(`L${row.id} official`,JSON.stringify(row.official));
    console.log(`L${row.id} greedy`,JSON.stringify(row.greedy));
    console.log(`L${row.id} random`,JSON.stringify(row.random));
    for(const kind of variants)console.log(`L${row.id} ${kind}`,JSON.stringify(row[kind==='smart'?'smart':kind]));
  }
  console.log('wrote',out,'jobs',jobs);
}

async function main(){
  const randomRuns=Number(process.argv[2]||50);
  const smartRuns=Number(process.argv[3]||50);
  const ids=(process.argv[4]||Array.from({length:CAMPAIGN_COUNT},(_,i)=>String(i+1)).join(',')).split(',').map(Number);
  const out=process.argv[5]||'/workspace/doro-screw-review/logs/difficulty-benchmark.json';
  const variants=((process.argv[6]||'smart-weak,smart,smart-strong').split(',') as Kind[]).filter(k=>k==='smart'||k==='smart-weak'||k==='smart-strong');
  const shardSpec=argFlag('shard');
  const defaultJobs=(smartRuns>=16||randomRuns>=16)?Math.min(8,availableParallelism()):1;
  const jobs=Math.max(1,Number(argFlag('jobs')||process.env.BENCH_JOBS||defaultJobs));
  if(!shardSpec&&jobs>1){
    mkdirSync('/workspace/doro-screw-review/logs',{recursive:true});
    await runShardedJobs(jobs,randomRuns,smartRuns,ids,out,variants);
    return;
  }
  const [shardIndex,shardCount]=shardSpec?shardSpec.split('/').map(Number):[0,1];
  const report:any={contentRevision:4,randomRuns,smartRuns,variants,jobs:shardCount,profiles:Object.fromEntries(variants.map(k=>[k,SMART_PROFILES[k]])),levels:[],startedAt:new Date().toISOString(),
    note:'裸玩不用辅助。乱点/贪心不撤回。第2关保持原墙（开局近高不同深的桥随机，之后装箱/层序）。第3–8关三种搜索强度：略弱深度2束宽3视野8，聪明玩家深度4束宽5视野16，更强深度6束宽7视野24。有同色时，只有本档视野已经看见再装箱会卡死才跳色；看不见陷阱就装箱。无同色时按搜索得分选择，不再额外优先“能露盒色”的板。落子前等待玻璃停稳。近分用 rng 打散，幅度随强度递减。最短解步数等于全关针数。'};
  mkdirSync('/workspace/doro-screw-review/logs',{recursive:true});
  for(const id of ids){
    const level=getCampaignLevel(id);
    const pins=level.boards.reduce((n,b)=>n+b.screws.length,0);
    const official=officialLine(level);
    if(!shardSpec||shardIndex===0)console.log(`L${id} official`,JSON.stringify(official));
    const greedy=await play('greedy',1,level);
    if(!shardSpec||shardIndex===0)console.log(`L${id} greedy`,JSON.stringify(greedy));
    const randomRows=[];
    for(const i of shardIndices(randomRuns,shardIndex,shardCount))randomRows.push(await play('random',4200+id*10000+i*7919,level));
    const random=summarize(randomRows);
    if(!shardSpec)console.log(`L${id} random`,JSON.stringify(random));
    const row:any={
      id,name:CAMPAIGN_NAMES[id-1]||level.name,pins,shortestMoves:pins,
      official:{ok:official.ok,peakBuffer:official.peak,skippedMatch:official.skippedMatch,choicePoints:official.choicePoints,moves:official.moves},
      greedy:{phase:greedy.phase,win:greedy.phase==='won',moves:greedy.moves,peak:greedy.peak},
      random,
      randomRows,
    };
    for(const kind of variants){
      const rows=[];
      for(const i of shardIndices(smartRuns,shardIndex,shardCount))rows.push(await play(kind,8200+id*13000+i*3571,level));
      const summary=summarize(rows);
      const key=kind==='smart'?'smart':kind;
      row[key]=summary;
      row[key+'Rows']=rows;
      if(!shardSpec)console.log(`L${id} ${kind}`,JSON.stringify(summary));
    }
    report.levels.push(row);
  }
  report.finishedAt=new Date().toISOString();
  writeFileSync(out,JSON.stringify(report,null,2));
  console.log('wrote',out);
}
const isDirect=process.argv.some(arg=>arg.endsWith('difficulty-benchmark.ts'));
if(isDirect)void main();
