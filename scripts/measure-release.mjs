#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');

const dist=path.resolve(process.argv[2]||process.env.DORO_OUTPUT||'dist');
const port=Number(process.argv[3]||4175);
const out=process.argv[4]||process.env.DORO_MEASURE_OUT||path.resolve('/tmp/doro-release-check/measure.json');

export function transferTracker(page){
  const entries=[];
  const sessionPromise=page.context().newCDPSession(page).then(async session=>{
    await session.send('Network.enable');
    const pending=new Map();
    session.on('Network.requestWillBeSent',ev=>{
      if(ev.request.url.startsWith('data:'))return;
      pending.set(ev.requestId,{url:ev.request.url,method:ev.request.method,start:ev.timestamp});
    });
    session.on('Network.responseReceived',ev=>{
      const item=pending.get(ev.requestId);if(!item)return;
      item.status=ev.response.status;
      item.mime=ev.response.mimeType;
    });
    session.on('Network.loadingFinished',ev=>{
      const item=pending.get(ev.requestId);if(!item)return;
      item.encoded=ev.encodedDataLength??0;
      item.done=true;
      entries.push(item);
      pending.delete(ev.requestId);
    });
    session.on('Network.loadingFailed',ev=>{
      const item=pending.get(ev.requestId);if(!item)return;
      item.failed=ev.errorText;item.done=true;entries.push(item);pending.delete(ev.requestId);
    });
    return session;
  });
  return{
    entries,
    ready:()=>sessionPromise,
    snapshot(){
      const bytes=entries.reduce((n,e)=>n+(e.encoded||0),0);
      return{requests:entries.length,bytes,miB:+(bytes/1024/1024).toFixed(3),files:entries.map(e=>({url:e.url,status:e.status,bytes:e.encoded||0,failed:e.failed||null}))};
    },
  };
}

export function classify(url){
  try{const u=new URL(url);return u.pathname+u.search;}catch{return url;}
}

export async function measureFirstScreenAndLevel(page,base){
  const tracker=transferTracker(page);
  await tracker.ready();
  const t0=Date.now();
  await page.goto(base,{waitUntil:'networkidle',timeout:60000});
  await page.waitForSelector('[data-action="start"],[data-action="continue"]',{timeout:20000});
  const homeMs=Date.now()-t0;
  await page.waitForTimeout(400);
  const home=tracker.snapshot();
  const mark=tracker.entries.length;
  const t1=Date.now();
  await page.click('[data-action="start"],[data-action="continue"]');
  await page.waitForFunction(()=>!document.querySelector('#board-loading')&&document.querySelector('#game-canvas canvas, #game-canvas canvas, .game-canvas canvas, #game-canvas'),{timeout:45000});
  await page.waitForTimeout(600);
  const enterMs=Date.now()-t1;
  const all=tracker.snapshot();
  const extraEntries=tracker.entries.slice(mark);
  const extraBytes=extraEntries.reduce((n,e)=>n+(e.encoded||0),0);
  return{
    homeMs,enterMs,
    firstScreen:home,
    levelEntry:{requests:extraEntries.length,bytes:extraBytes,miB:+(extraBytes/1024/1024).toFixed(3),files:extraEntries.map(e=>({url:e.url,status:e.status,bytes:e.encoded||0}))},
    throughLevel:{requests:all.requests,bytes:all.bytes,miB:all.miB},
  };
}

async function main(){
  const server=spawn(process.execPath,['scripts/serve-release.mjs',dist,String(port)],{stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    const on=data=>{if(String(data).includes('发布预览')){resolve();}};
    server.stdout.on('data',on);server.stderr.on('data',d=>process.stderr.write(d));
    server.on('exit',code=>reject(Error('preview exited '+code)));
    setTimeout(()=>resolve(),1500);
  });
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const results={};
  for(const viewport of [{name:'mobile-390x844',width:390,height:844,isMobile:true},{name:'desktop-1280x800',width:1280,height:800,isMobile:false}]){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.isMobile?2:1,isMobile:viewport.isMobile,hasTouch:viewport.isMobile});
    const page=await context.newPage();
    results[viewport.name]=await measureFirstScreenAndLevel(page,`http://127.0.0.1:${port}/`);
    await context.close();
  }
  await browser.close();
  server.kill('SIGTERM');
  const report={dist,port,method:'Playwright + CDP Network.loadingFinished.encodedDataLength；首屏=打开首页至 networkidle 且开始按钮可见后的累计传输；进关=点击开始至 #board-loading 消失后再缓冲 600ms 的新增传输与耗时。',results};
  await mkdir(path.dirname(out),{recursive:true});
  await writeFile(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error(error);process.exit(1);});
}
