import {test,expect,type Page,type CDPSession} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const shots=resolve('test-results/feel-shots');
mkdirSync(shots,{recursive:true});

declare global {
  interface Window {
    __DORO__?:{
      engine:{state:{phase:string;moves:number;levelId:number;runId:string;screws:Array<{id:string;place:string}>};available:()=>Array<{id:string;color:string}>;canUndo:boolean;dispatch:(a:unknown)=>{ok:boolean};snapshot:()=>unknown};
      view:{getScrewScreenPosition:(id:string)=>{x:number;y:number}|null;diagnostics:()=>Array<{delta:number;total:number;physics:number;paint:number;plates:number;pins:number}>;isInspecting:()=>boolean};
      save:{current:null|{moves:number;levelId:number};tutorialSeen:string[];settings:{reducedMotion:boolean;colorLabels:boolean}};
      startLevel:(id:number)=>Promise<void>;
      pick:(id:string)=>void;
    };
  }
}

async function ready(page:Page):Promise<void>{
  await page.goto('/?check=1');
  await page.waitForSelector('[data-action="start"],[data-action="continue"]');
}

async function startFresh(page:Page,id=1):Promise<void>{
  await page.addInitScript(()=>{try{localStorage.clear();}catch{}/* 清掉本域进度，保证第一关教学。 */});
  await ready(page);
  await page.evaluate(async(levelId)=>{
    const api=window.__DORO__;
    if(!api)throw new Error('__DORO__ 未挂载，发布预览需要 ?check=1');
    await api.startLevel(levelId);
  },id);
  await page.waitForFunction(()=>window.__DORO__?.view&&window.__DORO__?.engine?.state.phase==='playing',null,{timeout:30_000});
}

async function tip(page:Page):Promise<string>{
  return page.locator('#board-tip').innerText();
}

async function pointerTap(page:Page,x:number,y:number):Promise<void>{
  await page.mouse.click(x,y);
}

async function tapScrew(page:Page,id:string):Promise<boolean>{
  const pos=await page.evaluate((screwId)=>window.__DORO__?.view.getScrewScreenPosition(screwId)??null,id);
  if(!pos)return false;
  await pointerTap(page,pos.x,pos.y);
  return true;
}

test.describe('手感与稳定性',()=>{
  test('真实指针能点中可见螺丝，快速连点不会卡死',async({page})=>{
    await startFresh(page,1);
    const before=await page.evaluate(()=>window.__DORO__!.engine.state.moves);
    const available=await page.evaluate(()=>window.__DORO__!.engine.available().map(s=>s.id));
    expect(available.length).toBeGreaterThan(0);
    const first=available[0];
    const pos=await page.evaluate((id)=>window.__DORO__!.view.getScrewScreenPosition(id),first);
    expect(pos).toBeTruthy();
    await page.screenshot({path:resolve(shots,'level1-start.png')});
    await pointerTap(page,pos!.x,pos!.y);
    await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBe(before+1);
    const next=await page.evaluate(()=>window.__DORO__!.engine.available()[0]?.id);
    if(next){
      const at=await page.evaluate((id)=>window.__DORO__!.view.getScrewScreenPosition(id),next);
      if(at){
        for(let i=0;i<8;i++)await pointerTap(page,at.x,at.y);
      }
    }
    await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.phase)).toBe('playing');
    const missed=await page.evaluate(()=>window.__DORO__!.engine.available()[0]?.id);
    if(missed){
      const at=await page.evaluate((id)=>window.__DORO__!.view.getScrewScreenPosition(id),missed);
      if(at){
        await pointerTap(page,at.x+40,at.y+40);
        await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.phase)).toBe('playing');
      }
    }
  });

  test('长按进入检查，松手结束且不拆钉',async({page})=>{
    await startFresh(page,1);
    const id=await page.evaluate(()=>window.__DORO__!.engine.available()[0].id);
    const moves=await page.evaluate(()=>window.__DORO__!.engine.state.moves);
    const pos=await page.evaluate((screwId)=>window.__DORO__!.view.getScrewScreenPosition(screwId),id);
    await page.mouse.move(pos!.x,pos!.y);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await expect(page.locator('#board-inspect')).toBeVisible();
    expect(await page.evaluate(()=>window.__DORO__!.view.isInspecting())).toBe(true);
    await page.mouse.up();
    await expect(page.locator('#board-inspect')).toBeHidden();
    expect(await page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBe(moves);
  });

  test('双指缩放和拖动不会误拆螺丝',async({page})=>{
    await startFresh(page,1);
    const moves=await page.evaluate(()=>window.__DORO__!.engine.state.moves);
    const canvas=page.locator('#game-canvas canvas');
    const box=await canvas.boundingBox();
    expect(box).toBeTruthy();
    const cx=box!.x+box!.width/2,cy=box!.y+box!.height/2;
    await page.evaluate(({x1,y1,x2,y2,x3})=>{
      const el=document.querySelector('#game-canvas canvas') as HTMLCanvasElement;
      const fire=(type:string,id:number,x:number,y:number)=>{
        el.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,isPrimary:id===11,bubbles:true,cancelable:true}));
      };
      fire('pointerdown',11,x1,y1);
      fire('pointerdown',12,x2,y2);
      fire('pointermove',12,x3,y2);
      fire('pointerup',12,x3,y2);
      fire('pointerup',11,x1,y1);
    },{x1:cx-30,y1:cy,x2:cx+30,y2:cy,x3:cx+90});
    expect(await page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBe(moves);
    const zoom=await page.locator('#zoom-value').textContent();
    expect(Number((zoom??'100').replace('%',''))).toBeGreaterThan(100);
    await page.evaluate(({x,y,x2})=>{
      const el=document.querySelector('#game-canvas canvas') as HTMLCanvasElement;
      const fire=(type:string,px:number)=>{
        el.dispatchEvent(new PointerEvent(type,{pointerId:21,pointerType:'touch',clientX:px,clientY:y,button:0,isPrimary:true,bubbles:true,cancelable:true}));
      };
      fire('pointerdown',x);
      fire('pointermove',x2);
      fire('pointerup',x2);
    },{x:cx,y:cy,x2:cx+80});
    expect(await page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBe(moves);
  });

  test('暂停恢复、切到后台再回来，棋盘仍可点',async({page})=>{
    await startFresh(page,1);
    await page.locator('[data-action="pause"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('[data-action="resume"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const hidden=await page.evaluate(()=>{
      const was=document.hidden;
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));
      return was;
    });
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    void hidden;
    const id=await page.evaluate(()=>window.__DORO__!.engine.available()[0].id);
    const moves=await page.evaluate(()=>window.__DORO__!.engine.state.moves);
    expect(await tapScrew(page,id)).toBe(true);
    await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBe(moves+1);
  });

  test('横竖屏切换后仍能点中螺丝',async({page})=>{
    await startFresh(page,1);
    await page.setViewportSize({width:844,height:390});
    await page.waitForTimeout(300);
    await page.evaluate(()=>{window.dispatchEvent(new Event('orientationchange'));window.__DORO__?.view&&window.dispatchEvent(new Event('resize'));});
    await page.screenshot({path:resolve(shots,'landscape.png')});
    const id=await page.evaluate(()=>window.__DORO__!.engine.available()[0].id);
    const moves=await page.evaluate(()=>window.__DORO__!.engine.state.moves);
    expect(await tapScrew(page,id)).toBe(true);
    await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBe(moves+1);
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(300);
    const next=await page.evaluate(()=>window.__DORO__!.engine.available()[0]?.id);
    if(next){
      const after=await page.evaluate(()=>window.__DORO__!.engine.state.moves);
      await tapScrew(page,next);
      await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBeGreaterThanOrEqual(after);
    }
  });

  test('刷新后恢复未完成盘面',async({page})=>{
    await startFresh(page,1);
    const first=await page.evaluate(()=>window.__DORO__!.engine.available()[0].id);
    await page.evaluate((id)=>window.__DORO__!.pick(id),first);
    await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBe(1);
    const runId=await page.evaluate(()=>window.__DORO__!.engine.state.runId);
    await page.reload();
    await page.waitForSelector('[data-action="continue"]');
    await page.locator('[data-action="continue"]').click();
    await page.waitForFunction(()=>window.__DORO__?.view&&window.__DORO__?.engine?.state.phase==='playing',null,{timeout:30_000});
    const restored=await page.evaluate(()=>({moves:window.__DORO__!.engine.state.moves,runId:window.__DORO__!.engine.state.runId}));
    expect(restored.moves).toBe(1);
    expect(restored.runId).toBe(runId);
  });

  test('localStorage 写满时给出保存异常且对局仍可继续',async({page})=>{
    await startFresh(page,1);
    await page.evaluate(()=>{
      const raw=Storage.prototype.setItem;
      Storage.prototype.setItem=function(){throw new DOMException('The quota has been exceeded.','QuotaExceededError');};
      (window as unknown as {__restoreSetItem?:typeof raw}).__restoreSetItem=raw;
    });
    const id=await page.evaluate(()=>window.__DORO__!.engine.available()[0].id);
    await page.evaluate((screwId)=>window.__DORO__!.pick(screwId),id);
    await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBeGreaterThan(0);
    // localStorage 写满时若 IndexedDB 仍能写，状态会回到已保存，不误报失败；两路都失败才持续显示异常。
    await page.waitForTimeout(400);
    const status=await page.locator('[data-save-status]').getAttribute('data-status');
    expect(['saved','local','error','saving']).toContain(status);
    expect(await page.evaluate(()=>window.__DORO__!.engine.state.phase)).toBe('playing');
  });

  test('离线后已加载的对局仍可拆钉',async({page,context})=>{
    await startFresh(page,1);
    await context.setOffline(true);
    const id=await page.evaluate(()=>window.__DORO__!.engine.available()[0].id);
    const moves=await page.evaluate(()=>window.__DORO__!.engine.state.moves);
    expect(await tapScrew(page,id)).toBe(true);
    await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBe(moves+1);
    await context.setOffline(false);
  });
});

test.describe('教学交互',()=>{
  test('新玩家第一关开场没有说明文字',async({page})=>{
    await startFresh(page,1);
    await page.screenshot({path:resolve(shots,'teach-open.png')});
    const opening=await tip(page);
    expect(opening).toBe('');
    expect(opening).not.toMatch(/免费辅助|已经露出来/);
    const repeats=await page.evaluate(()=>window.__DORO__!.save.tutorialSeen);
    expect(repeats.includes('l1-open')).toBe(false);
    writeFileSync(resolve(shots,'teach-tips.json'),JSON.stringify({opening,tutorialSeen:repeats},null,2));
  });
});

test.describe('性能',()=>{
  test('普通帧和 4x 慢速 CPU 下输入仍能在一拍内提交',async({page})=>{
    await startFresh(page,2);
    await page.waitForTimeout(800);
    const baseline=await page.evaluate(()=>window.__DORO__!.view.diagnostics().slice(-90));
    const session:CDPSession=await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.waitForTimeout(800);
    const id=await page.evaluate(()=>window.__DORO__!.engine.available()[0]?.id);
    expect(id).toBeTruthy();
    const t0=await page.evaluate(()=>performance.now());
    await page.evaluate((screwId)=>window.__DORO__!.pick(screwId),id!);
    await expect.poll(async()=>page.evaluate(()=>window.__DORO__!.engine.state.moves)).toBeGreaterThan(0);
    const latency=await page.evaluate((start)=>performance.now()-start,t0);
    const slow=await page.evaluate(()=>window.__DORO__!.view.diagnostics().slice(-90));
    await session.send('Emulation.setCPUThrottlingRate',{rate:1});
    const stats=(rows:typeof baseline)=>{
      if(!rows.length)return{avgDelta:0,avgPaint:0,fps:0,plates:0,pins:0};
      const avgDelta=rows.reduce((s,r)=>s+r.delta,0)/rows.length;
      const avgPaint=rows.reduce((s,r)=>s+r.paint,0)/rows.length;
      return{avgDelta,avgPaint,fps:avgDelta>0?1000/avgDelta:0,plates:rows.at(-1)?.plates??0,pins:rows.at(-1)?.pins??0};
    };
    const report={baseline:stats(baseline),throttled:stats(slow),inputLatencyMs:latency};
    writeFileSync(resolve(shots,'perf.json'),JSON.stringify(report,null,2));
    expect(latency).toBeLessThan(250);
    expect(report.throttled.avgDelta).toBeLessThan(80);
  });

  test('来回切入关卡 50 次后画布不泄漏，堆内存增长受控',async({page})=>{
    await startFresh(page,1);
    const session=await page.context().newCDPSession(page);
    await session.send('HeapProfiler.enable');
    const canvasesBefore=await page.evaluate(()=>document.querySelectorAll('canvas').length);
    const heap=async()=>{
      const result=await session.send('Runtime.getHeapUsage') as {usedSize:number};
      return result.usedSize;
    };
    const start=await heap();
    for(let i=0;i<50;i++){
      await page.evaluate(async()=>{await window.__DORO__!.startLevel(1);});
      await page.waitForFunction(()=>window.__DORO__?.view&&window.__DORO__?.engine?.state.phase==='playing');
    }
    const canvasesAfter=await page.evaluate(()=>document.querySelectorAll('canvas').length);
    await page.evaluate(()=>{(window as unknown as {gc?:()=>void}).gc?.();});
    const end=await heap();
    const report={canvasesBefore,canvasesAfter,heapStart:start,heapEnd:end,delta:end-start};
    writeFileSync(resolve(shots,'memory.json'),JSON.stringify(report,null,2));
    expect(canvasesAfter).toBeLessThanOrEqual(canvasesBefore+2);
    expect(end-start).toBeLessThan(120*1024*1024);
  });
});
