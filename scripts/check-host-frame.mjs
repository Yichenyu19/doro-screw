import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

function sha256(text){
  return createHash('sha256').update(text).digest('base64');
}

function packageHtml(webDir){
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
document.addEventListener('securitypolicyviolation',function(event){
  var message=[event.effectiveDirective,event.violatedDirective,event.blockedURI,event.lineNumber,event.sourceFile,(event.sample||'').slice(0,120)].join(' | ');
  violations.push(message);
  parent.postMessage({type:'doro-violation',message:message},'*');
});
window.addEventListener('error',function(event){
  parent.postMessage({type:'doro-error',message:String(event.message||'')},'*');
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
window.miniApp={
  ready:Promise.resolve(),
  permissions:{has:function(){return true;}},
  lifecycle:{ready:function(){
    parent.postMessage({type:'doro-ready',ms:performance.now()-started,origin:String(location.origin),text:(document.querySelector('#app')||{}).textContent||'',violations:violations.slice()},'*');
    return Promise.resolve();
  }},
  theme:{get:function(){return Promise.resolve({mode:'light',background:'#fff8f2',text:'#3b1d28',reducedMotion:false,locale:'zh_CN',accent:'#000',border:'#ccc'});},onChange:function(){return function(){};}},
  localStorage:{exportData:function(){return Promise.resolve({format:1,entries:[]});},setItem:function(){return Promise.resolve();},removeItem:function(){return Promise.resolve();},clear:function(){return Promise.resolve();}},
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
window.addEventListener('message',function(event){
  if(!event.data||event.data.type!=='doro-click')return;
  var button=document.querySelector('[data-action="start"],[data-action="continue"]');
  if(button)button.click();
  setTimeout(function(){
    var note=document.querySelector('.small-note');
    parent.postMessage({type:'doro-level',text:(document.body&&document.body.innerText||'').slice(0,500),note:note?note.textContent:'',hasCanvas:!!document.querySelector('canvas'),violations:violations.slice()},'*');
  },2500);
});
parent.postMessage({type:'doro-origin',origin:String(location.origin)},'*');
})();`;
  if(stub.includes('</script')||appJs.includes('</script'))throw Error('内联脚本里出现了 </script');
  const csp=[
    "default-src 'none'",
    `script-src 'sha256-${sha256(stub)}' 'sha256-${sha256(appJs)}'`,
    `style-src 'sha256-${sha256(css)}'`,
    "img-src blob: data:",
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
  document.close();
});
parent.postMessage({type:'doro-bootstrap'},'*');
</script></body></html>`;

function isPlaywrightScreenshotStyle(message){
  return /^style-src-elem \| style-src-elem \| inline \| \d+ \|  \| $/.test(message);
}

export async function checkHostFrame({browser,webDir,shotPath,levelShot,device}){
  const html=packageHtml(webDir);
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
    await page.evaluate(payload=>{document.getElementById('box').contentWindow.postMessage({type:'mount-package',html:payload},'*');},html);
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
      await page.evaluate(()=>{document.getElementById('box').contentWindow.postMessage({type:'doro-click'},'*');});
      try{await page.waitForFunction(()=>window.__msgs.some(item=>item.type==='doro-level'),null,{timeout:20000});}
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
