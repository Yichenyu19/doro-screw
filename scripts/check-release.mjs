#!/usr/bin/env node
/**
 * 静态构建产物检查：默认先 npm run build，再在 390×844 与桌面打开 dist。
 * 断言：无页面异常、无控制台 error、无 404（文档与导航请求）。
 * 存档脚本：玩到一半 → 刷新 → 恢复 → 导出 → 清空 → 导入。
 * 用法：node scripts/check-release.mjs [--skip-build] [dist]
 */
import {spawn} from 'node:child_process';
import {mkdir,writeFile,stat,access} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');

const skipBuild=process.argv.includes('--skip-build');
const dist=path.resolve(process.argv.filter(a=>!a.startsWith('--'))[2]||process.env.DORO_OUTPUT||'dist');
const outDir=path.resolve(process.env.DORO_CHECK_DIR||'/tmp/doro-release-check');
const reportPath=path.join(outDir,'report.json');
const shots=path.join(outDir,'shots');

function freePort(){return new Promise((resolve,reject)=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});server.on('error',reject);});}

function run(command,args,opts={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'inherit',...opts});
    child.on('error',reject);
    child.on('close',code=>code===0?resolve():reject(Error((command+' '+args.join(' ')).trim()+' 退出码 '+code)));
  });
}

function transferTracker(page){
  const entries=[];
  const ready=page.context().newCDPSession(page).then(async session=>{
    await session.send('Network.enable');
    const pending=new Map();
    session.on('Network.requestWillBeSent',ev=>{
      if(ev.request.url.startsWith('data:'))return;
      pending.set(ev.requestId,{url:ev.request.url,method:ev.request.method});
    });
    session.on('Network.responseReceived',ev=>{
      const item=pending.get(ev.requestId);if(!item)return;
      item.status=ev.response.status;item.mime=ev.response.mimeType;
    });
    session.on('Network.loadingFinished',ev=>{
      const item=pending.get(ev.requestId);if(!item)return;
      item.encoded=ev.encodedDataLength??0;entries.push(item);pending.delete(ev.requestId);
    });
    session.on('Network.loadingFailed',ev=>{
      const item=pending.get(ev.requestId)||{url:'unknown'};
      item.failed=ev.errorText;item.encoded=item.encoded||0;entries.push(item);pending.delete(ev.requestId);
    });
  });
  return{entries,ready:()=>ready,snapshot(){const bytes=entries.reduce((n,e)=>n+(e.encoded||0),0);return{requests:entries.length,bytes,miB:+(bytes/1024/1024).toFixed(3)};}};
}

function listenPage(page){
  const consoleErrors=[],pageErrors=[],failed=[];
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  page.on('pageerror',err=>pageErrors.push(String(err.stack||err.message||err)));
  page.on('response',res=>{
    const url=res.url();
    if(res.status()>=400)failed.push({url,status:res.status()});
  });
  page.on('requestfailed',req=>{
    const url=req.url();
    if(url.startsWith('data:'))return;
    failed.push({url,status:0,error:req.failure()?.errorText||'requestfailed'});
  });
  return{consoleErrors,pageErrors,failed};
}

async function waitBoard(page){
  await page.waitForFunction(()=>!document.querySelector('#board-loading')&&!!document.querySelector('#game-canvas canvas'),{timeout:45000});
  await page.waitForFunction(()=>window.__DORO__?.engine&&window.__DORO__?.view,{timeout:15000});
}

async function clickOfficial(page,count){
  const picks=[];
  for(let i=0;i<count;i++){
    let hit=false;
    for(let tries=0;tries<40&&!hit;tries++){
      const target=await page.evaluate(()=>{
        const api=window.__DORO__,game=api.engine,witness=api.level?.witness||[];
        const next=witness.find(step=>game.state.screws.find(s=>s.id===step.screwId)?.place==='board'&&game.canPick(step.screwId));
        if(!next)return null;
        const p=api.view.getScrewScreenPosition(next.screwId);
        return p?{id:next.screwId,x:p.x,y:p.y}:null;
      });
      if(!target){await page.waitForTimeout(120);continue;}
      const before=await page.evaluate(()=>window.__DORO__.engine.state.moves);
      await page.mouse.click(target.x,target.y);
      try{await page.waitForFunction(prev=>window.__DORO__.engine.state.moves>prev,before,{timeout:4000});}catch{}
      const moves=await page.evaluate(()=>window.__DORO__.engine.state.moves);
      picks.push({id:target.id,before,moves,hit:moves>before});
      hit=moves>before;
      if(!hit)await page.waitForTimeout(150);
    }
    await page.waitForTimeout(280);
  }
  return picks;
}

async function waitSaved(page){
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-save-status]')].some(el=>el.textContent==='已保存'),{timeout:10000});
  await page.waitForTimeout(400);
}

async function clearAllStorage(page){
  await page.evaluate(async()=>{
    localStorage.clear();
    sessionStorage.clear();
    if(indexedDB.databases){
      const dbs=await indexedDB.databases();
      await Promise.all(dbs.map(db=>db.name?new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase(db.name);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);req.onblocked=()=>resolve();}):Promise.resolve()));
    }else{
      await new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase('doro-screw-reborn-v4-r2');req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);req.onblocked=()=>resolve();});
    }
  });
}

async function assertPack(distDir){
  const missing=[];
  for(const file of ['index.html','favicon.ico','og-image.jpg','campaign/r4/level-1.json','ASSETS.md','THIRD-PARTY-NOTICES.txt']){
    try{await access(path.join(distDir,file));}catch{missing.push(file);}
  }
  let hasR1=false;
  try{await access(path.join(distDir,'campaign/r1/level-1.json'));hasR1=true;}catch{}
  return{missing,hasR1};
}

async function main(){
  await mkdir(shots,{recursive:true});
  if(!skipBuild)await run(process.execPath,['scripts/build.mjs'],{env:process.env});
  const pack=await assertPack(dist);
  const port=await freePort();
  const server=spawn(process.execPath,['scripts/serve-release.mjs',dist,String(port)],{stdio:['ignore','pipe','pipe']});
  await new Promise(resolve=>{
    const timer=setTimeout(resolve,1200);
    const on=data=>{if(String(data).includes('发布预览')){clearTimeout(timer);resolve();}};
    server.stdout.on('data',on);
  });
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const views=[];
  let saveStory=null;
  for(const viewport of [
    {name:'mobile-390x844',width:390,height:844,isMobile:true,dsf:2,doSave:true},
    {name:'desktop-1280x800',width:1280,height:800,isMobile:false,dsf:1,doSave:false},
  ]){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.dsf,isMobile:viewport.isMobile,hasTouch:true,acceptDownloads:true});
    await context.addInitScript(()=>{
      try{
        if(!sessionStorage.getItem('doro-check-ready')){
          localStorage.clear();
          sessionStorage.setItem('doro-check-ready','1');
        }
      }catch{}
    });
    const page=await context.newPage();
    const logs=listenPage(page);
    const tracker=transferTracker(page);
    await tracker.ready();
    const t0=Date.now();
    await page.goto(`http://127.0.0.1:${port}/?check=1`,{waitUntil:'networkidle',timeout:60000});
    await page.waitForSelector('text=Doro · 打个螺丝 · 修订3',{timeout:20000});
    await page.waitForTimeout(300);
    const homeMs=Date.now()-t0;
    const firstScreen=tracker.snapshot();
    await page.screenshot({path:path.join(shots,viewport.name+'-home.png'),fullPage:true});
    const mark=tracker.entries.length;
    const t1=Date.now();
    await page.click('[data-action="start"]');
    await waitBoard(page);
    const enterMs=Date.now()-t1;
    await page.waitForTimeout(500);
    const all=tracker.snapshot();
    const extra=tracker.entries.slice(mark);
    const levelEntry={requests:extra.length,bytes:extra.reduce((n,e)=>n+(e.encoded||0),0)};
    levelEntry.miB=+(levelEntry.bytes/1024/1024).toFixed(3);
    await page.screenshot({path:path.join(shots,viewport.name+'-level.png'),fullPage:true});
    if(viewport.doSave){
      const picks=await clickOfficial(page,6);
      await waitSaved(page);
      const before=await page.evaluate(()=>({moves:window.__DORO__.engine.state.moves,phase:window.__DORO__.engine.state.phase,levelId:window.__DORO__.engine.state.levelId,runId:window.__DORO__.engine.state.runId}));
      if(before.moves<3)throw Error('未能玩到一半，只走到 '+before.moves+' 步');
      await page.reload({waitUntil:'networkidle'});
      await page.waitForSelector('[data-action="continue"]',{timeout:20000});
      const restoredHome=await page.locator('.continue-note').textContent();
      await page.click('[data-action="continue"]');
      await waitBoard(page);
      const afterReload=await page.evaluate(()=>({moves:window.__DORO__.engine.state.moves,phase:window.__DORO__.engine.state.phase,levelId:window.__DORO__.engine.state.levelId,runId:window.__DORO__.engine.state.runId}));
      await page.click('[data-action="save-status"]');
      const [download]=await Promise.all([
        page.waitForEvent('download',{timeout:15000}),
        page.click('[data-action="export-save"]'),
      ]);
      const exported=path.join(shots,'Doro-V4-恢复记录-check.json');
      await download.saveAs(exported);
      await page.keyboard.press('Escape').catch(()=>{});
      await page.click('[data-action="close-modal"]').catch(()=>{});
      await clearAllStorage(page);
      await page.reload({waitUntil:'networkidle'});
      await page.waitForSelector('[data-action="start"]',{timeout:20000});
      const cleared=await page.evaluate(()=>({progress:document.querySelector('.home-footer')?.textContent||'',hasContinue:!!document.querySelector('[data-action="continue"]')}));
      await page.click('[data-action="save-status"]');
      const chooserPromise=page.waitForEvent('filechooser');
      await page.click('[data-action="import-save"]');
      const chooser=await chooserPromise;
      await chooser.setFiles(exported);
      await page.waitForSelector('[data-action="continue"]',{timeout:20000});
      await page.click('[data-action="continue"]');
      await waitBoard(page);
      const afterImport=await page.evaluate(()=>({moves:window.__DORO__.engine.state.moves,phase:window.__DORO__.engine.state.phase,levelId:window.__DORO__.engine.state.levelId,runId:window.__DORO__.engine.state.runId}));
      saveStory={picks,before,restoredHome,afterReload,exported,cleared,afterImport};
    }
    views.push({
      name:viewport.name,homeMs,enterMs,firstScreen,levelEntry,throughLevel:all,
      consoleErrors:[...logs.consoleErrors],pageErrors:[...logs.pageErrors],failed:[...logs.failed],
    });
    await context.close();
  }
  await browser.close();
  server.kill('SIGTERM');

  const problems=[];
  if(pack.missing.length)problems.push('构建缺文件：'+pack.missing.join(', '));
  if(pack.hasR1)problems.push('生产包仍含 campaign/r1');
  for(const view of views){
    if(view.pageErrors.length)problems.push(view.name+' 页面异常：'+view.pageErrors.join(' | '));
    if(view.consoleErrors.length)problems.push(view.name+' 控制台错误：'+view.consoleErrors.join(' | '));
    const realFailed=view.failed.filter(item=>item.status>=400||item.status===0);
    if(realFailed.length)problems.push(view.name+' 资源失败：'+JSON.stringify(realFailed));
  }
  if(saveStory){
    if(saveStory.afterReload.moves!==saveStory.before.moves||saveStory.afterReload.runId!==saveStory.before.runId){
      problems.push('刷新后未恢复到同一局：'+JSON.stringify({before:saveStory.before,after:saveStory.afterReload}));
    }
    if(saveStory.afterImport.moves!==saveStory.before.moves||saveStory.afterImport.runId!==saveStory.before.runId){
      problems.push('导入后未恢复到同一局：'+JSON.stringify({before:saveStory.before,after:saveStory.afterImport}));
    }
    if(saveStory.cleared.hasContinue)problems.push('清空后仍出现继续按钮');
  }else problems.push('未执行存档恢复脚本');

  const report={ok:problems.length===0,dist,port,pack,views,saveStory,problems,method:'首屏/进关体积来自 CDP Network.loadingFinished.encodedDataLength。存档脚本：官方线点满约 6 颗 → 刷新点继续 → 导出恢复记录 → 清空 localStorage 与 IndexedDB → 导入同一文件再继续。'};
  await writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:report.ok,firstScreen:Object.fromEntries(views.map(v=>[v.name,v.firstScreen])),levelEntry:Object.fromEntries(views.map(v=>[v.name,{...v.levelEntry,enterMs:v.enterMs,homeMs:v.homeMs}])),save:saveStory&&{moves:saveStory.before.moves,reload:saveStory.afterReload.moves,imported:saveStory.afterImport.moves},problems},null,2));
  if(problems.length){console.error(problems.join('\n'));process.exit(1);}
}

main().catch(error=>{console.error(error);process.exit(1);});
