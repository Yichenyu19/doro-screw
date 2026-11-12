import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const entry=readFileSync('src/mapp/entry.ts','utf8');
const pack=readFileSync('scripts/pack-mapp.mjs','utf8');

test('入口先画加载壳并通知宿主，再启动游戏，不加载分包',()=>{
  assert.doesNotMatch(entry,/scripts\.load|chunks\/game\.js|code\.load/);
  const boot=entry.slice(entry.indexOf('async function start'));
  const paint=boot.indexOf('paintLoading');
  const ready=boot.indexOf('lifecycle.ready');
  const start=boot.indexOf('launchMiniApp(');
  assert.ok(paint>=0&&ready>paint&&start>ready);
  assert.match(entry,/globalThis\.DoroGame=Object\.freeze\(\{boot\}\)/);
  assert.match(entry,/void boot\(\)\.catch\(fail\)/);
  assert.doesNotMatch(entry,/currentScript/);
  assert.match(entry,/__DORO_BOOT__/);
  assert.match(entry,/微应用未能启动/);
  const failBody=entry.slice(entry.indexOf('function fail'));
  assert.ok(failBody.indexOf('lifecycle.ready')>0);
});

test('打包使用官方 pack，产物是单一 app.js',()=>{
  assert.match(pack,/@discourse-mini-app\/sdk\/pack/);
  assert.match(pack,/item!=='code\.load'/);
  assert.doesNotMatch(pack,/chunks\/game\.js/);
  assert.match(pack,/assertPackedApp/);
});
