import {readFile,mkdir,copyFile,stat,cp} from 'node:fs/promises';
import path from 'node:path';
const manifest=JSON.parse(await readFile('src/runtime-art.json','utf8')),files=new Set([...Object.values(manifest.raw),...Object.values(manifest.hero),'runtime/starter-sticker-v4.webp']),out=process.env.DORO_OUTPUT||'dist';
for(const sheet of Object.values(manifest.sheets)){files.add(sheet.file);for(const sprite of sheet.sprites)files.add(sprite.file);}
await mkdir(path.join(out,'runtime'),{recursive:true});
for(const file of files)await copyFile(path.join('public',file),path.join(out,file));
await cp('public/campaign',path.join(out,'campaign'),{recursive:true});
await copyFile('docs/THIRD-PARTY-NOTICES.txt',path.join(out,'THIRD-PARTY-NOTICES.txt'));
let bytes=0;for(const file of files)bytes+=(await stat(path.join(out,file))).size;
console.log(`V4运行时素材 ${files.size} 个文件，${(bytes/1024/1024).toFixed(2)} MiB；已附固定战役，原图在源码素材包中保留。`);
