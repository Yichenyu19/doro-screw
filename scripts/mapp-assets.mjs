import {readFile} from 'node:fs/promises';

/** 微应用包运行素材：与网站瘦身包相同，但不含画册高清原图、R1 关卡、站点图标与分享图。 */
export async function listMappRuntimeFiles(root='.'){
  const manifest=JSON.parse(await readFile(new URL('../src/runtime-art.json',import.meta.url),'utf8'));
  const phaserAtlases=new Set(['heads','assistHeads','screws','fx','plates','plateExtra']);
  const individualSheets=new Set(['doro','ui','button','panel','boxes','cases','paintPeg','heads','assistHeads','fx','screws','plateA','plateB','plateC']);
  const files=new Set([...Object.values(manifest.hero),'runtime/starter-sticker-v4.webp']);
  for(const [name,value] of Object.entries(manifest.raw)){
    if(String(name).endsWith(':hd')||String(value).includes('-hd.'))continue;
    files.add(value);
  }
  for(const [kind,sheet] of Object.entries(manifest.sheets)){
    if(phaserAtlases.has(kind))files.add(sheet.file);
    if(individualSheets.has(kind))for(const sprite of sheet.sprites)files.add(sprite.file);
  }
  return [...files].sort();
}

export function campaignFiles(revision=3,count=10){
  return Array.from({length:count},(_,i)=>`campaign/r${revision}/level-${i+1}.json`);
}
