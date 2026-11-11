import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine} from '../src/core';
import {getCampaignLevel} from '../src/authored-r2';
import {teachingCue,teachingTip} from '../src/teaching';

test('修订4主线开场不铺说明，跳过标记仍然安静',()=>{
  const level=getCampaignLevel(1),state=new GameEngine(level).state;
  assert.equal(teachingCue(level,state,[],[]),null);
  assert.equal(teachingTip(level,state,[],[]),null);
  assert.equal(teachingCue(level,{...state,moves:1},[{type:'routed',screwId:'s',color:'orange',destination:'buffer'}],[]),null);
  assert.equal(teachingTip(level,state,[],['skip']),'');
  const wall=getCampaignLevel(2);
  assert.equal(teachingTip(wall,new GameEngine(wall).state,[],[]),null);
});
