import type {GameState} from './types';

/** 静态定义仅共享只读引用；所有会被规则或物理修改的字段单独复制。 */
export function copyState(state:GameState):GameState {
  const result:GameState={...state,boards:state.boards.map(board=>({...board})),screws:state.screws.map(screw=>({...screw})),
    boxes:state.boxes.map(box=>({...box,screws:[...box.screws]})),buffer:[...state.buffer],pocket:[...state.pocket],collected:[...state.collected],
    stats:{...state.stats,assists:{...state.stats.assists}},
    ...(state.revealState?{revealState:{...state.revealState,opened:[...state.revealState.opened]}}:{})};
  for(const key of ['goal','reveal','contentRevision','revealState','revealPlan','rewardableIds'] as const)if(result[key]===undefined)delete result[key];
  return result;
}

/** 动作前态是共享只读契约，冻结能阻止展示层意外破坏撤回历史。 */
export function freezeState(state:GameState):GameState {
  for(const board of state.boards){if(!Object.isFrozen(board.screws)){board.screws.forEach(Object.freeze);Object.freeze(board.screws);}Object.freeze(board);}
  state.screws.forEach(Object.freeze);for(const box of state.boxes){Object.freeze(box.screws);Object.freeze(box);}
  for(const value of [state.boards,state.screws,state.boxes,state.boxQueue,state.buffer,state.pocket,state.collected,state.stats.assists,state.stats])Object.freeze(value);
  if(state.revealState){Object.freeze(state.revealState.opened);Object.freeze(state.revealState);}
  Object.freeze(state);return state;
}
