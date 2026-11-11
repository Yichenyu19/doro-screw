import {spawn} from 'node:child_process';
import {rm} from 'node:fs/promises';
const debug=process.env.MINI_APP_DEBUG==='1';
await rm('dist-mapp',{recursive:true,force:true});
const commands=[
  ['node_modules/typescript/bin/tsc','--noEmit'],
  ['node_modules/vite/bin/vite.js','build','--config','mapp/vite.config.ts'],
  ['scripts/pack-mapp.mjs'],
];
for(const args of commands){
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{stdio:'inherit',windowsHide:true,env:{...process.env,MINI_APP_DEBUG:debug?'1':(process.env.MINI_APP_DEBUG||'')}});
    child.on('error',reject);
    child.on('close',resolve);
  });
  if(code!==0){process.exitCode=Number(code)||1;break;}
}
