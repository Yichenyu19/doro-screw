/**
 * Doro 的小日子：空闲小动作、连续直入盒的反应、首页戳一戳。
 * 全部只动装饰层（transform / 精灵帧），不碰规则、不吞输入、不出声劝人。
 */
export type IdleAct='peek'|'sneak'|'doze';
export const IDLE_FIRST_MS=22000;
export const IDLE_GAP_MS=15000;
export const IDLE_MAX_ACTS=3;

/** 第 n 次空闲动作演什么：前两次在偷看与偷螺丝之间轮换，第三次起睡着（直到有人碰）。 */
export function idleActFor(index:number,roll:number):IdleAct{
  if(index>=IDLE_MAX_ACTS-1)return'doze';
  return roll<.5?(index===0?'peek':'sneak'):(index===0?'sneak':'peek');
}
/** 距上次输入多久后该演第 index 次。 */
export function idleDueAt(index:number):number{return IDLE_FIRST_MS+index*IDLE_GAP_MS;}

export type StreakCue=null|'hop'|'cheer'|'sparkle';
/** 连续「拆下即入盒」的计数。进暂存就清零；撤回不加不减。 */
export function nextStreak(streak:number,wentToBuffer:boolean):{streak:number;cue:StreakCue}{
  if(wentToBuffer)return{streak:0,cue:null};
  const n=streak+1;
  return{streak:n,cue:n===4?'hop':n===8?'cheer':n>=12&&n%6===0?'sparkle':null};
}

/** 首页戳 Doro 的手势判定（纯函数，方便测）。 */
export interface PokeState{taps:number[];dodgedAt:number}
export const freshPoke=():PokeState=>({taps:[],dodgedAt:-Infinity});
export const POKE_WINDOW_MS=2200;
export const DIZZY_TAPS=5;
export const WISE_AFTER_POKES=30;
export function registerTap(state:PokeState,now:number,lifetimePokes:number):{state:PokeState;cue:'boing'|'dizzy'|'dodge'}{
  const recent=state.taps.filter(t=>now-t<POKE_WINDOW_MS),newRound=!recent.length&&now-state.dodgedAt>=POKE_WINDOW_MS;
  // 被戳够多次以后，Doro 学乖了：每一轮的第一下先躲开，第二下才戳得到。
  if(lifetimePokes>=WISE_AFTER_POKES&&newRound)return{state:{taps:[],dodgedAt:now},cue:'dodge'};
  const taps=[...recent,now];
  if(taps.length>=DIZZY_TAPS)return{state:{taps:[],dodgedAt:state.dodgedAt},cue:'dizzy'};
  return{state:{taps,dodgedAt:state.dodgedAt},cue:'boing'};
}
