/** 用 createElement 组装界面，避免需要 TrustedHTML 的写入。 */

const VOID_TAGS=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr','path','feturbulence','fedisplacementmap']);
const SVG_NS='http://www.w3.org/2000/svg';
const SVG_TAGS=new Set(['svg','path','filter','feturbulence','fedisplacementmap']);

function decode(value:string):string{
  return value.replace(/&(#x?[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,entity=>{
    if(entity==='&amp;')return '&';
    if(entity==='&lt;')return '<';
    if(entity==='&gt;')return '>';
    if(entity==='&quot;')return '"';
    if(entity==='&apos;')return "'";
    const hex=entity.startsWith('&#x')||entity.startsWith('&#X');
    const code=hex?Number.parseInt(entity.slice(3,-1),16):Number.parseInt(entity.slice(2,-1),10);
    return Number.isFinite(code)?String.fromCodePoint(code):entity;
  });
}

function applyPaint(element:HTMLElement|SVGElement):void{
  const bg=element.getAttribute('data-art-bg');
  if(bg!=null){
    element.style.setProperty('background-image',`url("${bg.replace(/"/g,'')}")`);
    const ratio=element.getAttribute('data-art-ratio');
    if(ratio)element.style.setProperty('aspect-ratio',ratio);
    element.removeAttribute('data-art-bg');
    element.removeAttribute('data-art-ratio');
  }
  const css=element.getAttribute('data-css');
  if(css!=null){
    for(const part of css.split(';')){
      const split=part.indexOf(':');
      if(split<=0)continue;
      element.style.setProperty(part.slice(0,split).trim(),part.slice(split+1).trim());
    }
    element.removeAttribute('data-css');
  }
}

function applyAttributes(element:HTMLElement|SVGElement,attrs:Array<[string,string]>):void{
  for(const [name,value] of attrs){
    const lower=name.toLowerCase();
    if(lower.startsWith('on'))throw Error('界面不能带事件属性：'+name);
    if((lower==='href'||lower==='src'||lower==='xlink:href')&&/^\s*javascript:/i.test(value))throw Error('界面不能带脚本地址');
    if(lower==='style'||lower==='data-css'){
      const css=lower==='style'?value:value;
      for(const part of css.split(';')){
        const split=part.indexOf(':');
        if(split<=0)continue;
        element.style.setProperty(part.slice(0,split).trim(),part.slice(split+1).trim());
      }
      continue;
    }
    if(lower==='class'){element.setAttribute('class',value);continue;}
    if(value===''&&(lower==='hidden'||lower==='disabled'||lower==='readonly'||lower==='checked')){
      element.setAttribute(lower,'');
      continue;
    }
    element.setAttribute(name,value);
  }
  if(element instanceof HTMLElement||element instanceof SVGElement)applyPaint(element);
}

function create(tag:string):HTMLElement|SVGElement{
  const lower=tag.toLowerCase();
  if(lower==='script'||lower==='iframe'||lower==='object'||lower==='embed')throw Error('界面不能包含 '+tag);
  if(SVG_TAGS.has(lower))return document.createElementNS(SVG_NS,tag);
  return document.createElement(tag);
}

export function parseMarkup(html:string):DocumentFragment{
  const root=document.createDocumentFragment();
  const stack:Array<HTMLElement|SVGElement>=[];
  let index=0;
  const parent=()=>stack[stack.length-1]??root;
  while(index<html.length){
    if(html[index]!=='<'){
      const next=html.indexOf('<',index);
      const end=next<0?html.length:next;
      const text=decode(html.slice(index,end));
      if(text)parent().appendChild(document.createTextNode(text));
      index=end;
      continue;
    }
    if(html.charCodeAt(index)===60&&html.charCodeAt(index+1)===33&&html.charCodeAt(index+2)===45&&html.charCodeAt(index+3)===45){
      const end=html.indexOf('-->',index);
      index=end<0?html.length:end+3;
      continue;
    }
    if(html.startsWith('</',index)){
      const match=/^<\/([A-Za-z][\w:-]*)\s*>/.exec(html.slice(index));
      if(!match)throw Error('界面标签没有合上');
      const name=match[1].toLowerCase();
      while(stack.length&&stack[stack.length-1].tagName.toLowerCase()!==name)stack.pop();
      stack.pop();
      index+=match[0].length;
      continue;
    }
    const open=/^<([A-Za-z][\w:-]*)/.exec(html.slice(index));
    if(!open)throw Error('界面里有无法识别的标签');
    index+=open[0].length;
    const tag=open[1];
    const attrs:Array<[string,string]>=[];
    let selfClose=false;
    while(index<html.length){
      while(html[index]===' '||html[index]==='\n'||html[index]==='\r'||html[index]==='\t')index++;
      if(html[index]==='>'){index++;break;}
      if(html[index]==='/'&&html[index+1]==='>'){selfClose=true;index+=2;break;}
      const attr=/^([^\s=\/>]+)/.exec(html.slice(index));
      if(!attr)throw Error('界面属性无法识别');
      index+=attr[0].length;
      let value='';
      if(html[index]==='='){
        index++;
        const quote=html[index];
        if(quote==='"'||quote==="'"){
          const end=html.indexOf(quote,index+1);
          if(end<0)throw Error('界面属性引号没有合上');
          value=decode(html.slice(index+1,end));
          index=end+1;
        }else{
          const raw=/^[^\s>/]+/.exec(html.slice(index));
          value=decode(raw?raw[0]:'');
          index+=value.length;
        }
      }
      attrs.push([attr[1],value]);
    }
    const element=create(tag);
    applyAttributes(element,attrs);
    parent().appendChild(element);
    if(!selfClose&&!VOID_TAGS.has(tag.toLowerCase()))stack.push(element);
  }
  return root;
}

export function fill(target:Element,html:string):void{
  const fragment=parseMarkup(html);
  target.replaceChildren(fragment);
}

export function appendMarkup(target:Element,html:string):void{
  target.append(parseMarkup(html));
}
