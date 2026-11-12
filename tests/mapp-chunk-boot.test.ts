import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {assertPackedApp,finalizeGameSource} from '../scripts/assert-game-chunk.mjs';

test('单一 app.js 用 new Function 不启动，调用启动函数后才进首页',async()=>{
  const built=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','mapp/vite.config.ts'],{stdio:'inherit'});
  assert.equal(built.status,0);
  const raw=readFileSync('dist-mapp/web/app.js','utf8');
  const code=finalizeGameSource(raw);
  const manifest=JSON.parse(readFileSync('mapp/manifest.json','utf8'));
  const result=await assertPackedApp(code,manifest);
  assert.equal(result.bare.booted,false);
  assert.equal(result.bare.listenerFailures,0);
  assert.equal(result.home.home,true);
  assert.doesNotMatch(code,/<\/script/);
  assert.doesNotMatch(code,/\bnew Function\b|\beval\s*\(|innerHTML/);
});
