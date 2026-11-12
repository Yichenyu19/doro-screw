import {mkdir,copyFile,readFile,writeFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pack} from '@discourse-mini-app/sdk/pack';
import {listMappRuntimeFiles,listMappAlbumHdFiles,listMappSfxFiles,isAlbumWorkingFile} from './mapp-assets.mjs';
import {assertNoSinks} from './assert-no-sinks.mjs';
import {finalizeGameSource,assertPackedApp} from './assert-game-chunk.mjs';

function compressPlan(file){
  const base=path.basename(file);
  if(!base.endsWith('.webp'))return null;
  if(/-hd\.[0-9a-f]+\.webp$/.test(base))return {quality:70,scale:'960:960'};
  if(/^album-\d+-thumb\.[0-9a-f]+\.webp$/.test(base))return {quality:70,scale:'160:160'};
  if(/^album-\d+\.[0-9a-f]+\.webp$/.test(base))return {quality:68};
  if(/^plate[ABC]-/.test(base))return {quality:82};
  if(/atlas/.test(base)||/^(screws|heads|fx|assistHeads)-/.test(base))return {quality:80};
  return {quality:72};
}

async function placeAsset(file){
  const from=path.join(root,'public',file);
  const to=path.join(web,file);
  await mkdir(path.dirname(to),{recursive:true});
  const plan=compressPlan(file);
  if(!plan){await copyFile(from,to);return;}
  const args=['-y','-hide_banner','-loglevel','error','-i',from,'-c:v','libwebp','-compression_level','6','-quality',String(plan.quality)];
  if(plan.scale)args.push('-vf',`scale=${plan.scale}:flags=lanczos`);
  args.push(to);
  const result=spawnSync('ffmpeg',args,{encoding:'utf8'});
  if(result.status!==0)throw Error('压缩失败 '+file+'\n'+(result.stderr||result.error?.message||''));
}

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
const extra=['asset-list.json'];
// 关卡已经打进 app.js。微应用里 usePack 为假，不再把 campaign JSON 打进 ZIP。
const startup=runtime.filter(file=>!isAlbumWorkingFile(file));
const assets=[...runtime,...albumHd,...sfx,...extra];
await writeFile(path.join(web,'asset-list.json'),JSON.stringify(startup,null,0));
for(const file of [...runtime,...albumHd])await placeAsset(file);
for(const file of sfx){
  const to=path.join(web,file);
  await mkdir(path.dirname(to),{recursive:true});
  await copyFile(path.join(root,'public',file),to);
}

manifest.permissions=(manifest.permissions||[]).filter(item=>item!=='code.load');
delete manifest.code;
manifest.assets=assets;
const appPath=path.join(web,'app.js');
let appJs=await readFile(appPath,'utf8');
const rewritten=finalizeGameSource(appJs);
await writeFile(appPath,rewritten);
const appCheck=await assertPackedApp(rewritten,manifest);
console.log('packed app',JSON.stringify(appCheck));
const files={};
for(const name of ['index.html','app.js','app.css','strings.json',...assets]){
  files[name]=await readFile(path.join(web,name));
}
await assertNoSinks(web);
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
const hardLimit=4096*1024;
if(result.size>=hardLimit)throw Error(`app.zip ${result.size} 字节，达到或超过沙箱上限 ${hardLimit} 字节。`);
await writeFile(path.join(out,'BUILD.json'),JSON.stringify(info,null,2));
console.log(`Created ${result.file} (${result.size} bytes), SHA-256 ${sha}, app ${manifest.id}, version ${manifest.version}${info.placeholderId?'；清单 ID 仍是占位符，提审前须换成应用页分配的 ID。':''}`);
