import {readFile,mkdir,copyFile,stat,cp,readdir} from 'node:fs/promises';
import path from 'node:path';

const manifest=JSON.parse(await readFile('src/runtime-art.json','utf8'));
const out=process.env.DORO_OUTPUT||'dist';

// Phaser 修订3 用图集；DOM 首页/托盘/画册用单帧。旧版进行中的盘面仍要 plates / plateExtra 图集。
const phaserAtlases=new Set(['heads','assistHeads','screws','fx','plates','plateExtra']);
const individualSheets=new Set(['doro','ui','button','panel','boxes','cases','paintPeg','heads','assistHeads','fx','screws','plateA','plateB','plateC']);
const deferred=new Set();
const files=new Set([...Object.values(manifest.raw),...Object.values(manifest.hero),'runtime/starter-sticker-v4.webp']);
for(const [name,value] of Object.entries(manifest.raw)){
  if(String(name).endsWith(':hd')||String(value).includes('-hd.'))deferred.add(value);
}
for(const [kind,sheet] of Object.entries(manifest.sheets)){
  if(phaserAtlases.has(kind))files.add(sheet.file);
  if(individualSheets.has(kind))for(const sprite of sheet.sprites)files.add(sprite.file);
}

const siteFiles=['favicon.ico','favicon-32.png','favicon-192.png','apple-touch-icon.png','og-image.jpg'];
await mkdir(path.join(out,'runtime'),{recursive:true});
for(const file of files){
  await mkdir(path.dirname(path.join(out,file)),{recursive:true});
  await copyFile(path.join('public',file),path.join(out,file));
}
for(const file of siteFiles){
  await copyFile(path.join('public',file),path.join(out,file));
}
// 生产包只带当前修订战役 JSON；R1 三十关仍在源码与测试中，不打进静态包。
await mkdir(path.join(out,'campaign'),{recursive:true});
for(const revision of ['r2','r3']){
  await cp(path.join('public/campaign',revision),path.join(out,'campaign',revision),{recursive:true});
}
await copyFile('docs/THIRD-PARTY-NOTICES.txt',path.join(out,'THIRD-PARTY-NOTICES.txt'));
await copyFile('ASSETS.md',path.join(out,'ASSETS.md'));

async function dirBytes(dir){
  let bytes=0,count=0;
  for(const entry of await readdir(dir,{withFileTypes:true,recursive:true})){
    if(!entry.isFile())continue;
    bytes+=(await stat(path.join(entry.parentPath??entry.path,entry.name))).size;
    count++;
  }
  return {bytes,count};
}
let runtimeBytes=0;
for(const file of files)runtimeBytes+=(await stat(path.join(out,file))).size;
const hdBytes=[...deferred].reduce((n,file)=>n+(files.has(file)?0:0),0)+[...files].filter(f=>deferred.has(f)).reduce((n,f)=>n,0);
let hd=0;
for(const file of files)if(deferred.has(file))hd+=(await stat(path.join(out,file))).size;
const campaign=await dirBytes(path.join(out,'campaign'));
const whole=await dirBytes(out);
const fmt=n=>(n/1024/1024).toFixed(2);
console.log(`V4运行时素材 ${files.size} 个文件，${fmt(runtimeBytes)} MiB（其中画册高清按需 ${fmt(hd)} MiB，不计入首屏）。战役 JSON ${campaign.count} 个文件 ${fmt(campaign.bytes)} MiB（不含 r1）。整包 ${whole.count} 个文件 ${fmt(whole.bytes)} MiB。原图在源码素材包中保留。`);
