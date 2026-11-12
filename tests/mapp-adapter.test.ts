import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assetUrl,resolvedAssetPath,setAssetResolver} from '../src/art';

test('网站版默认仍用运行路径，微应用注入解析器后才改走 Blob',()=>{
  setAssetResolver(null);
  assert.match(assetUrl('logo.png'),/runtime\/logo/);
  assert.equal(resolvedAssetPath('logo.png').startsWith('runtime/'),true);
  setAssetResolver(path=>path==='runtime/example.webp'?'blob:mock':'');
  assert.equal(assetUrl('runtime/example.webp'),'blob:mock');
  assert.equal(assetUrl('album-1.png','hd'),'');
  setAssetResolver(null);
  assert.match(assetUrl('logo.png'),/runtime\/logo/);
});

test('微应用清单使用应用页分配的 UUID v7',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../mapp/manifest.json',import.meta.url),'utf8'));
  assert.match(manifest.id,/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(manifest.id,'01a1cddd-b6e3-70d1-8132-f37aceee7d9c');
  assert.match(manifest.version,/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
  assert.deepEqual(manifest.permissions,['theme.read','storage.read','storage.write','audio.webAudio','files.save','code.load']);
  assert.deepEqual(manifest.code,{scripts:['chunks/game.js']});
  assert.equal(manifest.version,'1.0.4');
  assert.equal(manifest.entry,'index.html');
  assert.ok(!manifest.permissions.includes('links.open'));
  assert.ok(!manifest.permissions.includes('clipboard.write'));
  assert.ok(!manifest.endpoints);
  assert.ok(!manifest.remote_assets);
});
