import test from 'node:test';
import assert from 'node:assert/strict';
import {DELIGHT_KEY,freshLedger,normalizeLedger,loadLedger,saveLedger,noteWallBump,noteWallBroken,tallyGroups} from '../src/delight/store';
import {scrambleFrames,SERIAL_FINAL} from '../src/delight/keygen';
import {idleActFor,idleDueAt,nextStreak,registerTap,freshPoke,IDLE_FIRST_MS,POKE_WINDOW_MS,WISE_AFTER_POKES} from '../src/delight/doro-life';
import {crackPaths,WALL_BEATS} from '../src/delight/wall-break';
import {DELIGHT_SOUNDS} from '../src/delight/sounds';

class Mem{map=new Map<string,string>();getItem(k:string){return this.map.get(k)??null;}setItem(k:string,v:string){this.map.set(k,v);}}

test('彩蛋账本：独立键、坏数据回落、旧草稿迁移', ()=>{
  assert.notEqual(DELIGHT_KEY,'doro-screw-reborn:v4:r2');
  assert.ok(!DELIGHT_KEY.startsWith('doro-screw-reborn'),'不与主存档及其恢复日志前缀混用');
  assert.deepEqual(normalizeLedger(null),freshLedger());
  assert.deepEqual(normalizeLedger('x'),freshLedger());
  assert.deepEqual(normalizeLedger({v:1,wallBumps:-3,wallBroken:'yes',pokes:2.7}),{v:1,wallBumps:0,wallBroken:false,pokes:2});
  assert.deepEqual(normalizeLedger({bumps:4}),{v:1,wallBumps:4,wallBroken:false,pokes:0},'schema 0 → 1');
  assert.deepEqual(normalizeLedger({v:2,wallBumps:3,wallBroken:true,pokes:1,extra:9}),{v:1,wallBumps:3,wallBroken:true,pokes:1});
  const mem=new Mem();
  assert.deepEqual(loadLedger(mem),freshLedger());
  mem.setItem(DELIGHT_KEY,'{not json');assert.deepEqual(loadLedger(mem),freshLedger());
  assert.ok(saveLedger({v:1,wallBumps:2,wallBroken:false,pokes:5},mem));
  assert.deepEqual(loadLedger(mem),{v:1,wallBumps:2,wallBroken:false,pokes:5});
  assert.equal(saveLedger(freshLedger(),{setItem(){throw new Error('quota');}}),false,'存不下也不抛错');
});

test('撞墙记号：破墙后不再增长，五画一组', ()=>{
  let l=freshLedger();l=noteWallBump(noteWallBump(l));assert.equal(l.wallBumps,2);
  l=noteWallBroken(l);assert.equal(noteWallBump(l).wallBumps,2);
  assert.deepEqual(tallyGroups(0),{groups:[],overflow:0});
  assert.deepEqual(tallyGroups(7),{groups:[5,2],overflow:0});
  assert.deepEqual(tallyGroups(23),{groups:[5,5,5,5],overflow:3});
});

test('注册机序列号：逐位锁定，最后一帧必为正式串', ()=>{
  const frames=scrambleFrames(SERIAL_FINAL,12,3);
  assert.equal(frames.length,12);assert.equal(frames.at(-1),SERIAL_FINAL);
  for(const f of frames){assert.equal(f.length,SERIAL_FINAL.length);assert.deepEqual([...f].map((c,i)=>c==='-'?i:-1).filter(i=>i>=0),[...SERIAL_FINAL].map((c,i)=>c==='-'?i:-1).filter(i=>i>=0));}
  assert.deepEqual(scrambleFrames(SERIAL_FINAL,12,3),frames,'同种子可复现');
  assert.notEqual(frames[0],SERIAL_FINAL);
});

test('空闲小动作：低频、前两次轮换、之后睡着', ()=>{
  assert.equal(idleDueAt(0),IDLE_FIRST_MS);assert.ok(IDLE_FIRST_MS>=20000,'至少 20 秒没碰才演');
  assert.ok(idleDueAt(1)>idleDueAt(0));
  assert.notEqual(idleActFor(0,.2),idleActFor(1,.2));
  assert.notEqual(idleActFor(0,.8),idleActFor(1,.8));
  assert.equal(idleActFor(2,.1),'doze');assert.equal(idleActFor(5,.9),'doze');
});

test('连续直入盒：进暂存清零，4/8/12 起逐级反应', ()=>{
  let s=0;const cues:Array<string|null>=[];
  for(let i=0;i<18;i++){const r=nextStreak(s,false);s=r.streak;cues.push(r.cue);}
  assert.equal(cues[3],'hop');assert.equal(cues[7],'cheer');assert.equal(cues[11],'sparkle');assert.equal(cues[17],'sparkle');
  assert.equal(cues.filter(Boolean).length,4,'大部分拆钉不打扰');
  assert.deepEqual(nextStreak(9,true),{streak:0,cue:null});
});

test('首页戳一戳：五连戳晕，戳多了会躲第一下', ()=>{
  let st=freshPoke(),cue='';
  for(let i=0;i<5;i++){const r=registerTap(st,1000+i*200,0);st=r.state;cue=r.cue;}
  assert.equal(cue,'dizzy');
  const slow=registerTap(registerTap(freshPoke(),0,0).state,POKE_WINDOW_MS+10,0);
  assert.equal(slow.cue,'boing');assert.equal(slow.state.taps.length,1,'间隔太长重新数');
  let wise=registerTap(freshPoke(),10000,WISE_AFTER_POKES);assert.equal(wise.cue,'dodge');
  wise=registerTap(wise.state,10400,WISE_AFTER_POKES+1);assert.equal(wise.cue,'boing','第二下才戳到');
  wise=registerTap(wise.state,10400+POKE_WINDOW_MS+50,WISE_AFTER_POKES+2);assert.equal(wise.cue,'dodge','新一轮又躲');
});

test('破墙仪式：拍点有序、裂纹从破口出发、全程不超过 5 秒', ()=>{
  const at=WALL_BEATS.map(b=>b.at);assert.deepEqual([...at].sort((a,b)=>a-b),at);
  assert.ok(at.at(-1)!<=5000);
  assert.equal(WALL_BEATS.findIndex(b=>b.id==='stamp')>WALL_BEATS.findIndex(b=>b.id==='burst'),true);
  const paths=crackPaths(30,60,5);assert.equal(paths.length,9);
  for(const p of paths)assert.match(p,/^M30\.0 60\.0 L/);
  assert.deepEqual(crackPaths(30,60,5),paths);
});

test('彩蛋声音只用合成，增益克制', ()=>{
  for(const [name,recipe] of Object.entries(DELIGHT_SOUNDS)){
    assert.ok(recipe.length>0,name);
    for(const v of recipe){assert.ok(v.gain>0&&v.gain<=.12,name+' gain');assert.ok(v.start+v.dur<=1,name+' 不超过 1 秒');assert.ok(!('file' in v));}
  }
});
