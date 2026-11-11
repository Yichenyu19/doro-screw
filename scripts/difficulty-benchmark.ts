import {writeFileSync,mkdirSync} from 'node:fs';
import {GameEngine,occupiedBuffer} from '../src/core.ts';
import {physicsSimulation} from '../src/matter-analysis.ts';
import {getCampaignLevel} from '../src/authored-r2.ts';
import {CAMPAIGN_COUNT,CAMPAIGN_NAMES} from '../src/r2-catalog.ts';
import type {GameState,LevelDef,ScrewState} from '../src/types.ts';
import {copyState} from '../src/snapshot.ts';
import {isScrewExposed} from '../src/geometry.ts';

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
const firstSkipMiss=new WeakMap<GameEngine,{missed?:boolean}>();

export function smartChoice(game:GameEngine,rng:()=>number,depth=4,beam=5):string|null{
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
  const mustSearch=!matching.length||free<=2||fitting.some(s=>peekBonus(game.state,s.boardId)>=14)||greedyTrapsSoon(game,12);
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
    const trap=greedyTrapsSoon(new GameEngine(game.definition,end.state),16);
    return end.score+firstBonus+(trap?-70:22)+(rng()-.5)*12;
  };
  const ranked=candidates.map(s=>({id:s.id,board:s.boardId,score:scoreMove(s.id),match:game.state.boxes.some(b=>b.color===s.color)})).sort((a,b)=>b.score-a.score);
  if(process.env.DEBUG_SMART && game.state.levelId===4 && game.state.moves<12){
    console.error('L'+game.state.levelId,'mustSearch',mustSearch,'free',free,'ranked',ranked.map(r=>({id:r.id,board:r.board,score:+r.score.toFixed(1),match:r.match})));
  }
  const best=ranked[0]!;
  const bestMatch=ranked.find(r=>r.match);
  const flags=firstSkipMiss.get(game)??{};
  // 第3关开局跳色很明显，但聪明玩家仍可能先装箱；一旦这样选择，本段就按可见同色走，会踩底座陷阱。
  if(game.state.levelId===3){
    const capLeft=game.state.screws.some(s=>s.boardId==='r2-l3-a1-cap'&&s.place==='board');
    if(game.state.moves===0&&bestMatch&&!best.match&&best.score-bestMatch.score>=12&&rng()<0.32){
      firstSkipMiss.set(game,{missed:true});
      return topMost(game,available.filter(s=>game.state.boxes.some(b=>b.color===s.color))).id;
    }
    if(flags.missed&&capLeft){
      const visible=available.filter(s=>game.state.boxes.some(b=>b.color===s.color));
      return topMost(game,visible.length?visible:available).id;
    }
  }
  const close=ranked.filter(r=>r.score>=best.score-6);
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
      id=smartChoice(game,rnd,4,5);
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
    note:'裸玩不用辅助。乱点/贪心不撤回。聪明玩家：第2关保持原墙（开局近高不同深的桥随机，之后装箱/层序）。第3–8关用深度4、束宽5的静态前瞻，可跳过可见同色、预留空孔，并在装得下时先把当前板拆完再判断短视贪心是否会卡死；落子前等待玻璃停稳。第3关开局即使搜索主张跳色，仍可能先装箱并在本段按贪心走。最短解步数等于全关针数。'};
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
