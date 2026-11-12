import {mkdir,copyFile,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pack} from '@discourse-mini-app/sdk/pack';
import {listMappRuntimeFiles,listMappAlbumHdFiles,listMappSfxFiles,campaignFiles} from './mapp-assets.mjs';

const root=process.cwd();
const web=path.join(root,'dist-mapp/web');
const out=path.join(root,'dist-mapp/package');
const manifest=JSON.parse(await readFile(path.join(root,'mapp/manifest.json'),'utf8'));
manifest.id=process.env.MINI_APP_ID||manifest.id;
manifest.version=process.env.MINI_APP_VERSION||manifest.version;

await copyFile(path.join(root,'mapp/template.html'),path.join(web,'index.html'));
await copyFile(path.join(root,'mapp/strings.json'),path.join(web,'strings.json'));

const runtime=await listMappRuntimeFiles();
const albumHd=await listMappAlbumHdFiles();
const sfx=await listMappSfxFiles();
const campaign=campaignFiles(4,8);
const extra=['asset-list.json'];
const assets=[...runtime,...albumHd,...sfx,...campaign,...extra];
await writeFile(path.join(web,'asset-list.json'),JSON.stringify(runtime,null,0));
for(const file of [...runtime,...albumHd]){
  const from=path.join(root,'public',file);
  const to=path.join(web,file);
  await mkdir(path.dirname(to),{recursive:true});
  await copyFile(from,to);
}
for(const file of [...sfx,...campaign]){
  const to=path.join(web,file);
  await mkdir(path.dirname(to),{recursive:true});
  await copyFile(path.join(root,'public',file),to);
}

manifest.assets=assets;
const appJsPath=path.join(web,'app.js');
let appJs=await readFile(appJsPath,'utf8');
const rewritten=appJs
  .replaceAll('new Function("return this")()','globalThis')
  .replaceAll('https://phaser.io','');
if(rewritten===appJs)throw Error('没有找到需要去掉的运行时求值或默认外链，打包中止。');
if(/\beval\s*\(|new Function\b/.test(rewritten))throw Error('app.js 仍含 eval 或 new Function。');
await writeFile(appJsPath,rewritten);
const files={};
for(const name of ['index.html','app.js','app.css','strings.json',...assets]){
  files[name]=await readFile(path.join(web,name));
}
const result=await pack({manifest,files,outputDirectory:out});
const sha=result.zipSha256||createHash('sha256').update(await readFile(result.file)).digest('hex');
const info={
  file:result.file,
  size:result.size,
  zipSha256:sha,
  id:manifest.id,
  version:manifest.version,
  assets:assets.length,
  placeholderId:manifest.id==='019a0d0d-0000-7000-8000-00000000d0d0',
};
await writeFile(path.join(out,'BUILD.json'),JSON.stringify(info,null,2));
console.log(`Created ${result.file} (${result.size} bytes), SHA-256 ${sha}, app ${manifest.id}, version ${manifest.version}${info.placeholderId?'；清单 ID 仍是占位符，提审前须换成应用页分配的 ID。':''}`);
