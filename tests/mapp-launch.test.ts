import test from 'node:test';
import assert from 'node:assert/strict';
import {launchMiniApp,prioritizeStartup} from '../src/mapp/launch';
import {setAssetResolver} from '../src/art';

test('启动清单把首页图排到前面，并跳过战役 JSON',()=>{
  const order=prioritizeStartup([
    'runtime/album-1.b63fd5128b.webp',
    'campaign/r4/level-1.json',
    'runtime/backdrop.f2f74c12ed.webp',
    'runtime/logo.57a8a59d36.webp',
    'runtime/screws-atlas.24e06b5501.webp',
  ]);
  assert.deepEqual(order.slice(0,2),[
    'runtime/backdrop.f2f74c12ed.webp',
    'runtime/logo.57a8a59d36.webp',
  ]);
  assert.equal(order.includes('campaign/r4/level-1.json'),false);
  assert.equal(order.at(-1),'runtime/screws-atlas.24e06b5501.webp');
});

async function exclusive(run){
  const previous=globalThis.__doroDomLock||Promise.resolve();
  let release;
  globalThis.__doroDomLock=new Promise(resolve=>{release=resolve;});
  await previous;
  try{return await run();}
  finally{release();}
}
test('lifecycle.ready 不等待素材读取和 bootGame',async()=>{
  await exclusive(async()=>{
  const events:string[]=[];
  let readsAtReady=0;
  let reads=0;
  const app={text:'',replaceChildren(node){this.text=node.textContent;}};
  const element={
    classList:{add(){},toggle(){}},
    style:{setProperty(){},background:''},
    dataset:{},
  };
  const previous={
    document:globalThis.document,
    window:globalThis.window,
    localStorage:Object.getOwnPropertyDescriptor(globalThis,'localStorage'),
    indexedDB:Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),
  };
  Object.assign(globalThis,{
    document:{
      documentElement:element,
      body:element,
      querySelector:(selector:string)=>selector==='#app'?app:null,
      createElement:()=>({className:'',textContent:'',setAttribute(){}}),
    },
    window:{addEventListener(){}},
  });
  try{
    const sdk={
      ready:Promise.resolve(),
      permissions:{has:()=>true},
      lifecycle:{ready:async()=>{readsAtReady=reads;events.push('ready');}},
      theme:{
        async get(){return {mode:'light',background:'#fff',text:'#111',reducedMotion:false};},
        onChange:()=>()=>{},
      },
      localStorage:{exportData:async()=>{throw Error('storage down');}},
      assets:{
        readJson:async()=>['runtime/logo.webp','runtime/screws.webp'],
        readBytes:async()=>{
          reads++;
          await new Promise(resolve=>setTimeout(resolve,15));
          return new Uint8Array([1,2,3]);
        },
      },
      files:{save:async()=>{}},
    };
    await launchMiniApp(sdk as never,async()=>{events.push('boot');});
    assert.deepEqual(events,['ready','boot']);
    assert.equal(readsAtReady,0);
    assert.ok(reads>=2);
    assert.equal(app.text,'正在打开…');
  }finally{
    setAssetResolver(null);
    globalThis.document=previous.document;
    globalThis.window=previous.window;
    if(previous.localStorage)Object.defineProperty(globalThis,'localStorage',previous.localStorage);
    else delete (globalThis as {localStorage?:unknown}).localStorage;
    if(previous.indexedDB)Object.defineProperty(globalThis,'indexedDB',previous.indexedDB);
    else delete (globalThis as {indexedDB?:unknown}).indexedDB;
  }
  });
});
