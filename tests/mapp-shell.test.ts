import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const entry=readFileSync('mapp/src/main.ts','utf8');
const pack=readFileSync('mapp/scripts/package.ts','utf8');

test('入口先画加载文案，连接宿主后再启动，失败也会通知',()=>{
  assert.doesNotMatch(entry,/scripts\.load|chunks\/game\.js|code\.load|currentScript/);
  const refresh=entry.slice(entry.indexOf('async function refreshUser'));
  const connect=refresh.indexOf('host.connect');
  const install=refresh.indexOf('installShapeOutlines');
  const ready=refresh.indexOf('host.rendered');
  const launch=refresh.indexOf('launchMiniApp');
  assert.ok(connect>=0&&install>connect&&ready>install&&launch>ready);
  assert.match(entry,/paint\(messages\.zh_CN\.loading\)/);
  assert.match(entry,/微应用未能启动/);
  assert.match(entry,/void refreshUser\(\)/);
});

test('打包脚本只调用官方 pack',()=>{
  assert.match(pack,/import \{ pack \} from "@discourse-mini-app\/sdk\/pack"/);
  assert.match(pack,/await pack\(\{ manifest, files, outputDirectory: "dist\/package" \}\)/);
  assert.doesNotMatch(pack,/code\.load|chunks\/game\.js|finalizeGameSource|assertPackedApp/);
});
