import {readFile} from 'node:fs/promises';

/** 微应用包运行素材：与网站瘦身包相同，但不含 R1 关卡、站点图标与分享图。画册高清图另列，不在启动时预读。 */
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

/** 画册高清图打进包，但启动时不预读，点开再取。 */
export async function listMappAlbumHdFiles(){
  const manifest=JSON.parse(await readFile(new URL('../src/runtime-art.json',import.meta.url),'utf8'));
  return Object.entries(manifest.raw).filter(([name])=>name.endsWith(':hd')).map(([,value])=>value).sort();
}

export function campaignFiles(revision=4,count=8){
  return Array.from({length:count},(_,i)=>`campaign/r${revision}/level-${i+1}.json`);
}

export async function listMappSfxFiles(root='.'){
  const {readdir}=await import('node:fs/promises');
  const {join}=await import('node:path');
  const dir=join(root,'public/sfx');
  const names=(await readdir(dir)).filter(name=>name.endsWith('.ogg')).sort();
  return names.map(name=>'sfx/'+name);
}
