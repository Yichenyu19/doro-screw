import test from 'node:test';
import assert from 'node:assert/strict';
import {getR2Practice} from '../src/authored-r2';
import {getR2Challenge} from '../src/challenges-r2';
import {dailyPractice} from '../src/r2-catalog';
import type {ColorId,LevelDef} from '../src/types';
function structure(level:LevelDef){const names=new Map<ColorId,number>(),color=(c:ColorId)=>{if(!names.has(c))names.set(c,names.size);return names.get(c);},boardId=new Map(level.boards.map((b,i)=>[b.id,i]));const queue=level.boxQueue.map(color);return JSON.stringify({queue,boards:level.boards.map(b=>({shape:b.shape,x:b.x,y:b.y,width:b.width,height:b.height,angle:b.angle,depth:b.depth,reserved:b.reserved,pins:b.screws.map(s=>({x:s.x,y:s.y,color:color(s.color)}))})),packets:level.revealPlan?.packets.map(p=>({boards:p.boardIds.map(id=>boardId.get(id)),prerequisites:p.requiresCleared.map(id=>boardId.get(id))}))});}
test('每个主题六种编排在忽略名字、编号和整体换色后仍各不相同',()=>{for(let theme=2;theme<=8;theme++){const signatures=Array.from({length:6},(_,v)=>structure(getR2Practice(theme,v)));assert.equal(new Set(signatures).size,6,'主题 '+theme+' 存在仅换色的重复编排');}});
test('每日共享采用同一UTC日期，挑战初始盘面和奖励边界可重复重建',async()=>{
  assert.deepEqual(dailyPractice(new Date('2026-10-06T00:00:00Z')),dailyPractice(new Date('2026-10-06T23:59:59Z')));
  for(const theme of [2,4,6,8])for(const mode of ['rescue','mastery'] as const){const a=await getR2Challenge(theme,29,mode),b=await getR2Challenge(theme,29,mode);if(a.challengeStart)a.challengeStart.state.runId='same';if(b.challengeStart)b.challengeStart.state.runId='same';assert.deepEqual(a,b);assert.equal(a.attempt,29);assert.equal(a.mode,mode);}
});
