/**
 * 彩蛋的小账本。只记装饰用的数字，独立于主存档键，丢失也不影响任何进度或成绩。
 * schema 1：{v:1, wallBumps, wallBroken, pokes}
 */
export const DELIGHT_KEY='doro-delight:v1';
export interface DelightLedger{v:1;wallBumps:number;wallBroken:boolean;pokes:number}
export const freshLedger=():DelightLedger=>({v:1,wallBumps:0,wallBroken:false,pokes:0});
const count=(value:unknown,cap=9999)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(cap,Math.floor(value)):0;

/** 读入任何旧形状或坏数据都回落为合法账本；未来 schema 也只取认得的字段。 */
export function normalizeLedger(raw:unknown):DelightLedger{
  if(!raw||typeof raw!=='object')return freshLedger();
  const data=raw as Record<string,unknown>;
  // schema 0（无 v 字段的早期草稿）：bumps → wallBumps。
  const bumps=data.v===undefined&&data.bumps!==undefined?data.bumps:data.wallBumps;
  return{v:1,wallBumps:count(bumps),wallBroken:data.wallBroken===true,pokes:count(data.pokes)};
}
export function loadLedger(storage:Pick<Storage,'getItem'>|null=typeof localStorage==='undefined'?null:localStorage):DelightLedger{
  try{const text=storage?.getItem(DELIGHT_KEY);return text?normalizeLedger(JSON.parse(text)):freshLedger();}catch{return freshLedger();}
}
export function saveLedger(ledger:DelightLedger,storage:Pick<Storage,'setItem'>|null=typeof localStorage==='undefined'?null:localStorage):boolean{
  try{storage?.setItem(DELIGHT_KEY,JSON.stringify(normalizeLedger(ledger)));return !!storage;}catch{return false;}
}
/** 撞墙计数：只在第二关主线真正卡住时加一；破墙后不再增长。 */
export function noteWallBump(ledger:DelightLedger):DelightLedger{return ledger.wallBroken?ledger:{...ledger,wallBumps:Math.min(9999,ledger.wallBumps+1)};}
export function noteWallBroken(ledger:DelightLedger):DelightLedger{return{...ledger,wallBroken:true};}
/** 粉笔记号按五画一组（四竖一斜），最多画 4 组，再多就只写数。 */
export function tallyGroups(n:number):{groups:number[];overflow:number}{
  const shown=Math.min(n,20),groups:number[]=[];
  for(let left=shown;left>0;left-=5)groups.push(Math.min(5,left));
  return{groups,overflow:Math.max(0,n-shown)};
}
