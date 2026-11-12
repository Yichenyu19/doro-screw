import test from 'node:test';
import assert from 'node:assert/strict';

class El {
  constructor(tag){this.tagName=tag;this.attrs=new Map();this.children=[];this.styleProps=new Map();this.style={setProperty:(key,value)=>this.styleProps.set(key,value)};}
  setAttribute(key,value){this.attrs.set(key,String(value));}
  getAttribute(key){return this.attrs.has(key)?this.attrs.get(key):null;}
  removeAttribute(key){this.attrs.delete(key);}
  appendChild(node){this.children.push(node);return node;}
  replaceChildren(...nodes){this.children=nodes.flatMap(node=>node?.fragment?node.children:[node]);}
}
class Frag { constructor(){this.fragment=true;this.children=[];} appendChild(node){this.children.push(node);return node;} }

async function exclusive(run){
  const previous=globalThis.__doroDomLock||Promise.resolve();
  let release;
  globalThis.__doroDomLock=new Promise(resolve=>{release=resolve;});
  await previous;
  try{return await run();}
  finally{release();}
}
async function withDom(run){
  const previous={document:globalThis.document,HTMLElement:globalThis.HTMLElement,SVGElement:globalThis.SVGElement};
  Object.assign(globalThis,{
    document:{
      createElement:tag=>new El(tag),
      createElementNS:(_ns,tag)=>new El(tag),
      createTextNode:text=>({text}),
      createDocumentFragment:()=>new Frag(),
    },
    HTMLElement:El,
    SVGElement:El,
  });
  try{await run();}
  finally{
    globalThis.document=previous.document;
    globalThis.HTMLElement=previous.HTMLElement;
    globalThis.SVGElement=previous.SVGElement;
  }
}

test('标记解析不留下 style 属性，背景走样式表接口',async()=>{
  await exclusive(()=>withDom(async()=>{
    const {fill}=await import('../src/markup.ts');
    const app=new El('div');
    fill(app,'<span class="art" data-art-bg="blob:art" data-art-ratio="2/1" aria-hidden="true"></span><button hidden>好</button>');
    const span=app.children[0];
    assert.equal(span.getAttribute('style'),null);
    assert.equal(span.getAttribute('data-art-bg'),null);
    assert.equal(span.styleProps.get('background-image'),'url("blob:art")');
    assert.equal(span.styleProps.get('aspect-ratio'),'2/1');
    assert.equal(app.children[1].getAttribute('hidden'),'');
    assert.equal(app.children[1].children[0].text,'好');
  }));
});

test('脚本标签、框架、事件属性和 javascript 地址会被拒绝',async()=>{
  await exclusive(()=>withDom(async()=>{
    const {fill}=await import('../src/markup.ts');
    const app=()=>new El('div');
    assert.throws(()=>fill(app(),'<script>alert(1)</script>'));
    assert.throws(()=>fill(app(),'<iframe src="https://example.com"></iframe>'));
    assert.throws(()=>fill(app(),'<object data="x"></object>'));
    assert.throws(()=>fill(app(),'<button onclick="alert(1)">坏</button>'));
    assert.throws(()=>fill(app(),'<a href="javascript:alert(1)">坏</a>'));
    assert.throws(()=>fill(app(),'<embed src="https://example.com"></embed>'));
  }));
});

test('事件属性会被拒绝',async()=>{
  await exclusive(()=>withDom(async()=>{
    const {fill}=await import('../src/markup.ts');
    assert.throws(()=>fill(new El('div'),'<button onclick="alert(1)">坏</button>'));
  }));
});
