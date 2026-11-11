#!/usr/bin/env node
/**
 * 在 390×844 用本地 SDK mock 验收微应用构建。
 * 这不是 Linux DO 官方沙箱；官方文档要求真实 SDK 上传 /apps-sandbox。
 */
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
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
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
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
  page.on('response',res=>{if(res.status()>=400&&!ignoreUrl(res.url()))failed.push({url:res.url(),status:res.status()});});
  await page.goto(`http://127.0.0.1:${port}/?check=1`,{waitUntil:'networkidle',timeout:60000});
  await page.waitForSelector('[data-action="start"]',{timeout:20000});
  const banner=await page.locator('#mapp-mock-bar').textContent();
  const officialFlag=await page.evaluate(()=>window.__DORO_MAPP_MOCK__?.officialSandbox);
  await page.screenshot({path:path.join(outDir,'mapp-home-390x844.png'),fullPage:true});
  await page.click('[data-action="start"]');
  await waitBoard(page);
  await page.screenshot({path:path.join(outDir,'mapp-l1-start-390x844.png'),fullPage:true});

  // 声音开关（平台 mock）
  await page.click('#mock-sound');
  const muted=await page.evaluate(()=>({flag:window.__DORO_MAPP_MOCK__.isMuted(),gain:window.__DORO_MAPP_MOCK__.muteGain()}));
  await page.screenshot({path:path.join(outDir,'mapp-sound-muted-390x844.png'),fullPage:true});
  await page.click('#mock-sound'); // 恢复有声，避免影响可玩性

  const picks=await clickOfficial(page,15);
  await page.waitForFunction(()=>window.__DORO__?.engine?.state?.phase==='won'||document.querySelector('[data-action="home"],.dialog h2'),{timeout:20000}).catch(()=>{});
  const end=await page.evaluate(()=>({phase:window.__DORO__?.engine?.state?.phase,moves:window.__DORO__?.engine?.state?.moves,completed:window.__DORO__?.save?.completed||[]}));
  await page.waitForTimeout(800);
  await page.screenshot({path:path.join(outDir,'mapp-l1-won-390x844.png'),fullPage:true});

  // 新开一局做到一半再测存档与隐藏暂停、挑战码
  await page.click('[data-action="home"]').catch(()=>{});
  await page.waitForTimeout(400);
  // 若结算页没有 home，点关闭后再回首页
  if(!await page.$('[data-action="start"],[data-action="continue"]')){
    await page.click('[data-action="close-modal"]').catch(()=>{});
    await page.click('[data-action="home"]').catch(()=>{});
  }
  await page.waitForSelector('[data-action="start"],[data-action="continue"]',{timeout:15000});
  // 清掉已完成进度后的继续，改开第二关？存档恢复用刷新当前进行中的一局：再开第二关或重玩。
  // 为了恢复测试，从关卡地图开第 2 关或继续。这里新开一局：若首页是开始第2关，进入后点 6 颗。
  const startSel=await page.$('[data-action="continue"]')?'[data-action="continue"]':'[data-action="start"]';
  if(startSel==='[data-action="continue"]'){
    // 上一局已赢，current 应为空，首页应是开始下一关
  }
  await page.click('[data-action="start"],[data-action="continue"]');
  await waitBoard(page);
  const midPicks=await clickOfficial(page,6);
  const mid=await page.evaluate(()=>({moves:window.__DORO__.engine.state.moves,runId:window.__DORO__.engine.state.runId,levelId:window.__DORO__.engine.state.levelId,phase:window.__DORO__.engine.state.phase}));
  await page.waitForTimeout(500);

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
  if(end.phase!=='won'||end.moves!==15)problems.push('第一关未通关：'+JSON.stringify(end));
  if(!muted.flag||muted.gain!==0)problems.push('声音开关未静音输出：'+JSON.stringify(muted));
  if(mid.moves<3)problems.push('中途进度不足：'+JSON.stringify(mid));
  if(!paused.modal)problems.push('页面隐藏后未出现暂停界面：'+JSON.stringify(paused));
  if(!copy.value||!String(copy.toast).includes('长按')||copy.selected===0)problems.push('挑战码复制降级不符合预期：'+JSON.stringify(copy));
  if(restored.runId!==mid.runId||restored.moves!==mid.moves)problems.push('刷新后未恢复中途存档：'+JSON.stringify({mid,restored}));

  const videos=(await import('node:fs')).readdirSync(outDir).filter(f=>f.endsWith('.webm'));
  const report={ok:problems.length===0,sandbox:'local-mock-not-official',banner,muted,end,mid,paused,copy,restored,picks:picks.length,midPicks:midPicks.length,consoleErrors,pageErrors,failed,problems,shots:outDir,video:videos[0]?path.join(outDir,videos[0]):null};
  await writeFile(path.join(outDir,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:report.ok,end,muted,restored,copy,problems,shots:outDir,video:report.video},null,2));
  if(problems.length){console.error(problems.join('\n'));process.exit(1);}
}
main().catch(error=>{console.error(error);process.exit(1);});
