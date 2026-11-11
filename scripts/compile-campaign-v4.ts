import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getContentLevel} from '../src/content';
import {R2_TITLES} from '../src/r2-catalog';
await mkdir('public/campaign/r2',{recursive:true});
const files=[];
for(let id=1;id<=8;id++){
 const level=await getContentLevel(id,0,'v4','campaign',2),text=JSON.stringify(level)+'\n',file=`level-${id}.json`;
 await writeFile('public/campaign/r2/'+file,text,'utf8');files.push({id,file,pins:level.boards.reduce((n,b)=>n+b.screws.length,0),seed:level.seed,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex'),design:R2_TITLES[id-1],difficulty:level.difficulty});
}
await writeFile('public/campaign/r2/manifest.json',JSON.stringify({contentVersion:'v4',contentRevision:2,mode:'campaign',files},null,2)+'\n','utf8');console.log(JSON.stringify({files:files.length,totalPins:files.reduce((n,f)=>n+f.pins,0),bytes:files.reduce((n,f)=>n+f.bytes,0)}));
