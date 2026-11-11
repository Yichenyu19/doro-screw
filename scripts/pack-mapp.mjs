import {mkdir,copyFile,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pack} from '@discourse-mini-app/sdk/pack';
import {listMappRuntimeFiles,campaignFiles} from './mapp-assets.mjs';

const root=process.cwd();
const web=path.join(root,'dist-mapp/web');
const out=path.join(root,'dist-mapp/package');
const manifest=JSON.parse(await readFile(path.join(root,'mapp/manifest.json'),'utf8'));
manifest.id=process.env.MINI_APP_ID||manifest.id;
manifest.version=process.env.MINI_APP_VERSION||manifest.version;

await copyFile(path.join(root,'mapp/template.html'),path.join(web,'index.html'));
await copyFile(path.join(root,'mapp/strings.json'),path.join(web,'strings.json'));

const runtime=await listMappRuntimeFiles();
const campaign=campaignFiles(3,10);
const extra=['asset-list.json'];
const assets=[...runtime,...campaign,...extra];
await writeFile(path.join(web,'asset-list.json'),JSON.stringify(runtime,null,0));
for(const file of runtime){
  const from=path.join(root,'public',file);
  const to=path.join(web,file);
  await mkdir(path.dirname(to),{recursive:true});
  await copyFile(from,to);
}
for(const file of campaign){
  const to=path.join(web,file);
  await mkdir(path.dirname(to),{recursive:true});
  await copyFile(path.join(root,'public',file),to);
}

manifest.assets=assets;
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
