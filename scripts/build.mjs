import {spawn} from 'node:child_process';
import {rm} from 'node:fs/promises';

const mode=process.argv.includes('--verification')?'verification':'production';
const out=process.env.DORO_OUTPUT||'dist';
await rm(out,{recursive:true,force:true});

const commands=[['--import','tsx','scripts/compile-campaign-v4.ts'],['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build','--mode',mode],['scripts/copy-release-assets.mjs']];
for(const args of commands){const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',windowsHide:true,shell:false});child.on('error',reject);child.on('close',resolve);});if(code!==0){process.exitCode=Number(code)||1;break;}}
