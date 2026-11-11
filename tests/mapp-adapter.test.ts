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

test('微应用清单占位 ID 符合官方 UUID v7 校验，提审前必须替换',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../mapp/manifest.json',import.meta.url),'utf8'));
  assert.match(manifest.id,/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(manifest.id,'019a0d0d-0000-7000-8000-00000000d0d0');
  assert.match(manifest.version,/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
  assert.deepEqual(manifest.permissions,['theme.read','storage.read','storage.write','audio.webAudio','files.save']);
  assert.equal(manifest.entry,'index.html');
  assert.ok(!manifest.permissions.includes('links.open'));
  assert.ok(!manifest.permissions.includes('clipboard.write'));
  assert.ok(!manifest.endpoints);
  assert.ok(!manifest.remote_assets);
});
