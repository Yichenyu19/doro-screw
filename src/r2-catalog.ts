export const R2_TOTALS=[15,120,129,135,141,156,156,168] as const;
export const R2_NAMES=['支点的代价','四角借路','花心有后手','先别装满','交叉路口','留给下一层','两岸接力','花心终局'] as const;
export const R2_TITLES=R2_NAMES.map((name,index)=>({id:index+1,name,total:R2_TOTALS[index]}));
export const PRACTICE_VARIANTS=6;
export function dailyPractice(now=new Date()):{theme:number;attempt:number;date:string}{
  const date=now.toISOString().slice(0,10),day=Math.floor(Date.parse(date+'T00:00:00Z')/86400000)-18262;
  return{theme:2+((day%7)+7)%7,attempt:Math.max(0,day),date};
}
