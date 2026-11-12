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
