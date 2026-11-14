import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';

const SFX=['pick','loosen','arrive-0','arrive-1','arrive-2','box','refill','fall','reveal','tool','blocked','chain','win','wall','undo','ui','album','full'];

test('发行复制脚本带修订4战役和音效，构建会先清空 dist',()=>{
  const copy=readFileSync('scripts/copy-release-assets.mjs','utf8');
  const build=readFileSync('scripts/build.mjs','utf8');
  const check=readFileSync('scripts/check-release.mjs','utf8');
  assert.match(copy,/\['r2',\s*'r4'\]/);
  assert.doesNotMatch(copy,/\['r2',\s*'r3'\]/);
  assert.match(copy,/public['",\s]+sfx|join\('public','sfx'\)|public\/sfx/);
  assert.match(copy,/join\(out,\s*'sfx'\)|join\(out,"sfx"\)/);
  assert.match(build,/\brm\b/);
  assert.match(build,/recursive:\s*true/);
  assert.match(check,/Doro · 打个螺丝 · 修订4/);
  assert.doesNotMatch(check,/Doro · 打个螺丝 · 修订3/);
  assert.match(check,/campaign\/r4\//);
  assert.match(check,/campaign\/r3/);
  assert.match(check,/sfx\/.*\.ogg/);
  assert.match(check,/R4_FILES/);
  assert.match(check,/SFX_FILES/);
});

test('源码里的十八个短音效都在 public/sfx，可见名称已统一为修订4',()=>{
  for(const name of SFX){
    assert.equal(existsSync(path.join('public/sfx',name+'.ogg')),true,name+' 缺失');
  }
  assert.equal(readdirSync('public/campaign/r4').filter(name=>name.startsWith('level-')&&name.endsWith('.json')).length,8);
  assert.equal(existsSync('public/campaign/r3/level-1.json'),false);
  const visible=[
    readFileSync('package.json','utf8'),
    readFileSync('index.html','utf8'),
    readFileSync('README.md','utf8'),
    readFileSync('docs/THIRD-PARTY-NOTICES.txt','utf8'),
  ].join('\n');
  assert.match(visible,/Doro · 打个螺丝 · 修订4/);
  assert.doesNotMatch(visible,/Doro · 打个螺丝 · 修订3/);
  assert.doesNotMatch(readFileSync('index.html','utf8'),/修订3 主线十关/);
});

test('微应用打包带音效，关卡留在脚本里，不把战役 JSON 或修订3再打一遍',()=>{
  if(!existsSync('scripts/pack-mapp.mjs'))return;
  const pack=readFileSync('scripts/pack-mapp.mjs','utf8');
  const assets=existsSync('scripts/mapp-assets.mjs')?readFileSync('scripts/mapp-assets.mjs','utf8'):'';
  assert.doesNotMatch(pack,/campaignFiles\(/);
  assert.doesNotMatch(pack,/campaign\/r3/);
  assert.match(pack+assets,/sfx/);
  assert.match(pack,/libwebp/);
  assert.match(pack,/960:960/);
});
