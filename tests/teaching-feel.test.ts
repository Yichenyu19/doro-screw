import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine} from '../src/core';
import {getCampaignLevel} from '../src/authored-r2';
import {teachingCue,teachingTip} from '../src/teaching';

test('第一关关键提示只出现一次，普通点击不再反复说同一句',()=>{
  const level=getCampaignLevel(1),state=new GameEngine(level).state;
  const open=teachingCue(level,state,[],[]);
  assert.equal(open?.key,'l1-open');
  assert.match(open?.text??'',/已经露出来了/);
  assert.equal(teachingCue(level,state,[],['l1-open']),null);
  assert.equal(teachingTip(level,{...state,moves:1},[],['l1-open']),null);
  const buffer=teachingCue(level,{...state,moves:1},[{type:'routed',screwId:'s',color:'orange',destination:'buffer'}],['l1-open']);
  assert.match(buffer?.text??'',/先放在孔里也没关系/);
  assert.equal(teachingCue(level,{...state,moves:2},[{type:'routed',screwId:'s2',color:'orange',destination:'buffer'}],['l1-open','l1-buffer']),null);
  assert.equal(teachingTip(level,state,[],['skip']),'');
});

test('第二关开场仍说明大墙和免费辅助，之后不重复同一句',()=>{
  const level=getCampaignLevel(2),state=new GameEngine(level).state;
  const open=teachingTip(level,state,[],[]);
  assert.match(open??'',/120/);assert.match(open??'',/免费辅助/);
  assert.equal(teachingTip(level,state,[],['l2-open']),null);
  assert.equal(teachingTip(level,{...state,moves:3},[],['l2-open']),null);
});
