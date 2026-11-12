export const R2_TOTALS=[15,120,129,135,141,156,156,168] as const;
export const R2_NAMES=['支点的代价','四角借路','花心有后手','先别装满','交叉路口','留给下一层','两岸接力','花心终局'] as const;
export const R2_TITLES=R2_NAMES.map((name,index)=>({id:index+1,name,total:R2_TOTALS[index]}));
export const R3_TOTALS=[15,24,48,48,129,135,141,156,156,168] as const;
export const R3_NAMES=['先装满一盒','先拆一座桥','桥下还有一层','四角借路','花心有后手','先别装满','交叉路口','留给下一层','两岸接力','花心终局'] as const;
export const R3_TITLES=R3_NAMES.map((name,index)=>({id:index+1,name,total:R3_TOTALS[index]}));
export const CAMPAIGN_TOTALS=[30,120,129,135,141,156,156,168] as const;
export const CAMPAIGN_NAMES=['夹层','四角借路','花心有后手','先别装满','交叉路口','留给下一层','两岸接力','花心终局'] as const;
export const CAMPAIGN_TITLES=CAMPAIGN_NAMES.map((name,index)=>({id:index+1,name,total:CAMPAIGN_TOTALS[index]}));
export const CAMPAIGN_COUNT=CAMPAIGN_TOTALS.length;
export const CAMPAIGN_TOTAL_PINS=CAMPAIGN_TOTALS.reduce((n,value)=>n+value,0);
export const PRACTICE_THEMES=[2,3,4,5,6,7,8] as const;
export const PRACTICE_VARIANTS=6;
export function practiceCampaignId(theme:number):number{return theme;}
/** 线上修订 2 的主线编号与修订 4 一一对应（第一关内容已换成夹层，通关记录仍记第 1 关）。 */
export function remapR2Completed(completed:number[]):number[]{
  return [...new Set(completed.filter(id=>id>=1&&id<=8))].sort((a,b)=>a-b);
}
export function remapR2Unlocked(unlocked:number,completed:number[]=[]):number{
  const mapped=Math.min(CAMPAIGN_COUNT+1,Math.max(1,unlocked));
  return Math.min(CAMPAIGN_COUNT+1,Math.max(mapped,...completed.map(id=>id+1)));
}
/** 未上线的修订 3 把 120 颗墙拆成第 2–4 关；只有三关短桥都打完才记修订 4 的第二关已通。 */
export function remapR3Completed(completed:number[]):number[]{
  const set=new Set(completed);
  const next=new Set<number>();
  if(set.has(1))next.add(1);
  if(set.has(2)&&set.has(3)&&set.has(4))next.add(2);
  for(const id of [5,6,7,8,9,10])if(set.has(id))next.add(id-2);
  return [...next].sort((a,b)=>a-b);
}
export function remapR3Unlocked(unlocked:number,completed:number[]=[]):number{
  const mapped=unlocked<=1?unlocked:unlocked<=4?2:unlocked-2;
  return Math.min(CAMPAIGN_COUNT+1,Math.max(1,mapped,...completed.map(id=>id+1)));
}
export const DAILY_EPOCH_DAY=18262;
export function utcDateString(now=new Date()):string{
  return new Date(now.getTime()).toISOString().slice(0,10);
}
export function dailyDayNumber(date:string):number{
  return Math.floor(Date.parse(date+'T00:00:00Z')/86400000)-DAILY_EPOCH_DAY;
}
export function dailyDateFromAttempt(attempt:number):string{
  return new Date((Math.max(0,attempt)+DAILY_EPOCH_DAY)*86400000).toISOString().slice(0,10);
}
export function dailyPractice(now=new Date()):{theme:number;attempt:number;date:string}{
  const date=utcDateString(now),day=dailyDayNumber(date);
  return{theme:2+((day%7)+7)%7,attempt:Math.max(0,day),date};
}
/** 精修局的主题与尝试号若恰好等于该日的共享种子，就是当天那一局（离线也可判定）。 */
export function isDailyBoard(theme:number,attempt:number,at=new Date(dailyDateFromAttempt(attempt)+'T12:00:00Z')):boolean{
  const daily=dailyPractice(at);
  return daily.theme===theme&&daily.attempt===attempt;
}
