import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {assertPackedApp,finalizeGameSource} from '../scripts/assert-game-chunk.mjs';

test('currentScript 为 null 时 new Function 仍会启动并只通知一次宿主',async()=>{
  const built=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','mapp/vite.config.ts'],{stdio:'inherit'});
  assert.equal(built.status,0);
  const raw=readFileSync('dist-mapp/web/app.js','utf8');
  const code=finalizeGameSource(raw);
  const manifest=JSON.parse(readFileSync('mapp/manifest.json','utf8'));
  const result=await assertPackedApp(code,manifest);
  assert.equal(result.home.currentScript,null);
  assert.equal(result.home.home,true);
  assert.ok(result.home.readyCount>=1);
  assert.equal(result.home.readyAfterSecond,result.home.readyCount);
  assert.doesNotMatch(code,/currentScript|<\/script|\bnew Function\b|\beval\s*\(|innerHTML|outerHTML|insertAdjacentHTML|srcdoc|\bimport\s*\(|\bnew Worker\s*\(/);
});
