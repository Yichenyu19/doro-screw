import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getContentLevel} from '../src/content';
import {CAMPAIGN_TITLES,CAMPAIGN_COUNT} from '../src/r2-catalog';
import {CONTENT_REVISION} from '../src/run';
const revision=CONTENT_REVISION,dir=`public/campaign/r${revision}`;
await mkdir(dir,{recursive:true});
const files=[];
for(let id=1;id<=CAMPAIGN_COUNT;id++){
 const level=await getContentLevel(id,0,'v4','campaign',revision),text=JSON.stringify(level)+'\n',file=`level-${id}.json`;
 await writeFile(`${dir}/`+file,text,'utf8');files.push({id,file,pins:level.boards.reduce((n,b)=>n+b.screws.length,0),seed:level.seed,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex'),design:CAMPAIGN_TITLES[id-1],difficulty:level.difficulty});
}
await writeFile(`${dir}/manifest.json`,JSON.stringify({contentVersion:'v4',contentRevision:revision,mode:'campaign',files},null,2)+'\n','utf8');console.log(JSON.stringify({revision,files:files.length,totalPins:files.reduce((n,f)=>n+f.pins,0),bytes:files.reduce((n,f)=>n+f.bytes,0)}));
