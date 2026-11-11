#!/usr/bin/env node
/**
 * 线 F 彩蛋与仪式感的浏览器验收：首页戳 Doro、空闲小动作、注册机辅助、第二关真实通关破墙。
 * 用法：node scripts/delight-e2e.mjs [--skip-build] [--quick]   截图目录 DELIGHT_SHOTS（默认 /tmp/doro-delight-shots）
 * --quick 跳过第二关 120 颗真实通关。
 */
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const skipBuild=process.argv.includes('--skip-build'),quick=process.argv.includes('--quick');
const shots=path.resolve(process.env.DELIGHT_SHOTS||'/tmp/doro-delight-shots');
const dist=path.resolve('dist');
const failures=[];const check=(ok,label)=>{console.log((ok?'✔ ':'✘ ')+label);if(!ok)failures.push(label);};
const freePort=()=>new Promise((resolve,reject)=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});s.on('error',reject);});
const run=(cmd,args)=>new Promise((resolve,reject)=>{const c=spawn(cmd,args,{stdio:'inherit'});c.on('close',code=>code===0?resolve():reject(Error(cmd+' '+code)));});

async function waitBoard(page){
  await page.waitForFunction(()=>!document.querySelector('#board-loading')&&!!document.querySelector('#game-canvas canvas')&&window.__DORO__?.engine&&window.__DORO__?.view,{timeout:45000});
  await page.waitForTimeout(500);
}
/** 严格按关卡见证顺序真实点击；每步等露出、等摆稳，模拟一位照官方线走的玩家。 */
async function clickOfficial(page,limit){
  let picks=0;
  const total=await page.evaluate(()=>window.__DORO__.level?.witness?.length??0);
  for(let index=0;index<total&&picks<limit;index++){
    const step=await page.evaluate(i=>{const api=window.__DORO__,s=api.level.witness[i];return{id:s.screwId,waitMs:s.waitMs??0,on:api.engine.state.screws.find(x=>x.id===s.screwId)?.place==='board',phase:api.engine.state.phase};},index);
    if(step.phase!=='playing')break;if(!step.on)continue;
    let hit=false;
    for(let tries=0;tries<80&&!hit;tries++){
      const target=await page.evaluate(id=>{const api=window.__DORO__;if(!api.engine.canPick(id))return null;const p=api.view.getScrewScreenPosition(id);return p?{x:p.x,y:p.y}:null;},step.id);
      if(!target){await page.waitForTimeout(120);continue;}
      const before=await page.evaluate(()=>window.__DORO__.engine.state.moves);
      await page.mouse.click(target.x,target.y);
      try{await page.waitForFunction(prev=>window.__DORO__.engine.state.moves>prev,before,{timeout:2500});}catch{}
      hit=await page.evaluate(prev=>window.__DORO__.engine.state.moves>prev,before);
      if(!hit)await page.waitForTimeout(150);
    }
    if(!hit)throw Error('见证第 '+index+' 步点不到 '+step.id);
    picks++;
    await page.waitForTimeout(Math.max(90,step.waitMs));
  }
  return picks;
}
const log=page=>page.evaluate(()=>[...window.__DORO__.delight.log]);
const shot=(page,name)=>page.screenshot({path:path.join(shots,name+'.png')});

async function main(){
  await mkdir(shots,{recursive:true});
  if(!skipBuild)await run(process.execPath,['scripts/build.mjs']);
  const port=await freePort();
  const server=spawn(process.execPath,['scripts/serve-release.mjs',dist,String(port)],{stdio:['ignore','pipe','pipe']});
  await new Promise(r=>{const t=setTimeout(r,1500);server.stdout.on('data',d=>{if(String(d).includes('发布预览')){clearTimeout(t);r();}});});
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  const views=[{name:'360x740',width:360,height:740,wall:!quick,idleReal:true},{name:'390x844',width:390,height:844,wall:!quick,idleReal:false}];
  try{
    for(const v of views){
      console.log('— 视口',v.name);
      const context=await browser.newContext({viewport:{width:v.width,height:v.height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
      await context.addInitScript(()=>{try{if(!sessionStorage.getItem('dl-ready')){localStorage.clear();localStorage.setItem('doro-delight:v1',JSON.stringify({v:1,wallBumps:3,wallBroken:false,pokes:0}));sessionStorage.setItem('dl-ready','1');}}catch{}});
      const page=await context.newPage();const errors=[];
      page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(`http://127.0.0.1:${port}/?check=1`,{waitUntil:'networkidle'});
      await page.waitForSelector('.home-character');
      await shot(page,v.name+'-01-home');
      // 首页戳一戳：五连戳。
      const box=await page.locator('.home-character').boundingBox();
      const cx=box.x+box.width/2,cy=box.y+box.height*.55;
      for(let i=0;i<4;i++){await page.mouse.click(cx,cy);await page.waitForTimeout(120);}
      check(await page.evaluate(()=>document.querySelector('.home-character').classList.contains('dl-squash')),v.name+' 戳 Doro 有压扁回弹');
      await page.mouse.click(cx,cy);await page.waitForTimeout(450);
      check(await page.evaluate(()=>document.querySelector('.home-character').classList.contains('dl-dizzy')),v.name+' 五连戳后 Doro 晕了');
      await shot(page,v.name+'-02-home-dizzy');
      await page.waitForTimeout(1600);
      // 长按：鼓起再噗。
      await page.mouse.move(cx,cy);await page.mouse.down();await page.waitForTimeout(1000);
      check(await page.evaluate(()=>document.querySelector('.home-character').classList.contains('dl-inflate')),v.name+' 长按 Doro 慢慢鼓起');
      await shot(page,v.name+'-03-home-inflate');
      await page.waitForTimeout(800);await page.mouse.up();
      check((await log(page)).includes('poke:pop'),v.name+' 长按到底噗一声冒心');
      await page.waitForTimeout(200);await shot(page,v.name+'-04-home-pop');
      const homeButtons=await page.evaluate(()=>!!document.querySelector('[data-action="start"]')&&!document.querySelector('.modal-shade'));
      check(homeButtons,v.name+' 戳 Doro 没有触发任何按钮或弹窗');
      // 第一关。
      await page.click('[data-action="start"]');await waitBoard(page);
      check(!(await page.$('.dl-wall-tally')),v.name+' 第一关不出现撞墙记号');
      if(v.idleReal){
        // 真实空闲调度：22 秒不碰，Doro 自己演一段；随后任意触碰立即收场。
        await page.waitForTimeout(23500);
        const idle=(await log(page)).filter(x=>x.startsWith('idle:'));
        check(idle.length===1,v.name+' 空闲 22 秒后演了一段小动作 '+idle.join(','));
        await shot(page,v.name+'-05-idle-real');
        await page.mouse.click(5,v.height/2);await page.waitForTimeout(80);
        check(await page.evaluate(()=>!document.querySelector('#doro-reaction').className.match(/dl-(peek|sneak|doze)/)),v.name+' 一碰屏幕空闲演出立即收场');
      }
      const moves0=await page.evaluate(()=>window.__DORO__.engine.state.moves);
      await page.evaluate(()=>window.__DORO__.delight.debugIdle('sneak'));
      await page.waitForTimeout(1500);
      check(await page.evaluate(()=>!!document.querySelector('#pocket-count.dl-bite')&&document.querySelector('#doro-reaction').classList.contains('dl-sneak-bitten')),v.name+' 偷摸口袋：口袋咬回去，Doro 被弹开');
      await shot(page,v.name+'-06-idle-sneak-bite');
      await page.waitForTimeout(900);await shot(page,v.name+'-07-idle-sneak-away');
      await page.waitForTimeout(1200);
      check(await page.evaluate(m=>window.__DORO__.engine.state.moves===m&&window.__DORO__.engine.state.buffer.every(x=>x===null),moves0),v.name+' 小动作不改盘面');
      await page.evaluate(()=>window.__DORO__.delight.debugIdle('doze'));await page.waitForTimeout(1300);
      await shot(page,v.name+'-08-idle-doze');
      await page.mouse.click(5,v.height/2);await page.waitForTimeout(150);
      // 免费辅助：注册机铭牌。
      await page.click('.play-toolbar [data-action="tools"]');await page.waitForTimeout(250);
      await shot(page,v.name+'-09-keygen-rolling');
      await page.waitForTimeout(800);
      const serial=await page.textContent('.dl-keygen-serial');
      check(serial==='D0R0-FREE-NOAD-0000',v.name+' 注册机序列号滚完定格 '+serial);
      await shot(page,v.name+'-10-keygen-done');
      const opt=await page.$('[data-action="use-expand-buffer"]');
      if(opt){await opt.click();await page.waitForTimeout(380);
        check(!!(await page.$('.dl-patch')),v.name+' 用挂后暂存条跑补丁进度');
        await shot(page,v.name+'-11-patch');
        await page.waitForTimeout(900);check(!(await page.$('.dl-patch')),v.name+' 补丁进度自己消失');
      }else check(false,v.name+' 找不到增加暂存孔按钮');
      // 打完第一关：确认不演破墙。
      await clickOfficial(page,40);
      await page.waitForSelector('.dialog[aria-label="win"]',{timeout:20000});
      check(!(await page.$('.dl-wall')),v.name+' 第一关通关不演破墙');
      const streaks=(await log(page)).filter(x=>x.startsWith('streak:'));
      console.log('  连击记录',streaks.join(' ')||'无');
      if(v.wall){
        await page.evaluate(()=>window.__DORO__.startLevel(2));await waitBoard(page);
        check(!!(await page.$('.dl-wall-tally .dl-tally-group')),v.name+' 第二关开局：粉笔记着撞墙 3 次（只在开局，不在失败时）');
        await shot(page,v.name+'-12-wall-start-tally');
        const t=Date.now();const picks=await clickOfficial(page,140);
        console.log(`  第二关真实点完 ${picks} 颗，${Math.round((Date.now()-t)/1000)} 秒`);
        await page.waitForSelector('.dl-wall',{timeout:30000});
        await page.waitForTimeout(560);await shot(page,v.name+'-13-wall-crack');
        await page.waitForTimeout(500);await shot(page,v.name+'-14-wall-burst');
        await page.waitForSelector('.dl-wall.beat-strike',{timeout:4000});await page.waitForTimeout(500);
        await shot(page,v.name+'-15-wall-seal');
        const seal=await page.evaluate(()=>{const r=document.querySelector('.dl-seal').getBoundingClientRect();return{l:r.left,r:r.right,t:r.top,b:r.bottom,w:innerWidth,h:innerHeight};});
        check(seal.l>=0&&seal.r<=seal.w&&seal.t>=0&&seal.b<=seal.h,v.name+' 印章完整在画面内');
        const quiet=await page.evaluate(()=>{
          const hidden=el=>{if(!el)return true;const s=getComputedStyle(el);return s.visibility==='hidden'||s.display==='none';};
          return document.querySelector('.game-screen')?.classList.contains('dl-ceremony') && hidden(document.querySelector('.dl-wall-tally')) && hidden(document.querySelector('.board-guide')) && hidden(document.querySelector('.run-line'));
        });
        check(quiet,v.name+' 仪式中收起粉笔记号和底部说明');
        check(await page.evaluate(()=>window.__DORO__.delight.ledger.wallBroken===true),v.name+' 账本记下破墙');
        check(!(await page.$('.dialog[aria-label="win"]')),v.name+' 仪式中不抢先弹结算');
        await page.waitForSelector('.dialog[aria-label="win"]',{timeout:6000});await page.waitForTimeout(300);
        check(!(await page.$('.dl-wall')),v.name+' 仪式结束后交给结算');
        await shot(page,v.name+'-16-wall-win');
        const beats=(await log(page)).filter(x=>x.startsWith('beat:')).join(',');
        check(beats==='beat:crack,beat:shatter,beat:burst,beat:stamp,beat:strike,beat:done',v.name+' 拍点完整 '+beats);
      }
      check(errors.length===0,v.name+' 无页面错误 '+errors.join(' | '));
      await context.close();
    }
    // 轻柔动效：破墙直接定格印章。
    {
      const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
      const page=await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/?check=1`,{waitUntil:'networkidle'});
      await page.click('[data-action="settings"]');await page.click('[data-key="reducedMotion"]');await page.click('[data-action="close-settings"]');
      await page.evaluate(()=>window.__DORO__.startLevel(1));await waitBoard(page);
      await page.evaluate(()=>window.__DORO__.delight.debugIdle('sneak'));await page.waitForTimeout(800);
      check(!(await page.$('#pocket-count.dl-bite-warn,#pocket-count.dl-bite'))&&!(await page.evaluate(()=>document.querySelector('#doro-reaction').className.includes('dl-sneak'))),'轻柔动效下不演空闲小动作');
      await context.close();
    }
  }finally{await browser.close();server.kill();}
  if(failures.length){console.error('失败：\n'+failures.join('\n'));process.exit(1);}
  console.log('全部通过，截图在',shots);
}
await main();
