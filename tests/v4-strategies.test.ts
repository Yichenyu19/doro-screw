import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine,assertConservation} from '../src/core';
import {strategyProbe} from '../src/strategy-modules';
import {getLevel} from '../src/levels';
import {gameSimulation} from './helpers/matter';
import {physicalHint} from '../src/matter-analysis';
import {diagnoseVisible,observeVisible} from '../src/visible-analysis';
import {tutorialEvidence} from '../src/teaching';
import {localOutline,remainingOnBoard} from '../src/geometry';
import {polygonCentroid} from '../src/physics';
import type {LevelDef,StrategyTheme} from '../src/types';
const themes:StrategyTheme[]=['quadrants','interlock','embrace','lattice','hinge','cascade'];
function play(level:LevelDef,ids=level.witness.map(s=>s.screwId)){
 const game=new GameEngine(level),sim=gameSimulation(game),evidence=new Set<string>();
 for(const id of ids){sim.sync();for(let f=0;f<900&&!game.canPick(id);f++)sim.step();assert(game.canPick(id),id+' 被挡');const before=game.snapshot(),result=game.dispatch({type:'pick',screwId:id});assert(result.ok);for(const event of tutorialEvidence(level,before,result.events))evidence.add(event);sim.sync();sim.step(result.events.some(e=>e.type==='board-released'&&e.remaining===0)?78:2);assertConservation(game.state);if(game.state.phase==='stuck')break;}
 return{game,sim,evidence};
}
for(const theme of themes)test('策略小关完整 Matter 路线 '+theme,()=>assert.equal(play(strategyProbe(theme)).game.state.phase,'won'));
test('四区桥接：移走关键桥后当前盒色直接可达；错误投资占满五孔',()=>{
 const level=strategyProbe('quadrants'),initial=new GameEngine(level);assert.equal(initial.available().filter(s=>['orange','cyan'].includes(s.color)).length,0);
 const altered=structuredClone(level);altered.boards.find(b=>b.id==='probe-bridge')!.y=75;assert.equal(new GameEngine(altered).available().filter(s=>['orange','cyan'].includes(s.color)).length,6);
 assert.equal(play(level,['probe-south-s1','probe-south-s2','probe-bridge-s1','probe-bridge-s2','probe-bridge-s3']).game.state.phase,'stuck');
});
test('左右互锁：第三颗当前盒色在另一侧，交换钉色后跨侧依赖消失',()=>{
 const level=strategyProbe('interlock'),left=['probe-west-ring-s1','probe-west-ring-s2','probe-west-ring-s3'];
 const original=play(level,left).game;assert.equal(original.state.stats.boxesCompleted,0);assert.equal(original.state.buffer.filter(Boolean).length,1);
 const altered=structuredClone(level),a=altered.boards.find(b=>b.id==='probe-west-ring')!.screws[2],b=altered.boards.find(b=>b.id==='probe-east-ring')!.screws[0];[a.color,b.color]=[b.color,a.color];
 assert.equal(play(altered,left).game.state.stats.boxesCompleted,1);
});
test('中心环抱：提升中心后，外圈开口不再决定中心可达性',()=>{
 const level=strategyProbe('embrace');assert.equal(new GameEngine(level).available().filter(s=>s.boardId==='probe-center').length,0);
 const altered=structuredClone(level);altered.boards.find(b=>b.id==='probe-center')!.depth=8;assert.equal(new GameEngine(altered).available().filter(s=>s.boardId==='probe-center').length,3);
});
test('正交长板：共同挡板覆盖左区和竖板中钉，缩短后这一关系消失',()=>{
 const level=strategyProbe('lattice'),game=new GameEngine(level);assert(!game.canPick('probe-west-s1'));assert(!game.canPick('probe-vertical-s3'));
 const altered=structuredClone(level),bridge=altered.boards.find(b=>b.id==='probe-bridge')!;bridge.width=132;bridge.screws[0].x=-38;bridge.screws[1].x=38;
 const changed=new GameEngine(altered);assert(changed.canPick('probe-west-s1'));assert(changed.canPick('probe-vertical-s3'));
 assert.equal(play(level,['probe-vertical-s1','probe-vertical-s2','probe-bridge-s1','probe-bridge-s2','probe-bridge-s3']).game.state.phase,'stuck');
});
test('单钉开窗：支点移到质心后，原窗口不再被重力打开',()=>{
 const level=strategyProbe('hinge'),prefix=['probe-hinge-s2','probe-hinge-s3'],baseline=play(level,prefix);baseline.sim.step(600);assert(baseline.game.canPick('probe-window-s1'));
 const altered=structuredClone(level),gate=altered.boards.find(b=>b.id==='probe-hinge')!,center=polygonCentroid(localOutline(gate.shape,'v4').map(p=>({x:p.x*gate.width,y:p.y*gate.height})));Object.assign(gate.screws[0],center);gate.screws[1].x=48;
 const changed=play(altered,prefix);changed.sim.step(900);assert(!changed.game.canPick('probe-window-s1'));
});
test('回流链：交换预告盒序后，同一提前暂存不再立即连装两盒',()=>{
 const level=strategyProbe('cascade'),prefix=level.witness.slice(0,6).map(s=>s.screwId);assert.equal(play(level,prefix).game.state.stats.maxChain,2);
 const altered=structuredClone(level);[altered.boxQueue[2],altered.boxQueue[3]]=[altered.boxQueue[3],altered.boxQueue[2]];const changed=play(altered,prefix).game;assert.equal(changed.state.stats.maxChain,1);assert.equal(changed.state.buffer.filter(Boolean).length,3);
});
test('首关实际事件分别记录暂存、回流、利用窗口；任意单钉事件不算掌握',()=>{
 const level=getLevel(1),played=play(level);assert.deepEqual([...played.evidence].sort(),['buffer','hinge','refill']);assert.equal(played.game.state.phase,'won');
 assert.deepEqual(tutorialEvidence(level,new GameEngine(level).state,[{type:'board-released',boardId:'l1-lock',remaining:1}]),[]);
});
test('首关绕过摆动的必要计数：首个盒色前，整拆长板至少要五颗非盒色',()=>{
 const game=new GameEngine(getLevel(1));assert.equal(game.state.screws.length,15);assert.equal(new Set(game.state.screws.map(s=>s.color)).size,5);assert(game.available().every(s=>!game.state.boxes.some(b=>b.color===s.color)));
 assert(!game.canPick('l1-swing-s1'));assert.equal(remainingOnBoard(game.state,'l1-swing').length,3);assert.equal(remainingOnBoard(game.state,'l1-lock').length,3);
 // 其他板至少保留两钉而固定；三角板至多在先拆两钉后移动，才可能露出长板支点。
 // 首个盒色仍被长板遮住。整拆长板需要 2+3=5 颗非盒色，第五颗已进入救场。
 assert.equal(2+3,game.state.capacity);
 const bad=play(getLevel(1),['l1-finish-s3','l1-finish-s4','l1-finish-s5','l1-swing-s2','l1-swing-s3']);assert.equal(bad.game.state.phase,'stuck');
});
test('可见诊断不受隐藏盒序或未显露后备组的颜色影响',()=>{
 const game=new GameEngine(getLevel(2)),before=diagnoseVisible(observeVisible(game.state)),changed=structuredClone(game.state);for(let i=changed.queueCursor+2;i<changed.boxQueue.length;i++)changed.boxQueue[i]='gray';for(const s of changed.screws)if(changed.boards.find(b=>b.id===s.boardId)?.active===false)s.color='gray';
 assert.deepEqual(diagnoseVisible(observeVisible(changed)),before);assert(!('witness' in observeVisible(changed)));assert.equal(observeVisible(changed).preview.length,2);
});
test('首关具体提示从当前状态完成真实物理回放后才显示，预算耗尽不猜测',()=>{
 const level=getLevel(1),game=new GameEngine(level),info=physicalHint(level,game.state,4000);assert.equal(info.type,'move');if(info.type==='move'){assert.equal(info.model,'matter-verified');assert.equal(info.verifiedSteps,15);assert(game.canPick(info.id));}
 const unknown=physicalHint(level,game.state,0);assert.equal(unknown.type,'unknown');assert.equal(game.state.stats.hintsShown,0);
});
