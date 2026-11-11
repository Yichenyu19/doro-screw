import {getCampaignLevel} from '../src/authored-r2.ts';
import {GameEngine,occupiedBuffer} from '../src/core.ts';
import {physicsSimulation} from '../src/matter-analysis.ts';
import {copyState} from '../src/snapshot.ts';

function settlePick(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,screwId:string){
  sim.sync();let stable=0;
  for(let i=0;i<1800&&stable<12;i++){sim.step();game.advanceWorld(1000/60);stable=game.canPick(screwId)?stable+1:0;}
  return game.canPick(screwId);
}

function afterPick(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,waitMs=50){
  sim.sync();
  for(let i=0;i<Math.ceil((waitMs)/(1000/60));i++){sim.step();game.advanceWorld(1000/60);}
}

function greedyRest(game:GameEngine,sim:ReturnType<typeof physicsSimulation>,limit:number){
  while(game.state.phase==='playing'&&game.state.moves<limit){
    sim.sync();
    for(let i=0;i<48;i++){sim.step();game.advanceWorld(1000/60);}
    const available=game.available();
    if(!available.length){
      for(let i=0;i<600&&!game.available().length&&game.state.phase==='playing';i++){sim.step();game.advanceWorld(1000/60);}
      if(!game.available().length)break;
    }
    const matching=available.filter(s=>game.state.boxes.some(b=>b.color===s.color));
    const pick=(matching.length?matching:available).slice().sort((a,b)=>{
      const da=game.state.boards.find(p=>p.id===a.boardId)!.depth;
      const db=game.state.boards.find(p=>p.id===b.boardId)!.depth;
      return db-da||a.id.localeCompare(b.id);
    })[0]!;
    const result=game.dispatch({type:'pick',screwId:pick.id});
    if(!result.ok)break;
    sim.sync();
  }
  return {phase:game.state.phase,moves:game.state.moves,peak:game.state.stats.peakBuffer};
}

function analyze(id:number){
  const level=getCampaignLevel(id);
  const pins=level.boards.reduce((n,b)=>n+b.screws.length,0);
  const game=new GameEngine(level),sim=physicsSimulation(game);
  const events:any[]=[];
  let prevBoxes=game.state.boxes.map(b=>b.color).join(',');
  let prevCompleted=game.state.stats.boxesCompleted;
  let move=0;
  for(const step of level.witness){
    if(game.state.phase==='won')break;
    if(game.state.screws.find(s=>s.id===step.screwId)?.place!=='board')continue;
    if(!settlePick(game,sim,step.screwId)){
      events.push({type:'official-blocked',move,id:step.screwId});
      break;
    }
    const available=game.available();
    const matches=available.filter(s=>game.state.boxes.some(b=>b.color===s.color));
    const pin=game.state.screws.find(s=>s.id===step.screwId)!;
    const skipped=matches.length>0&&!matches.some(s=>s.id===step.screwId)&&!game.state.boxes.some(b=>b.color===pin.color);
    move++;
    if(skipped){
      const bait=matches.slice().sort((a,b)=>{
        const da=game.state.boards.find(p=>p.id===a.boardId)!.depth;
        const db=game.state.boards.find(p=>p.id===b.boardId)!.depth;
        return db-da||a.id.localeCompare(b.id);
      })[0]!;
      const fork=new GameEngine(level,copyState(game.state));
      const fsim=physicsSimulation(fork);
      let baitResult:any={skipped:true};
      if(fork.canPick(bait.id)){
        const r=fork.dispatch({type:'pick',screwId:bait.id});
        if(r.ok){
          fsim.sync();
          baitResult=greedyRest(fork,fsim,Math.min(pins+12,move+40));
        }else baitResult={dispatch:r.reason};
      }else baitResult={cannotPick:true};
      events.push({
        type:'skip-fork',move,official:{id:pin.id,board:pin.boardId,color:pin.color},
        bait:{id:bait.id,board:bait.boardId,color:bait.color},
        boxes:game.state.boxes.map(b=>b.color),occ:occupiedBuffer(game.state),
        afterBaitThenGreedy:baitResult,
      });
    }
    const result=game.dispatch({type:'pick',screwId:step.screwId});
    if(!result.ok){events.push({type:'official-fail',move,reason:result.reason});break;}
    afterPick(game,sim,step.waitMs??50);
    const boxes=game.state.boxes.map(b=>b.color).join(',');
    const completed=game.state.stats.boxesCompleted;
    if(boxes!==prevBoxes||completed!==prevCompleted){
      const available=game.available();
      const matches=available.filter(s=>game.state.boxes.some(b=>b.color===s.color));
      const exposedBoards=[...new Set(available.map(s=>s.boardId))];
      events.push({
        type:'box-shift',move,completed,boxes:game.state.boxes.map(b=>b.color),
        from:prevBoxes,matchN:matches.length,matchBoards:[...new Set(matches.map(s=>s.boardId))],
        exposedBoards,occ:occupiedBuffer(game.state),
      });
      prevBoxes=boxes;prevCompleted=completed;
    }
  }
  return {
    id,name:level.name,official:{phase:game.state.phase,moves:game.state.moves,peak:game.state.stats.peakBuffer,ok:game.state.phase==='won'},
    skipForks:events.filter(e=>e.type==='skip-fork'),
    boxShifts:events.filter(e=>e.type==='box-shift'),
    other:events.filter(e=>e.type!=='skip-fork'&&e.type!=='box-shift'),
  };
}

for(const id of [3,4,5,6,7,8]){
  const r=analyze(id);
  const lethal=r.skipForks.filter(f=>f.afterBaitThenGreedy?.phase==='stuck');
  const survived=r.skipForks.filter(f=>f.afterBaitThenGreedy?.phase!=='stuck');
  console.log('\n==== L'+r.id,r.name,'official',r.official.phase,r.official.moves,'peak',r.official.peak);
  console.log('box-shifts',r.boxShifts.length,'skip-forks',r.skipForks.length,'lethal-if-take-match-then-greedy',lethal.length,'not-immediately-lethal',survived.length);
  for(const f of r.skipForks){
    const bait=f.afterBaitThenGreedy;
    console.log('  move',f.move,'skip',f.official.board.replace(/r2-l[0-9]+-/,''),f.official.color,'vs bait',f.bait.board.replace(/r2-l[0-9]+-/,''),f.bait.color,'->',bait.phase||bait,'@',bait.moves,'peak',bait.peak,'boxes',f.boxes.join('/'));
  }
  // print a compact rhythm of box shifts
  console.log('  rhythm', r.boxShifts.map((s:any)=>`m${s.move}:[${s.boxes.join(',')}] match ${s.matchN}`).join(' | '));
}
