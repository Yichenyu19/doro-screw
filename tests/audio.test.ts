import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {SAMPLE_STEMS,SOUND_SPEC,SYNTH_RECIPES,VOICE_CAP,MASTER_GAIN,BUS_GAIN,recipeDuration,type SoundName} from '../src/audio';

const NAMES=Object.keys(SYNTH_RECIPES) as SoundName[];

test('每个声音事件都有合成配方、总线规格和采样文件',()=>{
  assert.deepEqual(NAMES.sort(),Object.keys(SOUND_SPEC).sort());
  for(const name of NAMES){
    const recipe=SYNTH_RECIPES[name],spec=SOUND_SPEC[name];
    assert.ok(recipe.length>=2,name+' 分层不足');
    assert.ok(recipe.every(voice=>voice.attack>0&&voice.dur>0&&voice.gain>0),name+' 包络不完整');
    assert.ok(recipeDuration(recipe)<1.2,name+' 过长');
    assert.ok(spec.priority>=1&&spec.coalesce>0&&spec.gain>0&&spec.gain<=1);
    assert.ok(spec.bus in BUS_GAIN);
  }
  for(const stem of SAMPLE_STEMS){
    const file=path.join('public/sfx',stem+'.ogg');
    assert.equal(existsSync(file),true,stem+' 缺失');
    assert.ok(statSync(file).size>400,stem+' 空文件');
  }
  const total=SAMPLE_STEMS.reduce((n,stem)=>n+statSync(path.join('public/sfx',stem+'.ogg')).size,0);
  assert.ok(total<1.5*1024*1024,'音效包超过 1.5 MiB');
});

test('强弱分层、高频声克制、记忆点不共用同一套增益',()=>{
  const peak=Object.fromEntries(NAMES.map(name=>[name,Math.max(...SYNTH_RECIPES[name].map(voice=>voice.gain))]));
  assert.ok(peak.fall>peak.pick);
  assert.ok(peak.fall>peak.loosen);
  assert.ok(peak.pick!==peak.arrive);
  assert.ok(peak.refill!==peak.reveal);
  assert.ok(peak.loosen<peak.arrive);
  assert.ok(peak.reveal<peak.fall);
  assert.ok(peak.chain<peak.win);
  assert.ok(peak.ui<peak.pick);
  assert.ok(peak.undo<peak.fall);
  assert.ok(SOUND_SPEC.pick.coalesce>=.05);
  assert.ok(SOUND_SPEC.arrive.coalesce>=.04);
  assert.ok(SOUND_SPEC.blocked.coalesce>=.1);
  assert.ok(SOUND_SPEC.chain.coalesce>=.15);
  assert.ok(SOUND_SPEC.win.rateJitter<=.01);
  assert.ok(SOUND_SPEC.wall.rateJitter<=.01);
  assert.ok(SOUND_SPEC.ui.gain<=.55);
  assert.equal(VOICE_CAP,5);
  assert.ok(MASTER_GAIN<=.95);
  assert.ok(BUS_GAIN.ui<BUS_GAIN.reward);
  assert.ok(BUS_GAIN.action<BUS_GAIN.reward);
  assert.ok(SOUND_SPEC.wall.priority>SOUND_SPEC.win.priority);
  assert.ok(SOUND_SPEC.win.priority>SOUND_SPEC.box.priority);
  assert.ok(SOUND_SPEC.box.priority>SOUND_SPEC.pick.priority);
});
