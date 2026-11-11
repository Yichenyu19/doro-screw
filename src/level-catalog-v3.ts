import type {StrategyTheme} from './types';
export const CAMPAIGN_COUNT=30;
export const CAMPAIGN_TOTALS=[15,120,129,135,141,156,156,168,162,195,180,186,192,177,198,204,189,210,201,216,198,213,219,204,222,216,225,210,228,228] as const;
export const THEME_INFO:Record<StrategyTheme,{name:string;strategy:string}>={
  quadrants:{name:'四区桥接',strategy:'先打开连接工区的桥，给另一边留入口'},
  interlock:{name:'左右互锁',strategy:'两边交替推进，避免把一边的钥匙压住'},
  embrace:{name:'中心环抱',strategy:'内外圈交替开口，留住两边的入口'},
  lattice:{name:'正交长板',strategy:'辨认交叉长板，优先解除共用的遮挡'},
  hinge:{name:'单钉开窗',strategy:'留下合适的支点，让玻璃摆开通道'},
  cascade:{name:'缓冲回流链',strategy:'把下一盒的颜色暂存，一颗触发连锁装箱'},
};
const rows:Array<[string,StrategyTheme]>=[
 ['先拆掉小烦恼','quadrants'],['四角大工程','quadrants'],['花心里的秘密','embrace'],['圆心里的来信','embrace'],['交错的糖纸','lattice'],['让玻璃转个身','hinge'],['两边都留一手','interlock'],['花瓣包围圈','embrace'],['星星的四扇门','quadrants'],['双环大作战','interlock'],['留住这一颗','hinge'],['玻璃方程式','lattice'],['一颗接两盒','cascade'],['花心午后茶','embrace'],['两岸来信','interlock'],['四角藏宝图','quadrants'],['回流休息站','cascade'],['摆开小麻烦','hinge'],['横竖都要看','lattice'],['环绕的好心情','embrace'],['三颗提前收','cascade'],['双线小队长','interlock'],['最后一个支点','hinge'],['花心放个假','embrace'],['格子糖工厂','lattice'],['Doro总动员','quadrants'],['左右接力赛','interlock'],['甜梦缓冲区','cascade'],['窗边的最后一钉','hinge'],['今天螺丝王','lattice'],
];
export const RELIEF_LEVELS=new Set([3,7,14,17,21,24,28]);
export const LEVEL_TITLES=rows.map(([name,theme],index)=>({id:index+1,name,theme,subtitle:index===0?'先存一颗，再让盒子接它回家':THEME_INFO[theme].strategy}));
export function themeFor(id:number):StrategyTheme{return id<=30?LEVEL_TITLES[id-1].theme:(['quadrants','interlock','embrace','lattice','hinge','cascade'] as const)[(id-31)%6];}
