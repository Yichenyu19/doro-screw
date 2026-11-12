#!/usr/bin/env node
/**
 * 在 390×844 用本地 SDK mock 验收微应用构建。
 * 这不是 Linux DO 官方沙箱；官方文档要求真实 SDK 上传 /apps-sandbox。
 */
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {assemblePreview,servePreview} from './serve-mapp-preview.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const outDir=path.resolve(process.env.DORO_MAPP_CHECK_DIR||'/tmp/doro-mapp-check');
const skipBuild=process.argv.includes('--skip-build');

function freePort(){return new Promise((resolve,reject)=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});s.on('error',reject);});}
function run(cmd,args){const r=spawnSync(cmd,args,{stdio:'inherit',env:process.env});if(r.status!==0)throw Error((cmd+' '+args.join(' ')).trim()+' 退出码 '+r.status);}

async function waitBoard(page){
  await page.waitForFunction(()=>!document.querySelector('#board-loading')&&!!document.querySelector('#game-canvas canvas')&&window.__DORO__?.engine&&window.__DORO__?.view,{timeout:45000});
}
async function clickOfficial(page,count){
  const picks=[];
  for(let i=0;i<count;i++){
    let hit=false;
    for(let tries=0;tries<50&&!hit;tries++){
      const target=await page.evaluate(()=>{
        const api=window.__DORO__,game=api.engine,witness=api.level?.witness||[];
        const next=witness.find(step=>game.state.screws.find(s=>s.id===step.screwId)?.place==='board'&&game.canPick(step.screwId));
        if(!next)return null;
        const p=api.view.getScrewScreenPosition(next.screwId);
        return p?{id:next.screwId,x:p.x,y:p.y}:null;
      });
      if(!target){await page.waitForTimeout(140);continue;}
      const before=await page.evaluate(()=>window.__DORO__.engine.state.moves);
      await page.mouse.click(target.x,target.y);
      try{await page.waitForFunction(prev=>window.__DORO__.engine.state.moves>prev,before,{timeout:5000});}catch{}
      const after=await page.evaluate(()=>({moves:window.__DORO__.engine.state.moves,phase:window.__DORO__.engine.state.phase}));
      picks.push({id:target.id,before,...after,hit:after.moves>before});
      hit=after.moves>before;
      if(!hit)await page.waitForTimeout(160);
    }
    await page.waitForTimeout(260);
  }
  return picks;
}

async function main(){
  await mkdir(outDir,{recursive:true});
  if(!skipBuild)run(process.execPath,['scripts/build-mapp.mjs']);
  const preview=await assemblePreview();
  const port=await freePort();
  const server=await servePreview(preview,port);
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
    recordVideo:{dir:outDir,size:{width:390,height:844}},
  });
  const page=await context.newPage();
  const consoleErrors=[],pageErrors=[],failed=[];
  const ignoreUrl=url=>/\/(?:favicon\.ico|apple-touch-icon[^/]*\.png)$/i.test(url||'');
  page.on('console',msg=>{
    if(msg.type()!=='error')return;
    const loc=msg.location()?.url||'';
    if(ignoreUrl(loc))return;
    consoleErrors.push(msg.text());
  });
  page.on('pageerror',err=>pageErrors.push(String(err.stack||err.message||err)));
  const traffic=[];
  const largeAsset=url=>/\/album-\d+(?:-hd)?\.[0-9a-f]+\.webp(?:$|\?)/.test(url);
  page.on('response',res=>{
    const url=res.url();
    if(ignoreUrl(url))return;
    if(res.status()>=400)failed.push({url,status:res.status()});
    const rec={url,status:res.status(),size:0};
    rec.done=res.finished().then(async()=>{try{rec.size=(await res.body()).length;}catch{}}).catch(()=>{});
    traffic.push(rec);
  });
  const settle=()=>Promise.all(traffic.map(item=>item.done));
  await page.goto(`http://127.0.0.1:${port}/?check=1`,{waitUntil:'networkidle',timeout:60000});
  await page.waitForSelector('[data-action="start"]',{timeout:20000});
  await settle();
  const homeTraffic=traffic.slice();
  const homeBytes=homeTraffic.reduce((sum,item)=>sum+(item.status<400?item.size:0),0);
  const homeLarge=homeTraffic.filter(item=>largeAsset(item.url));
  if(homeLarge.length)throw Error('首屏读取了大图：'+homeLarge.map(item=>item.url).join(' '));
  const banner=await page.locator('#mapp-mock-bar').textContent();
  const officialFlag=await page.evaluate(()=>window.__DORO_MAPP_MOCK__?.officialSandbox);
  const shot=async(name)=>{
    await page.evaluate(()=>{const bar=document.querySelector('#mapp-mock-bar');if(bar)bar.style.display='none';document.body.style.paddingTop='0';});
    await page.screenshot({path:path.join(outDir,name)});
    await page.evaluate(()=>{const bar=document.querySelector('#mapp-mock-bar');if(bar)bar.style.display='';document.body.style.paddingTop='';});
  };
  const overflow=()=>page.evaluate(()=>{
    const nodes=[document.documentElement,document.body,document.querySelector('#app'),document.querySelector('.home-screen'),document.querySelector('.game-screen')].filter(Boolean);
    return nodes.map(el=>({id:el.id||el.className,scroll:el.scrollWidth,client:el.clientWidth,over:el.scrollWidth-el.clientWidth}));
  });
  await shot('mapp-home-390x844.png');
  const homeOverflow=await overflow();
  await page.evaluate(()=>{
    const save=window.__DORO__.save;
    save.artworkProgress[0]=17*16;
    save.artworkProgress[1]=16*15;
    for(const id of [1,2])if(!save.album.includes(id))save.album.push(id);
  });
  await page.click('[data-action="artwork"]');
  await page.waitForSelector('[data-action="album"]');
  await page.click('[data-action="album"]');
  const hdShots=[];
  for(const id of [1,2]){
    await page.click(`[data-album="${id}"]`);
    await page.waitForSelector('[data-action="art-hd"]',{state:'visible'});
    const revokedBefore=await page.evaluate(()=>window.__doroRevoked||0);
    await page.evaluate(()=>{
      if(window.__doroRevokePatched)return;
      const orig=URL.revokeObjectURL.bind(URL);
      window.__doroRevoked=0;
      URL.revokeObjectURL=(url)=>{window.__doroRevoked++;orig(url);};
      window.__doroRevokePatched=true;
    });
    const beforeHd=traffic.length;
    await page.click('[data-action="art-hd"]');
    await page.waitForFunction(()=>{
      const img=document.querySelector('.artwork-hd');
      return img&&!img.hidden&&img.complete&&img.naturalWidth>=800;
    },null,{timeout:20000});
    const info=await page.evaluate(()=>{
      const img=document.querySelector('.artwork-hd');
      return{src:img.currentSrc||img.src,width:img.naturalWidth,height:img.naturalHeight,title:document.querySelector('.artwork-dialog h2')?.textContent||''};
    });
    await settle();
    const hdFetches=traffic.slice(beforeHd).filter(item=>/\/album-\d+-hd\./.test(item.url));
    if(hdFetches.length!==1)throw Error('点开大图时期望只读这一张，实际 '+hdFetches.map(item=>item.url).join(' '));
    await shot(`mapp-hd-${id}-390x844.png`);
    hdShots.push({...info,bytes:hdFetches[0].size});
    await page.click('[data-action="art-hd"]');
    await page.waitForFunction(()=>document.querySelector('.artwork-hd')?.hidden===true);
    const released=await page.evaluate(()=>window.__doroRevoked||0);
    if(released<=revokedBefore)throw Error('关掉高清图后没有释放 Blob');
    await page.click('[data-action="album"]');
  }
  // 画册和单幅互相压栈，关掉一层会回到上一层。一直关到主页露出来。
  for(let i=0;i<12;i++){
    const open=await page.evaluate(()=>!!document.querySelector('.modal-shade'));
    if(!open)break;
    await page.evaluate(()=>document.querySelector('[data-action="close-modal"]')?.click());
  }
  await page.waitForFunction(()=>!document.querySelector('.modal-shade'));
  const beforePlay=traffic.length;
  await page.click('[data-action="start"]');
  await waitBoard(page);
  await settle();
  const playLarge=traffic.slice(beforePlay).filter(item=>largeAsset(item.url));
  if(playLarge.length)throw Error('进游戏读取了大图：'+playLarge.map(item=>item.url).join(' '));
  const l1=await page.evaluate(()=>({id:window.__DORO__.engine.state.levelId,pins:window.__DORO__.engine.state.screws.length,phase:window.__DORO__.engine.state.phase,tip:document.querySelector('#board-tip')?.textContent||''}));
  await shot('mapp-l1-start-390x844.png');
  const l1Overflow=await overflow();

  // 声音开关（平台 mock）
  await page.click('#mock-sound');
  const muted=await page.evaluate(()=>({flag:window.__DORO_MAPP_MOCK__.isMuted(),gain:window.__DORO_MAPP_MOCK__.muteGain()}));
  await page.screenshot({path:path.join(outDir,'mapp-sound-muted-390x844.png'),fullPage:true});
  await page.click('#mock-sound'); // 恢复有声，避免影响可玩性

  const picks=await clickOfficial(page,3);
  const end=await page.evaluate(()=>({phase:window.__DORO__?.engine?.state?.phase,moves:window.__DORO__?.engine?.state?.moves,levelId:window.__DORO__?.engine?.state?.levelId}));
  await page.evaluate(async()=>{await window.__DORO__.startLevel(2);});
  await waitBoard(page);
  const l2=await page.evaluate(()=>({id:window.__DORO__.engine.state.levelId,pins:window.__DORO__.engine.state.screws.length,phase:window.__DORO__.engine.state.phase,tip:document.querySelector('#board-tip')?.textContent||''}));
  await shot('mapp-l2-start-390x844.png');
  const l2Overflow=await overflow();

  // 第二关做到一半，再测存档、隐藏暂停和挑战码。
  const midPicks=await clickOfficial(page,3);
  const mid=await page.evaluate(()=>({moves:window.__DORO__.engine.state.moves,runId:window.__DORO__.engine.state.runId,levelId:window.__DORO__.engine.state.levelId,phase:window.__DORO__.engine.state.phase}));
  await page.waitForTimeout(400);

  // 隐藏暂停
  await page.click('#mock-hide');
  await page.waitForTimeout(400);
  const paused=await page.evaluate(()=>({hidden:window.__DORO_MAPP_MOCK__.isHidden(),modal:!!document.querySelector('.dialog'),title:document.querySelector('.dialog h2')?.textContent||'',viewPaused:true}));
  await page.screenshot({path:path.join(outDir,'mapp-hidden-pause-390x844.png'),fullPage:true});

  // 隐藏已弹出暂停页，直接从这里打开本局挑战码；不要先关掉再找按钮。
  await page.click('[data-action="challenge"]');
  await page.waitForSelector('#current-code',{timeout:10000});
  await page.click('[data-action="copy-code"]');
  await page.waitForTimeout(300);
  const copy=await page.evaluate(()=>{
    const input=document.querySelector('#current-code');
    const toast=document.querySelector('#toast')?.textContent||'';
    return{value:input?.value||'',selected:(input?.selectionEnd||0)-(input?.selectionStart||0),toast};
  });
  await page.screenshot({path:path.join(outDir,'mapp-challenge-copy-390x844.png'),fullPage:true});

  // 刷新恢复
  await page.reload({waitUntil:'networkidle'});
  await page.waitForSelector('[data-action="continue"],[data-action="start"]',{timeout:20000});
  const continueVisible=!!await page.$('[data-action="continue"]');
  if(continueVisible)await page.click('[data-action="continue"]');
  else await page.click('[data-action="start"]');
  await waitBoard(page);
  const restored=await page.evaluate(()=>({moves:window.__DORO__.engine.state.moves,runId:window.__DORO__.engine.state.runId,levelId:window.__DORO__.engine.state.levelId,phase:window.__DORO__.engine.state.phase}));
  await page.screenshot({path:path.join(outDir,'mapp-restored-390x844.png'),fullPage:true});

  await context.close();
  await browser.close();
  server.close();

  const problems=[];
  if(officialFlag!==false)problems.push('未标明这是 mock 而非官方沙箱');
  if(!banner?.includes('不是 Linux DO 官方沙箱'))problems.push('预览条未标明非官方沙箱');
  if(pageErrors.length)problems.push('页面异常：'+pageErrors.join(' | '));
  if(consoleErrors.length)problems.push('控制台错误：'+consoleErrors.join(' | '));
  if(failed.length)problems.push('资源失败：'+JSON.stringify(failed));
  if(l1.id!==1||l1.pins!==30||l1.phase!=='playing')problems.push('第一关没有加载：'+JSON.stringify(l1));
  if(l2.id!==2||l2.pins!==120||l2.phase!=='playing')problems.push('第二关没有加载：'+JSON.stringify(l2));
  if(/免费辅助|已经露出来|先留好颜色/.test(l1.tip+l2.tip))problems.push('关卡仍在讲解：'+l1.tip+' / '+l2.tip);
  const wide=[...homeOverflow,...l1Overflow,...l2Overflow].filter(item=>item.over>1);
  if(wide.length)problems.push('横向超出视口：'+JSON.stringify(wide));
  if(!picks.some(item=>item.hit))problems.push('第一关点了螺丝但步数没有增加：'+JSON.stringify(picks));
  if(!muted.flag||muted.gain!==0)problems.push('声音开关未静音输出：'+JSON.stringify(muted));
  if(mid.moves<3)problems.push('中途进度不足：'+JSON.stringify(mid));
  if(!paused.modal)problems.push('页面隐藏后未出现暂停界面：'+JSON.stringify(paused));
  if(!copy.value||!String(copy.toast).includes('长按')||copy.selected===0)problems.push('挑战码复制降级不符合预期：'+JSON.stringify(copy));
  if(restored.runId!==mid.runId||restored.moves!==mid.moves)problems.push('刷新后未恢复中途存档：'+JSON.stringify({mid,restored}));

  const videos=(await import('node:fs')).readdirSync(outDir).filter(f=>f.endsWith('.webm'));
  const artifacts='/opt/cursor/artifacts';
  await mkdir(artifacts,{recursive:true});
  for(const name of ['mapp-home-390x844.png','mapp-l1-start-390x844.png','mapp-l2-start-390x844.png','mapp-hd-1-390x844.png','mapp-hd-2-390x844.png']){
    await copyFile(path.join(outDir,name),path.join(artifacts,name));
  }
  if(hdShots.length!==2||hdShots.some(item=>item.width<800))problems.push('高清图没有打开：'+JSON.stringify(hdShots));
  const report={ok:problems.length===0,sandbox:'local-mock-not-official',banner,muted,l1,l2,hdShots,homeBytes,homeRequests:homeTraffic.length,homeLarge:homeLarge.map(item=>item.url),playLarge:playLarge.map(item=>item.url),end,homeOverflow,l1Overflow,l2Overflow,mid,paused,copy,restored,picks:picks.length,midPicks:midPicks.length,consoleErrors,pageErrors,failed,problems,shots:outDir,video:videos[0]?path.join(outDir,videos[0]):null};
  await writeFile(path.join(outDir,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:report.ok,homeBytes,homeRequests:homeTraffic.length,hdShots,end,muted,restored,copy,problems,shots:outDir,video:report.video},null,2));
  if(problems.length){console.error(problems.join('\n'));process.exit(1);}
}
main().catch(error=>{console.error(error);process.exit(1);});
