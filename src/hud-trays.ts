import {sprite} from './art';
import {COLORS,COLOR_NAMES,type GameState,type Settings} from './types';
import type {PresentationDirector} from './presentation';

const content=new WeakMap<Element,string>();
const replace=(node:Element,html:string)=>{if(content.get(node)!==html){node.innerHTML=html;content.set(node,html);}};
const text=(node:Element,value:string)=>{if(node.textContent!==value)node.textContent=value;};
const attr=(node:Element,key:string,value:string)=>{if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
const cls=(node:Element,name:string,value:boolean)=>{if(node.classList.contains(name)!==value)node.classList.toggle(name,value);};

export function renderTrays(state:GameState,presenter:PresentationDirector|null,settings:Settings):void {
  const boxes=document.querySelector<HTMLElement>('#box-tray')!,buffer=document.querySelector<HTMLElement>('#buffer-tray')!;
  const columns=`repeat(${state.boxes.length},minmax(0,1fr))${state.boxes.length<4?' 44px':''}`;if(boxes.style.gridTemplateColumns!==columns)boxes.style.gridTemplateColumns=columns;
  if(boxes.dataset.count!==String(state.boxes.length)){
    boxes.dataset.count=String(state.boxes.length);boxes.innerHTML=state.boxes.map(b=>`<div class="box-slot" data-box-id="${b.id}"></div>`).join('')+(state.boxes.length<4?'<button class="add-box-compact" data-action="tools" aria-label="免费增加辅助收集盒"><b>+</b><small>辅助盒</small></button>':'');
  }
  for(const [index,box]of state.boxes.entries()){
    const node=boxes.children[index] as HTMLElement,color=box.color;
    if(node.dataset.color!==(color??'')){
      node.dataset.color=color??'';
      node.innerHTML=(color?sprite('cases',COLORS.indexOf(color),'box-art')+'<div class="box-screws">'+Array.from({length:3},()=>'<span class="box-hole">'+sprite('screws',8,'box-empty-hole')+'<span data-head></span></span>').join('')+'</div>':'')+'<span class="box-caption"></span><span class="box-next" hidden></span>';
    }
    attr(node,'data-generation',String(box.completed));cls(node,'box-packing',presenter?.closing.has(box.id)??false);cls(node,'box-finished',!color);
    attr(node,'aria-label',color?COLOR_NAMES[color]+'盒，已接收'+box.screws.length+'颗':'收集盒已完成');
    if(color)for(const [slot,hole]of [...node.querySelectorAll<HTMLElement>('.box-hole')].entries()){
      const id=box.screws[slot],arrived=!!id&&(presenter?.isArrived(id,box.id)??false);
      attr(hole,'data-received',String(!!id));attr(hole,'data-arrived',String(arrived));cls(hole,'slot-reserved',!!id&&!arrived);
      replace(hole.querySelector('[data-head]')!,id?sprite('heads',COLORS.indexOf(color),'mini-screw'):'');
    }
    text(node.querySelector('.box-caption')!,color?(settings.colorLabels?COLOR_NAMES[color]+' ':'')+box.screws.length+'/3':'已收好');
    const next=presenter?.nextColor(box.id),pending=presenter?.pendingCount(box.id)??0,label=node.querySelector<HTMLElement>('.box-next')!;label.hidden=!next;
    if(next)replace(label,`下盒 ${sprite('heads',COLORS.indexOf(next),'next-head')}${pending?' 已接'+pending:''}`);
  }
  if(buffer.dataset.count!==String(state.capacity)){
    buffer.dataset.count=String(state.capacity);buffer.innerHTML=state.buffer.map((_,i)=>`<div class="buffer-slot" data-buffer-slot="${i}">${sprite('screws',8,'hole-art')}<span data-head></span><small hidden></small></div>`).join('');
  }
  for(const [index,id]of state.buffer.entries()){
    const node=buffer.children[index] as HTMLElement,screw=id?state.screws.find(s=>s.id===id):null,arrived=!!id&&(presenter?.isArrived(id)??false);
    attr(node,'data-arrived',String(arrived));attr(node,'data-screw-id',id??'');cls(node,'slot-reserved',!!id&&!arrived);attr(node,'aria-label',screw?COLOR_NAMES[screw.color]+'，已接收':'空暂存孔');
    replace(node.querySelector('[data-head]')!,screw?sprite('heads',COLORS.indexOf(screw.color),'buffer-screw'):'');
    const label=node.querySelector('small')!;label.hidden=!screw||!settings.colorLabels;if(screw&&settings.colorLabels)text(label,COLOR_NAMES[screw.color]);
  }
}
