import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const shell=readFileSync('mapp/shell.js','utf8');

test('入口脚本很小，先画加载壳并通知宿主，再加载游戏分包',()=>{
  assert.ok(shell.length<4096,shell.length);
  assert.doesNotMatch(shell,/\beval\b|new Function|new Worker/);
  const paint=shell.indexOf('正在打开');
  const ready=shell.indexOf('lifecycle.ready');
  const load=shell.indexOf('scripts.load("chunks/game.js")');
  assert.ok(paint>=0&&ready>paint&&load>ready);
  assert.match(shell,/globalThis\.miniApp/);
});

test('打包使用官方 pack，并把游戏放到已声明的 classic 分包',()=>{
  const pack=readFileSync('scripts/pack-mapp.mjs','utf8');
  assert.match(pack,/@discourse-mini-app\/sdk\/pack/);
  assert.match(pack,/chunks\/game\.js/);
  assert.match(pack,/code\.load/);
  assert.match(pack,/mapp\/shell\.js/);
});
