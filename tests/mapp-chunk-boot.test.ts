import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {assertChunkShape,assertGameChunkSource,finalizeGameSource} from '../scripts/assert-game-chunk.mjs';

test('打包后的游戏分包只定义 boot，两种时序都不会提前启动',async()=>{
  const built=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','mapp/vite.config.ts'],{stdio:'inherit'});
  assert.equal(built.status,0);
  const raw=readFileSync('dist-mapp/web/chunks/game.js','utf8');
  const code=finalizeGameSource(raw);
  assertChunkShape(code);
  const result=await assertGameChunkSource(code);
  assert.equal(result.sync.booted,false);
  assert.equal(result.micro.booted,false);
  assert.equal(result.sync.boot,'function');
  assert.equal(result.micro.boot,'function');
  assert.match(result.tail,/globalThis\.DoroGame=Object\.freeze\(\{boot:/);
  assert.doesNotMatch(code,/DoroGame\.boot\s*\(/);
});
