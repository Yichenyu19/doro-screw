import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

function sha256(text){
  return createHash('sha256').update(text).digest('base64');
}

export function packageHtml(webDir,imgSrc='blob: data:',seed=[]){
  const appJs=readFileSync(path.join(webDir,'app.js'),'utf8');
  const css=readFileSync(path.join(webDir,'app.css'),'utf8');
  if(/@font-face|url\(\s*['"][^'"]+\.(?:woff2?|ttf|otf)/i.test(css))throw Error('app.css 含字体文件');
  if(css.includes('</style'))throw Error('app.css 含 </style');
  const list=JSON.parse(readFileSync(path.join(webDir,'asset-list.json'),'utf8'));
  const files={};
  files['asset-list.json']=Buffer.from(JSON.stringify(list)).toString('base64');
  for(const file of list)files[file]=readFileSync(path.join(webDir,file)).toString('base64');
  const stub=`(function(){
var files=${JSON.stringify(files)};
new MutationObserver(function(records){
  records.forEach(function(record){
    [].forEach.call(record.addedNodes||[],function(node){
      if(node&&node.tagName==='STYLE') parent.postMessage({type:'doro-style',text:String(node.textContent||'').slice(0,160)},'*');
    });
  });
}).observe(document.documentElement,{childList:true,subtree:true});
var started=performance.now();
var violations=[];
['error','warn'].forEach(function(level){
  var original=console[level];
  console[level]=function(){
    var text=[].map.call(arguments,function(item){return String(item&&item.message||item);}).join(' ');
    parent.postMessage({type:'doro-log',level:level,message:text.slice(0,300)},'*');
    return original.apply(console,arguments);
  };
});
document.addEventListener('securitypolicyviolation',function(event){
  var message=[event.effectiveDirective,event.violatedDirective,event.blockedURI,event.lineNumber,event.sourceFile,(event.sample||'').slice(0,120)].join(' | ');
  violations.push(message);
  parent.postMessage({type:'doro-violation',message:message},'*');
});
window.addEventListener('error',function(event){
  var error=event.error;
  parent.postMessage({type:'doro-error',message:String(event.message||'')+' | '+String(error&&error.stack||event.filename||'')},'*');
});
window.addEventListener('unhandledrejection',function(event){
  var reason=event.reason;
  parent.postMessage({type:'doro-error',message:String(reason&&reason.message||reason||'')},'*');
});
function bytes(name){
  var b64=files[name];
  if(!b64)throw Error('ASSET_NOT_FOUND '+name);
  var bin=atob(b64),out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
window.__DORO_CHECK__=true;
var seed=${JSON.stringify(seed)};
function remember(){parent.postMessage({type:'doro-store',entries:seed},'*');}
window.miniApp={
  ready:Promise.resolve(),
  permissions:{has:function(){return true;}},
  lifecycle:{ready:function(){
    parent.postMessage({type:'doro-ready',ms:performance.now()-started,origin:String(location.origin),text:(document.querySelector('#app')||{}).textContent||'',violations:violations.slice()},'*');
    return Promise.resolve();
  }},
  theme:{get:function(){return Promise.resolve({mode:'light',background:'#fff8f2',text:'#3b1d28',reducedMotion:false,locale:'zh_CN',accent:'#000',border:'#ccc'});},onChange:function(){return function(){};}},
  localStorage:{
    getItem:function(key){var found=seed.find(function(item){return item[0]===String(key);});return Promise.resolve(found?found[1]:null);},
    setItem:function(key,value){var name=String(key),text=String(value);seed=seed.filter(function(item){return item[0]!==name;});seed.push([name,text]);remember();return Promise.resolve();},
    removeItem:function(key){var name=String(key);seed=seed.filter(function(item){return item[0]!==name;});remember();return Promise.resolve();},
    clear:function(){seed=[];remember();return Promise.resolve();},
    exportData:function(){return Promise.resolve({format:1,entries:seed.slice()});}
  },
  assets:{
    readBytes:function(name){return Promise.resolve(bytes(name));},
    readText:function(name){return Promise.resolve(new TextDecoder().decode(bytes(name)));},
    readJson:function(name){return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes(name))));}
  },
  files:{save:function(){return Promise.resolve();}}
};
var homeSent=false;
var homeTimer=setInterval(function(){
  var text=(document.querySelector('#app')||{}).textContent||'';
  if(!homeSent&&text.indexOf('开始拆')!==-1){
    homeSent=true;clearInterval(homeTimer);
    parent.postMessage({type:'doro-home',text:text.slice(0,120),violations:violations.slice()},'*');
  }
},100);
function sleep(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
function bodyText(){return document.body&&document.body.innerText||'';}
function clickAction(action){var node=document.querySelector('[data-action="'+action+'"]');if(!node)return false;node.click();return true;}
async function waitUntil(name,pred,limit){
  var started=performance.now();
  while(performance.now()-started<limit){if(pred())return performance.now()-started;await sleep(40);}
  var error=new Error(name+' 超时：'+bodyText().slice(0,140));
  error.elapsed=performance.now()-started;
  throw error;
}
async function runScenario(){
  var steps=[];
  var mark=function(name,ok,detail,ms){steps.push({name:name,ok:ok,detail:detail||'',ms:ms||0});if(!ok)throw new Error(name+'：'+detail);};
  var api=function(){return window.__DORO__;};
  await waitUntil('首页',function(){return bodyText().indexOf('开始拆')!==-1||bodyText().indexOf('继续拆')!==-1;},8000);
  var fresh=bodyText().indexOf('开始拆')!==-1;
  var t0=performance.now();
  clickAction(fresh?'start':'continue');
  var opened=await waitUntil('进入第一关',function(){return !document.querySelector('#board-loading')&&!!document.querySelector('canvas')&&api()&&api().engine&&api().engine.state.phase==='playing';},4000);
  mark('进入第一关',opened<=3000,document.readyState+' '+(opened|0)+'ms',opened);
  parent.postMessage({type:'doro-shot',name:'l1'},'*');
  await sleep(30);
  var collected=api().engine.state.collected.length;
  var guard=0;
  while(api().engine.state.collected.length<collected+3&&api().engine.state.phase==='playing'&&guard++<100){
    var witness=api().level.witness||[];
    var next=null;
    for(var w=0;w<witness.length;w++){
      var candidate=witness[w].screwId;
      var screw=api().engine.state.screws.find(function(item){return item.id===candidate;});
      if(screw&&screw.place==='board'){next=candidate;break;}
    }
    if(next&&api().engine.canPick(next)){api().pick(next);await sleep(50);}
    else await sleep(40);
  }
  mark('拆到装满一盒',api().engine.state.collected.length>=collected+3,'collected '+api().engine.state.collected.length+' moves '+api().engine.state.moves+' phase '+api().engine.state.phase);
  var moves=api().engine.state.moves;
  if(!clickAction('undo'))throw new Error('撤回：没有按钮');
  var undone=await waitUntil('撤回生效',function(){return api().engine.state.moves<moves;},2000);
  mark('撤回',api().engine.state.moves<moves,'moves '+moves+'→'+api().engine.state.moves,undone);
  var hints=api().engine.state.stats.hintsShown;
  mark('看一看',clickAction('hint'));
  await waitUntil('提示',function(){return api().engine.state.stats.hintsShown>hints;},5000);
  mark('提示已标出',api().engine.state.stats.hintsShown>hints,String(api().engine.state.stats.hintsShown));
  mark('免费辅助',clickAction('tools'));
  await waitUntil('辅助窗',function(){return bodyText().indexOf('化开一块玻璃')!==-1;},2000);
  clickAction('close-modal');
  mark('暂停',clickAction('pause'));
  await waitUntil('暂停页',function(){return bodyText().indexOf('继续拆')!==-1;},2000);
  clickAction('resume');
  await waitUntil('继续',function(){return !document.querySelector('.dialog');},2000);
  var sound=document.querySelector('[data-action="sound"]');
  var beforeSound=sound?sound.getAttribute('aria-label'):'';
  clickAction('sound');
  await sleep(40);
  sound=document.querySelector('[data-action="sound"]');
  mark('音效开关',!!sound&&sound.getAttribute('aria-label')!==beforeSound,beforeSound+'→'+(sound&&sound.getAttribute('aria-label')));
  clickAction('zoom-toggle');
  await sleep(40);
  var zoomBefore=(document.querySelector('#zoom-value')||{}).textContent||'';
  mark('视图',clickAction('zoom-in'));
  await sleep(40);
  mark('缩放',((document.querySelector('#zoom-value')||{}).textContent||'')!==zoomBefore||zoomBefore==='','zoom '+zoomBefore+'→'+((document.querySelector('#zoom-value')||{}).textContent||''));
  mark('怎么玩',clickAction('help'));
  await waitUntil('说明',function(){return bodyText().indexOf('怎么玩')!==-1;},2000);
  clickAction('close-modal');
  guard=0;
  while(api().engine.state.phase==='playing'&&guard++<40){
    var open=api().engine.state.boxes.map(function(box){return box.color;}).filter(function(color){return color!=null;});
    var choices=api().engine.state.screws.filter(function(screw){return screw.place==='board'&&api().engine.canPick(screw.id)&&open.indexOf(screw.color)<0;});
    if(!choices.length)choices=api().engine.state.screws.filter(function(screw){return screw.place==='board'&&api().engine.canPick(screw.id);});
    if(!choices.length)break;
    api().pick(choices[choices.length-1].id);
    await sleep(20);
  }
  mark('走入死局',api().engine.state.phase==='stuck',api().engine.state.phase);
  clickAction('pause');
  await waitUntil('重来入口',function(){return !!document.querySelector('[data-action="retry-same"]');},2000);
  clickAction('retry-same');
  if(document.querySelector('[data-action="confirm-launch"]'))clickAction('confirm-launch');
  var retried=await waitUntil('重来',function(){return api().engine&&api().engine.state.moves===0&&!document.querySelector('#board-loading')&&api().engine.state.phase==='playing';},5000);
  mark('重来',retried<=3000,'moves '+api().engine.state.moves,retried);
  guard=0;
  while(api().engine.state.phase!=='won'&&guard++<500){
    witness=api().level.witness||[];
    var winId=null;
    for(var n=0;n<witness.length;n++){
      var stepId=witness[n].screwId;
      var stepScrew=api().engine.state.screws.find(function(item){return item.id===stepId;});
      if(stepScrew&&stepScrew.place==='board'){winId=stepId;break;}
    }
    if(!winId)break;
    if(api().engine.canPick(winId)){api().pick(winId);await sleep(12);}
    else await sleep(25);
  }
  await waitUntil('脚本通关',function(){return api().engine.state.phase==='won';},4000);
  mark('脚本通关第一关',api().engine.state.phase==='won',String(api().engine.state.moves));
  var l2start=performance.now();
  api().startLevel(2);
  await waitUntil('第二关',function(){return api().level&&api().level.id===2&&api().engine&&api().engine.state.screws.length===120&&!document.querySelector('#board-loading')&&!!document.querySelector('canvas');},5000);
  var l2ms=performance.now()-l2start;
  mark('第二关棋盘',l2ms<=3000,'screws '+api().engine.state.screws.length+' '+l2ms+'ms',l2ms);
  parent.postMessage({type:'doro-shot',name:'l2'},'*');
  await sleep(30);
  clickAction('pause');
  await sleep(80);
  var snapshot={levelId:api().engine.state.levelId,moves:api().engine.state.moves,screws:api().engine.state.screws.length};
  return {steps:steps,snapshot:snapshot,entries:seed.slice()};
}
window.addEventListener('message',function(event){
  if(event.data&&event.data.type==='doro-flow'){
    runScenario().then(function(result){parent.postMessage({type:'doro-flow-done',ok:true,result:result},'*');}).catch(function(error){parent.postMessage({type:'doro-flow-done',ok:false,message:String(error&&error.message||error)},'*');});
    return;
  }
  if(event.data&&event.data.type==='doro-resume'){
    var expect=event.data.snapshot||{};
    (async function(){
      await waitUntil('恢复首页',function(){return bodyText().indexOf('继续拆')!==-1;},8000);
      var t=performance.now();
      clickAction('continue');
      await waitUntil('恢复对局',function(){return window.__DORO__&&window.__DORO__.engine&&window.__DORO__.engine.state.levelId===expect.levelId&&window.__DORO__.engine.state.moves===expect.moves&&!document.querySelector('#board-loading')&&!!document.querySelector('canvas');},5000);
      var ms=performance.now()-t;
      if(ms>3000)throw new Error('恢复棋盘超过 3 秒：'+ms);
      clickAction('pause');
      await waitUntil('退出入口',function(){return !!document.querySelector('[data-action="home"]');},2000);
      clickAction('home');
      await waitUntil('回到首页',function(){return bodyText().indexOf('开始拆')!==-1||bodyText().indexOf('继续拆')!==-1;},3000);
      parent.postMessage({type:'doro-resume-done',ok:true,ms:ms,text:bodyText().slice(0,80)},'*');
    })().catch(function(error){parent.postMessage({type:'doro-resume-done',ok:false,message:String(error&&error.message||error)},'*');});
    return;
  }
});
function tap(x,y){
  var target=document.elementFromPoint(x,y)||document.querySelector('canvas');
  if(!target)return;
  var down=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button:0,buttons:1});
  var up=new PointerEvent('pointerup',{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button:0,buttons:0});
  target.dispatchEvent(down);
  target.dispatchEvent(up);
}
window.addEventListener('message',function(event){
  if(event.data&&event.data.type==='doro-pick'){
    var canvas=document.querySelector('canvas');
    if(!canvas){parent.postMessage({type:'doro-pick',error:'no canvas'},'*');return;}
    var rect=canvas.getBoundingClientRect();
    var spots=[[.42,.38],[.58,.4],[.36,.55],[.64,.58],[.5,.48],[.48,.66]];
    var step=0;
    var run=function(){
      if(step>=spots.length){parent.postMessage({type:'doro-pick',text:(document.body&&document.body.innerText||'').slice(0,240),overlay:(document.querySelector('#board-loading')||{}).textContent||''},'*');return;}
      var spot=spots[step++];
      tap(rect.left+rect.width*spot[0],rect.top+rect.height*spot[1]);
      setTimeout(run,280);
    };
    run();
    return;
  }
  if(!event.data||event.data.type!=='doro-click')return;
  var button=document.querySelector('[data-action="start"],[data-action="continue"]');
  if(button)button.click();
  var wait=Number(event.data.wait)||2500;
  setTimeout(function(){
    var note=document.querySelector('.small-note');
    var canvas=document.querySelector('canvas');
    var loading=document.querySelector('#board-loading');
    parent.postMessage({type:'doro-level',text:(document.body&&document.body.innerText||'').slice(0,500),note:note?note.textContent:'',hasCanvas:!!canvas,readyState:document.readyState,overlay:loading?loading.textContent:'',canvas:canvas?{w:canvas.width,h:canvas.height,cw:canvas.clientWidth,ch:canvas.clientHeight}:null,violations:violations.slice()},'*');
  },wait);
});
parent.postMessage({type:'doro-origin',origin:String(location.origin)},'*');
})();`;
  if(stub.includes('</script')||appJs.includes('</script'))throw Error('内联脚本里出现了 </script');
  const csp=[
    "default-src 'none'",
    `script-src 'sha256-${sha256(stub)}' 'sha256-${sha256(appJs)}'`,
    `style-src 'sha256-${sha256(css)}'`,
    `img-src ${imgSrc}`,
    "connect-src 'none'",
    "worker-src 'none'",
    "frame-src 'none'",
    "font-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "require-trusted-types-for 'script'",
  ].join('; ');
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${css}</style></head><body><div id="app"></div><script>${stub}</script><script>${appJs}</script></body></html>`;
  return html;
}

const bootstrap=`<!doctype html><html><body><script>
window.addEventListener('message',function(event){
  var data=event.data||{};
  if(data.type!=='mount-package')return;
  document.open();
  document.write(data.html);
  if(data.close!==false)document.close();
});
parent.postMessage({type:'doro-bootstrap'},'*');
</script></body></html>`;

function isPlaywrightScreenshotStyle(message){
  return /^style-src-elem \| style-src-elem \| inline \| \d+ \|  \| $/.test(message);
}

export async function checkHostFrame({browser,webDir,shotPath,levelShot,device,closeDocument=true,imgSrc='blob: data:',clickWait=2500,seed=[]}){
  const html=packageHtml(webDir,imgSrc,seed);
  const context=await browser.newContext(device?{
    userAgent:device.userAgent,
    viewport:device.viewport,
    deviceScaleFactor:device.deviceScaleFactor,
    hasTouch:true,
    isMobile:false,
  }:{});
  const page=await context.newPage();
  const problems=[];
  const messages=[];
  try{
    await page.setContent('<!doctype html><title>host</title><body style="margin:0"><iframe id="box" sandbox="allow-scripts" style="width:390px;height:844px;border:0"></iframe></body>',{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      window.__msgs=[];
      window.addEventListener('message',event=>{if(event.data&&typeof event.data==='object')window.__msgs.push(event.data);});
    });
    await page.locator('#box').evaluate((node,srcdoc)=>{node.setAttribute('srcdoc',srcdoc);},bootstrap);
    await page.waitForFunction(()=>window.__msgs.some(item=>item.type==='doro-bootstrap'),null,{timeout:5000});
    const started=Date.now();
    await page.evaluate(payload=>{document.getElementById('box').contentWindow.postMessage({type:'mount-package',html:payload.html,close:payload.close},'*');},{html,close:closeDocument});
    try{
      await page.waitForFunction(()=>window.__msgs.some(item=>item.type==='doro-ready'),null,{timeout:30000});
    }catch{
      problems.push('没有收到 lifecycle.ready');
    }
    const readyMs=Date.now()-started;
    const ready=(await page.evaluate(()=>window.__msgs.find(item=>item.type==='doro-ready')))||null;
    const origin=(await page.evaluate(()=>window.__msgs.find(item=>item.type==='doro-origin'||item.origin)))||ready;
    if(!ready)problems.push('没有收到 lifecycle.ready');
    else{
      if(!(ready.ms<=3000))problems.push('lifecycle.ready 用了 '+ready.ms+' 毫秒，墙钟 '+readyMs);
      if(!String(ready.text||'').includes('正在打开'))problems.push('通知宿主时还没画出正在打开：'+String(ready.text||'').slice(0,80));
      if((ready.violations||[]).length)problems.push('lifecycle.ready 时已有违规：'+JSON.stringify(ready.violations));
    }
    try{await page.waitForFunction(()=>window.__msgs.some(item=>item.type==='doro-home'),null,{timeout:20000});}
    catch{problems.push('没有进入首页');}
    const beforeShot=await page.evaluate(()=>window.__msgs.slice());
    const home=beforeShot.find(item=>item.type==='doro-home')||null;
    if(home&&(home.violations||[]).length)problems.push('首页时已有违规：'+JSON.stringify(home.violations));
    const early=beforeShot.filter(item=>item.type==='doro-error'||item.type==='doro-violation');
    if(early.length)problems.push('启动时有异常或违规：'+JSON.stringify(early).slice(0,400));
    const harness=[];
    const appFaults=[];
    const noteShot=async file=>{
      const mark=beforeShot.length+messages.length;
      await page.locator('#box').screenshot({path:file});
      const now=await page.evaluate(()=>window.__msgs.slice());
      const delta=now.slice(mark);
      messages.push(...delta);
      for(const item of delta){
        if(item.type==='doro-violation'&&isPlaywrightScreenshotStyle(item.message))harness.push(item);
        else if(item.type==='doro-error'||item.type==='doro-violation')appFaults.push(item);
      }
      const sawBody=delta.some(item=>item.type==='doro-style'&&item.text==='body {}');
      if(delta.some(item=>item.type==='doro-violation'&&isPlaywrightScreenshotStyle(item.message))&&!sawBody){
        problems.push('截图时出现 style-src-elem，但没有看到 Playwright 插入的 body {}');
      }
    };
    await noteShot(shotPath);
    if(ready){
      await page.evaluate(wait=>{document.getElementById('box').contentWindow.postMessage({type:'doro-click',wait},'*');},clickWait);
      try{await page.waitForFunction(()=>window.__msgs.some(item=>item.type==='doro-level'),null,{timeout:clickWait+8000});}
      catch{problems.push('点开始后没有进入第一关');}
      const played=await page.evaluate(()=>window.__msgs.slice());
      for(const item of played.slice(beforeShot.length+messages.length)){
        if(item.type==='doro-error'||item.type==='doro-violation')appFaults.push(item);
        messages.push(item);
      }
      if(levelShot)await noteShot(levelShot);
    }
    const level=await page.evaluate(()=>window.__msgs.find(item=>item.type==='doro-level')||null);
    if(ready&&level&&!level.hasCanvas&&!String(level.text||'').includes('夹层'))problems.push('点开始后没有棋盘：'+String(level&&level.text||'').slice(0,120));
    if(appFaults.length)problems.push('应用自身的异常或违规：'+JSON.stringify(appFaults).slice(0,400));
    const originValue=String((ready&&ready.origin)||(origin&&origin.origin)||'');
    if(originValue!=='null')problems.push('沙箱 origin 不是 null：'+originValue);
    const styles=[...beforeShot,...messages].filter(item=>item.type==='doro-style');
    return {ok:problems.length===0,readyMs,ready,level,problems,shotPath,styles,harnessViolations:harness.length,appViolations:appFaults};
  }finally{
    await context.close();
  }
}
