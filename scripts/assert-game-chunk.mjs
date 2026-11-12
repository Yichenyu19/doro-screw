import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

export function finalizeGameSource(code){
  const rewritten=code
    .replaceAll('new Function("return this")()','globalThis')
    .replaceAll('https://phaser.io','');
  if(rewritten===code)throw Error('没有找到需要去掉的运行时求值或默认外链，打包中止。');
  if(/\beval\b|new Function\b/.test(rewritten))throw Error('游戏分包仍含 eval 或 new Function。');
  return rewritten;
}

export function assertChunkShape(code){
  const re=/Promise\.resolve\(\)\.then\(\(\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\)/g;
  const forward=[];
  for(let match=re.exec(code);match;match=re.exec(code)){
    const name=match[1];
    const decl=code.search(new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`));
    if(decl<0||decl>match.index)forward.push(`${name}@${match.index}`);
  }
  if(forward.length)throw Error('游戏分包把动态导入内联成了指向后方绑定的前向引用：'+forward.join('，'));
  if(!/globalThis\.DoroGame\s*=\s*Object\.freeze\(\{\s*boot\s*:/.test(code))throw Error('游戏分包没有把 boot 交到 globalThis.DoroGame');
  if(/DoroGame\.boot\s*\(/.test(code))throw Error('游戏分包在顶层调用了 boot');
  const at=code.lastIndexOf('globalThis.DoroGame');
  const tail=code.slice(at);
  if(tail.length>300)throw Error('DoroGame 赋值不在文件末尾');
  if(!/\}\)\(\);?\s*$/.test(code))throw Error('游戏分包不是以 IIFE 结束');
}

function element(){
  const node=new Proxy(function(){},{
    get(_target,key){
      if(key==='style')return new Proxy({},{get:()=>'',set:()=>true});
      if(key==='classList')return {add(){},remove(){},toggle(){},contains:()=>false};
      if(key==='dataset')return {};
      if(key==='children'||key==='childNodes')return [];
      if(key==='then')return undefined;
      if(typeof key==='symbol')return undefined;
      if(key==='length'||key==='width'||key==='height'||key==='clientWidth'||key==='clientHeight')return 0;
      return element();
    },
    set(){return true;},
    apply(){return element();},
  });
  return node;
}

function syncPromiseClass(){
  function SyncPromise(executor){
    if(!(this instanceof SyncPromise))return new SyncPromise(executor);
    this.state='pending';
    this.value=undefined;
    this.handlers=[];
    const resolve=value=>{
      if(this.state!=='pending')return;
      if(value instanceof SyncPromise){value.then(resolve,reject);return;}
      this.state='fulfilled';
      this.value=value;
      this.handlers.splice(0).forEach(handler=>handler.onFulfilled&&handler.onFulfilled(value));
    };
    const reject=reason=>{
      if(this.state!=='pending')return;
      this.state='rejected';
      this.value=reason;
      this.handlers.splice(0).forEach(handler=>handler.onRejected&&handler.onRejected(reason));
    };
    try{executor(resolve,reject);}catch(error){reject(error);}
  }
  SyncPromise.prototype.then=function(onFulfilled,onRejected){
    return new SyncPromise((resolve,reject)=>{
      const run=handler=>value=>{
        try{
          const next=handler?handler(value):value;
          resolve(next);
        }catch(error){
          reject(error);
          throw error;
        }
      };
      if(this.state==='fulfilled')run(onFulfilled)(this.value);
      else if(this.state==='rejected'){
        if(onRejected)run(onRejected)(this.value);
        else reject(this.value);
      }else this.handlers.push({onFulfilled:value=>run(onFulfilled)(value),onRejected:reason=>{
        if(onRejected)run(onRejected)(reason);
        else reject(reason);
      }});
    });
  };
  SyncPromise.prototype.catch=function(onRejected){return this.then(undefined,onRejected);};
  SyncPromise.prototype.finally=function(onFinally){
    return this.then(value=>{onFinally?.();return value;},reason=>{onFinally?.();throw reason;});
  };
  SyncPromise.resolve=value=>new SyncPromise(resolve=>resolve(value));
  SyncPromise.reject=reason=>new SyncPromise((_resolve,reject)=>reject(reason));
  SyncPromise.all=items=>new SyncPromise((resolve,reject)=>{
    const list=[...items];
    const out=new Array(list.length);
    if(!list.length){resolve(out);return;}
    let left=list.length;
    list.forEach((item,index)=>SyncPromise.resolve(item).then(value=>{out[index]=value;if(--left===0)resolve(out);},reject));
  });
  SyncPromise.race=items=>new SyncPromise((resolve,reject)=>{
    for(const item of items)SyncPromise.resolve(item).then(resolve,reject);
  });
  SyncPromise.allSettled=items=>SyncPromise.all([...items].map(item=>SyncPromise.resolve(item).then(value=>({status:'fulfilled',value}),reason=>({status:'rejected',reason}))));
  return SyncPromise;
}

function makeSandbox(syncThen){
  const noop=()=>{};
  const sandbox={
    console,
    setTimeout,clearTimeout,setInterval:()=>0,clearInterval:noop,
    requestAnimationFrame:()=>1,cancelAnimationFrame:noop,
    queueMicrotask,performance:{now:()=>Date.now()},
    navigator:{userAgent:'vm',language:'zh-CN',maxTouchPoints:1,platform:'iPhone'},
    location:{href:'http://127.0.0.1/',search:'',pathname:'/',hostname:'127.0.0.1'},
    history:{pushState:noop,replaceState:noop,state:null},
    devicePixelRatio:2,innerWidth:390,innerHeight:844,screen:{width:390,height:844},
    getComputedStyle:()=>new Proxy({},{get:()=>''}),
    matchMedia:()=>({matches:false,addListener:noop,removeListener:noop,addEventListener:noop,removeEventListener:noop}),
    URL,URLSearchParams,Blob,TextEncoder,TextDecoder,atob,btoa,
    Map,Set,WeakMap,WeakSet,WeakRef,Symbol,Proxy,Reflect,Object,Array,String,Number,Boolean,BigInt,Date,Math,JSON,RegExp,
    Error,TypeError,RangeError,ReferenceError,SyntaxError,URIError,EvalError,AggregateError,Intl,
    parseInt,parseFloat,isNaN,isFinite,NaN,Infinity,undefined,
    encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,escape,unescape,
    structuredClone,crypto:{getRandomValues:(array)=>array,randomUUID:()=>'00000000-0000-4000-8000-000000000000'},
    HTMLElement:class{},Element:class{},Node:class{},SVGElement:class{},Image:class{set src(_value){}},
    Event:class{},CustomEvent:class{},
    Audio:class{play(){return Promise.resolve();}pause(){}},
    AudioContext:class{constructor(){this.destination={};this.state='running';}createGain(){return {gain:{value:1},connect:noop};}createBufferSource(){return {connect:noop,start:noop,stop:noop};}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){return Promise.resolve();}},
    addEventListener:noop,removeEventListener:noop,dispatchEvent:()=>true,
    visualViewport:{width:390,height:844,addEventListener:noop,removeEventListener:noop},
    getSelection:()=>null,scrollTo:noop,focus:noop,
    webkitAudioContext:class{},
    MutationObserver:class{observe(){}disconnect(){}},
    ResizeObserver:class{observe(){}disconnect(){}},
    IntersectionObserver:class{observe(){}disconnect(){}},
    Promise:syncThen?syncPromiseClass():Promise,
  };
  sandbox.globalThis=sandbox;
  sandbox.window=sandbox;
  sandbox.self=sandbox;
  sandbox.top=sandbox;
  sandbox.parent=sandbox;
  sandbox.document={
    documentElement:element(),
    body:element(),
    head:element(),
    hidden:false,
    visibilityState:'visible',
    readyState:'complete',
    addEventListener:noop,
    removeEventListener:noop,
    createElement:()=>element(),
    createElementNS:()=>element(),
    createTextNode:text=>({textContent:text}),
    createDocumentFragment:()=>element(),
    querySelector:()=>element(),
    querySelectorAll:()=>[element()],
    getElementById:()=>element(),
    getElementsByTagName:()=>[element()],
    hasFocus:()=>true,
    adoptNode:node=>node,
    importNode:node=>node,
  };
  sandbox.navigator.userAgentData={mobile:true,brands:[]};
  return sandbox;
}

function hostStub(){
  const ctor=function(){return element();};
  return new Proxy(ctor,{
    get(target,key){
      if(key==='prototype')return target.prototype;
      if(key===Symbol.hasInstance)return ()=>false;
      return element();
    },
    construct(){return element();},
    apply(){return element();},
  });
}

export async function executeGameChunk(code,{syncThen}){
  const wrapped=`(function(){\n${code}\n})()`;
  const stubs=new Map();
  let lastError;
  for(let attempt=0;attempt<40;attempt++){
    const sandbox=makeSandbox(syncThen);
    for(const [name,value] of stubs)sandbox[name]=value;
    const context=vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}});
    const rejections=[];
    const onRejection=reason=>rejections.push(reason);
    if(!syncThen)process.on('unhandledRejection',onRejection);
    try{
      vm.runInContext(wrapped,context,{timeout:15000});
      if(!syncThen){
        await new Promise(resolve=>setImmediate(resolve));
        await new Promise(resolve=>setImmediate(resolve));
      }
      if(rejections.length)throw rejections[0];
      return {
        syncThen,
        booted:sandbox.__DORO_GAME_CHUNK__===true,
        boot:typeof sandbox.DoroGame?.boot,
        stubs:[...stubs.keys()],
      };
    }catch(error){
      lastError=error;
      const missing=/^([A-Za-z_$][\w$]*) is not defined$/.exec(error?.message||'');
      if(!missing||stubs.has(missing[1]))throw error;
      stubs.set(missing[1],hostStub());
    }finally{
      if(!syncThen)process.off('unhandledRejection',onRejection);
    }
  }
  throw lastError;
}

export async function assertGameChunkSource(code){
  assertChunkShape(code);
  const sync=await executeGameChunk(code,{syncThen:true});
  const micro=await executeGameChunk(code,{syncThen:false});
  for(const result of [sync,micro]){
    if(result.booted)throw Error((result.syncThen?'同步 then':'正常微任务')+' 执行分包时已经启动了游戏');
    if(result.boot!=='function')throw Error((result.syncThen?'同步 then':'正常微任务')+' 执行后没有 globalThis.DoroGame.boot');
  }
  return {sync,micro,tail:code.slice(-300)};
}

export async function assertGameChunkFile(file){
  const code=await readFile(file,'utf8');
  return assertGameChunkSource(code);
}

function nullDocument(){
  const failures=[];
  const listen=(target,name)=>{
    try{
      if(target==null)throw new TypeError('addEventListener on null');
    }catch(error){failures.push(String(error));}
    return function(){};
  };
  const doc={
    currentScript:null,
    hidden:false,
    visibilityState:'visible',
    readyState:'complete',
    documentElement:{classList:{add(){},remove(){},toggle(){}},style:{}},
    body:null,
    head:{appendChild(){},removeChild(){}},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    getElementById(){return null;},
    getElementsByTagName(){return [];},
    createElement(){
      const node={style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},appendChild(){},removeChild(){},addEventListener(){},removeEventListener(){},width:300,height:150,childNodes:[],children:[]};
      node.getContext=()=>({canvas:node,fillRect(){},clearRect(){},getImageData:()=>({data:new Uint8Array(4)}),putImageData(){},createImageData:()=>({}),setTransform(){},drawImage(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},translate(){},scale(){},rotate(){},arc(){},fill(){},measureText:()=>({width:0}),transform(){},rect(){},clip(){},createLinearGradient:()=>({addColorStop(){}})});
      node.getBoundingClientRect=()=>({width:0,height:0,top:0,left:0,right:0,bottom:0});
      return node;
    },
    createElementNS(){return {style:{},setAttribute(){},appendChild(){}};},
    createTextNode(text){return {textContent:text};},
    createDocumentFragment(){return {appendChild(){},children:[]};},
    addEventListener:listen({}),
    removeEventListener(){},
    hasFocus(){return false;},
  };
  return {doc,failures};
}

export function executePackedAppBare(code){
  const {doc,failures}=nullDocument();
  const sandbox={
    console,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},
    document:doc,
    addEventListener(){},
    removeEventListener(){},
    requestAnimationFrame:()=>1,
    cancelAnimationFrame(){},
    navigator:{userAgent:'vm',language:'zh-CN'},
    location:{href:'http://127.0.0.1/',search:'',pathname:'/'},
    performance:{now:()=>0},
    devicePixelRatio:1,
    getComputedStyle:()=>({}),
    matchMedia:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}),
    HTMLElement:class{},Element:class{},Node:class{},HTMLCanvasElement:class{},SVGElement:class{},
    Image:class{set src(_value){}},
    Audio:class{},
    AudioContext:class{constructor(){throw Error('加载时不能创建 AudioContext');}},
    __code:code,
  };
  sandbox.window=sandbox;
  sandbox.self=sandbox;
  sandbox.globalThis=sandbox;
  vm.runInContext('new Function(__code)()',vm.createContext(sandbox),{timeout:15000});
  if(failures.length)throw Error('addEventListener 失败：'+failures.join(' | '));
  if(sandbox.__DORO__||sandbox.__DORO_GAME_CHUNK__)throw Error('new Function 执行时已经启动了游戏');
  if(typeof sandbox.DoroGame?.boot!=='function')throw Error('new Function 执行后没有启动函数');
  return {booted:false,boot:'function',listenerFailures:failures.length};
}

export async function executePackedAppWithApp(code){
  const {JSDOM}=await import('jsdom');
  const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://127.0.0.1/?check=1',pretendToBeVisual:true});
  const win=dom.window;
  win.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  if(!win.requestAnimationFrame)win.requestAnimationFrame=()=>1;
  const fakeContext=()=>new Proxy({canvas:{}},{
    get(target,key){if(key in target)return target[key];return ()=>fakeContext();},
    set(target,key,value){target[key]=value;return true;},
  });
  win.HTMLCanvasElement.prototype.getContext=()=>fakeContext();
  const sdk={
    ready:Promise.resolve(),
    permissions:{has:()=>true},
    lifecycle:{ready:async()=>{}},
    theme:{async get(){return {mode:'light',background:'#fff',text:'#111',reducedMotion:false,locale:'zh_CN',accent:'#000',border:'#ccc'};},onChange:()=>()=>{}},
    localStorage:{exportData:async()=>({format:1,entries:[]}),setItem:async()=>{},removeItem:async()=>{},clear:async()=>{}},
    assets:{readJson:async()=>[],readBytes:async()=>new Uint8Array(),readText:async()=>'[]'},
    files:{save:async()=>{}},
  };
  const timers=new Set();
  const sandbox={
    console,
    setTimeout:(fn,ms,...args)=>{const id=setTimeout(fn,ms,...args);id.unref?.();return id;},
    clearTimeout,
    setInterval:(fn,ms,...args)=>{const id=setInterval(fn,ms,...args);id.unref?.();timers.add(id);return id;},
    clearInterval:(id)=>{timers.delete(id);clearInterval(id);},
    document:win.document,navigator:win.navigator,localStorage:win.localStorage,location:win.location,history:win.history,
    performance:win.performance,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,Image:win.Image,Audio:win.Audio,
    SVGElement:win.SVGElement,HTMLCanvasElement:win.HTMLCanvasElement,MutationObserver:win.MutationObserver,
    ResizeObserver:win.ResizeObserver||class{observe(){}disconnect(){}},
    requestAnimationFrame:callback=>win.requestAnimationFrame(callback),
    cancelAnimationFrame:id=>win.cancelAnimationFrame?.(id),
    addEventListener:(...args)=>win.addEventListener(...args),
    removeEventListener:(...args)=>win.removeEventListener(...args),
    getComputedStyle:element=>win.getComputedStyle(element),
    matchMedia:query=>win.matchMedia(query),
    devicePixelRatio:1,
    innerWidth:390,innerHeight:844,
    URL,URLSearchParams,Blob,TextEncoder,TextDecoder,atob,btoa,crypto,fetch,Headers,Request,Response,queueMicrotask,structuredClone,
    FormData:globalThis.FormData||class FormData{},
    File:globalThis.File||class File{},
    FileReader:globalThis.FileReader||class FileReader{},
    DOMParser:globalThis.DOMParser||class DOMParser{parseFromString(){return null;}},
    XMLHttpRequest:globalThis.XMLHttpRequest||class XMLHttpRequest{},
    WebSocket:globalThis.WebSocket||class WebSocket{},
    Worker:globalThis.Worker||class Worker{},
    visualViewport:{width:390,height:844,addEventListener(){},removeEventListener(){}},
    miniApp:sdk,
    __code:code,
  };
  sandbox.window=sandbox;
  sandbox.self=sandbox;
  sandbox.globalThis=sandbox;
  try{
    vm.runInContext('new Function(__code)()',vm.createContext(sandbox),{timeout:15000});
    const loaded=win.document.querySelector('#app')?.textContent||'';
    if(/开始拆|继续拆/.test(loaded))throw Error('加载本身已经进入首页');
    if(typeof sandbox.DoroGame?.boot!=='function')throw Error('jsdom 执行后没有启动函数');
    await sandbox.DoroGame.boot();
    const home=win.document.querySelector('#app')?.textContent||'';
    if(!/开始拆|继续拆/.test(home))throw Error('调用启动函数后没有首页：'+home.slice(0,120));
    return {loaded:loaded.slice(0,40),home:true};
  }finally{
    for(const id of timers)clearInterval(id);
    win.close();
  }
}

export function assertAppStatic(code,manifest){
  if(manifest?.permissions?.includes('code.load'))throw Error('清单仍申请了 code.load');
  if(manifest?.code?.scripts?.length)throw Error('清单仍声明了 code.scripts');
  if(JSON.stringify(manifest?.assets||[]).includes('chunks/game.js'))throw Error('清单资源仍包含 chunks/game.js');
  if(code.includes('</script'))throw Error('app.js 含有 </script');
  if(/\bnew Function\b|\beval\s*\(|innerHTML|outerHTML|insertAdjacentHTML/.test(code))throw Error('app.js 仍有 innerHTML、eval 或 new Function');
  if(/Promise\.resolve\(\)\.then\(\(\)\s*=>\s*[A-Za-z_$]/.test(code)){
    const re=/Promise\.resolve\(\)\.then\(\(\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\)/g;
    const forward=[];
    for(let match=re.exec(code);match;match=re.exec(code)){
      const decl=code.search(new RegExp(`\\b(?:const|let|var|function)\\s+${match[1]}\\b`));
      if(decl<0||decl>match.index)forward.push(match[1]);
    }
    if(forward.length)throw Error('app.js 仍有前向引用：'+forward.join(','));
  }
}

export async function assertPackedApp(code,manifest){
  assertAppStatic(code,manifest);
  const bare=executePackedAppBare(code);
  const home=await executePackedAppWithApp(code);
  return {bare,home,head:code.slice(0,180),tail:code.slice(-300)};
}
