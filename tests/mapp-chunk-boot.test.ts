import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

test('官方入口在 currentScript 为 null 时仍只通知一次宿主',async()=>{
  const entry=readFileSync('mapp/src/main.ts','utf8');
  assert.doesNotMatch(entry,/currentScript|import\(/);
  assert.match(entry,/finally\s*\{[\s\S]*host\.rendered\(\)/);
  const appPath='mapp/dist/web/app.js';
  if(!existsSync(appPath))return;
  const code=readFileSync(appPath,'utf8');
  assert.doesNotMatch(code,/currentScript|<\/script|\bnew Function\b|\beval\s*\(|innerHTML|outerHTML|insertAdjacentHTML|srcdoc|\bimport\s*\(|\bnew Worker\s*\(|<!--/);
  const {runGameVm}=await import('../scripts/check-official-game.mjs');
  const result=await runGameVm();
  assert.equal(result.currentScript,null);
  assert.equal(result.ready,1);
  assert.equal(result.home,true);
  assert.deepEqual(result.errors,[]);
});
