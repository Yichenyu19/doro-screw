import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';

const pattern=/innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment|parseFromString|setHTMLUnsafe|\beval\s*\(|new Function|style="/;

export async function assertNoSinks(dir){
  const files=[];
  const app=path.join(dir,'app.js');
  files.push(app);
  const chunkDir=path.join(dir,'chunks');
  try{
    for(const name of await readdir(chunkDir))if(name.endsWith('.js'))files.push(path.join(chunkDir,name));
  }catch{ /* 还没有分包时只检查入口。 */ }
  const problems=[];
  for(const file of files){
    const text=await readFile(file,'utf8');
    if(pattern.test(text)){
      const hit=text.match(pattern)?.[0]||'';
      problems.push(path.relative(dir,file)+' 含受禁写入：'+hit);
    }
  }
  if(problems.length)throw Error(problems.join('\n'));
}

async function walk(dir,out=[]){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())await walk(full,out);
    else if(/\.(?:ts|js|mjs)$/.test(entry.name))out.push(full);
  }
  return out;
}

export async function assertSourceClean(root='src'){
  const problems=[];
  for(const file of await walk(root)){
    const text=await readFile(file,'utf8');
    if(pattern.test(text))problems.push(path.relative(root,file)+' 含受禁写入：'+(text.match(pattern)?.[0]||''));
  }
  if(problems.length)throw Error(problems.join('\n'));
}
