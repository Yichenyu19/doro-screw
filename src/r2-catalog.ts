export const R2_TOTALS=[15,120,129,135,141,156,156,168] as const;
export const R2_NAMES=['支点的代价','四角借路','花心有后手','先别装满','交叉路口','留给下一层','两岸接力','花心终局'] as const;
export const R2_TITLES=R2_NAMES.map((name,index)=>({id:index+1,name,total:R2_TOTALS[index]}));
export const CAMPAIGN_TOTALS=[15,24,48,48,129,135,141,156,156,168] as const;
export const CAMPAIGN_NAMES=['支点的代价','先拆一座桥','桥下还有一层','四角借路','花心有后手','先别装满','交叉路口','留给下一层','两岸接力','花心终局'] as const;
export const CAMPAIGN_TITLES=CAMPAIGN_NAMES.map((name,index)=>({id:index+1,name,total:CAMPAIGN_TOTALS[index]}));
export const CAMPAIGN_COUNT=CAMPAIGN_TOTALS.length;
export const CAMPAIGN_TOTAL_PINS=CAMPAIGN_TOTALS.reduce((n,value)=>n+value,0);
export const PRACTICE_THEMES=[2,3,4,5,6,7,8] as const;
export const PRACTICE_VARIANTS=6;
export function practiceCampaignId(theme:number):number{return theme+2;}
export function remapR2Completed(completed:number[]):number[]{
  const map:Record<number,number[]>={1:[1],2:[2,3,4],3:[5],4:[6],5:[7],6:[8],7:[9],8:[10]};
  return [...new Set(completed.flatMap(id=>map[id]??[]))].sort((a,b)=>a-b);
}
export function remapR2Unlocked(unlocked:number,completed:number[]=[]):number{
  const mapped=unlocked<=1?unlocked:unlocked===2?2:unlocked+2;
  return Math.min(CAMPAIGN_COUNT+1,Math.max(1,mapped,...completed.map(id=>id+1)));
}
export function dailyPractice(now=new Date()):{theme:number;attempt:number;date:string}{
  const date=now.toISOString().slice(0,10),day=Math.floor(Date.parse(date+'T00:00:00Z')/86400000)-18262;
  return{theme:2+((day%7)+7)%7,attempt:Math.max(0,day),date};
}
