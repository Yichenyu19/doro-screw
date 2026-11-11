export const COLORS = ['rose','orange','yellow','green','cyan','blue','purple','brown','red','gray'] as const;
export type ColorId = typeof COLORS[number];
export const COLOR_HEX:Record<ColorId,string>={rose:'#ef7299',orange:'#f4a25d',yellow:'#eed263',green:'#9fcb74',cyan:'#63c8cd',blue:'#78a6e7',purple:'#b494df',brown:'#bd917a',red:'#df4945',gray:'#9b9fa6'};
export const COLOR_NAMES:Record<ColorId,string>={rose:'莓粉',orange:'橘子',yellow:'布丁',green:'青柠',cyan:'薄荷',blue:'蓝莓',purple:'葡萄',brown:'可可',red:'樱桃红',gray:'银灰'};
export const COLOR_MARKS:Record<ColorId,string>={rose:'粉',orange:'橙',yellow:'黄',green:'绿',cyan:'青',blue:'蓝',purple:'紫',brown:'棕',red:'红',gray:'灰'};
export const SHAPES=['capsule','disc','triangle','square','diamond','heart','cloud','bow','star','elbow','leaf','doro','cross','flower','crescent','cshape','notchedSquare','zigzag'] as const;
export type BoardShape=typeof SHAPES[number];
export type ContentVersion='v2'|'v3'|'v4';
export type PlayMode='campaign'|'random'|'endless'|'legacy'|'rescue'|'mastery';
export type StrategyTheme='quadrants'|'interlock'|'embrace'|'lattice'|'hinge'|'cascade';
export interface Vec2{x:number;y:number}
export interface ScrewDef extends Vec2{id:string;color:ColorId}
export interface BoardDef extends Vec2 {
  id:string;shape:BoardShape;color:ColorId;width:number;height:number;angle:number;depth:number;screws:ScrewDef[];
  geometryVersion?:ContentVersion;group?:number;reserved?:boolean;
}
export interface WitnessStep{screwId:string;waitMs?:number;waitForExposure?:boolean}
export interface HingeRule{boardId:string;pivotId:string;targetIds:string[];settledPose:{x:number;y:number;angle:number}}
export interface RevealRule{group:number;afterCleared:number}
export interface RevealPacket {id:string;boardIds:string[];requiresCleared:string[];requiresRemoved?:string[]}
export interface RevealPlan {threshold:number;stableMs:number;packets:RevealPacket[]}
export interface RevealState {opened:string[];pendingId:string|null;lowEntryMs:number}
export interface DifficultyProfile {
  theme:string;decisions:string[];dependencies:Array<{from:string;to:string;reason:string}>;
  planningDepth:number;crossRegionLinks:number;crossRevealLinks:number;bufferMargin:number;
  predecessorComparison:string;originalComparison:string;verification:'pending'|'verified';evidence:string[];
}
export interface ChallengeStart {state:GameState;rewardableIds:string[];source:string}
export interface LevelDef {
  id:number;name:string;subtitle:string;seed:number;boards:BoardDef[];boxQueue:ColorId[];witness:WitnessStep[];
  sourceKind?:'reference-inspired'|'doro-original';attempt?:number;designNotes?:string[];
  contentVersion?:ContentVersion;geometryVersion?:ContentVersion;theme?:StrategyTheme;strategy?:string;
  reveal?:RevealRule;hinge?:HingeRule;tutorial?:boolean;
  mode?:PlayMode;contentRevision?:number;curriculum?:Curriculum;
  revealPlan?:RevealPlan;difficulty?:DifficultyProfile;challengeStart?:ChallengeStart;
}
export interface Curriculum {objective:string;prerequisites:string[];decision:string;failure:string;release:string;stages:Array<{until:number;title:string;advice:string}>;criticalBoardIds:string[]}
export interface BoardState extends BoardDef{vx:number;vy:number;angularVelocity:number;melted:boolean;falling:boolean;gone:boolean;active?:boolean}
export type ScrewPlace='board'|'buffer'|'pocket'|'box'|'done';
export interface ScrewState{id:string;boardId:string;color:ColorId;localX:number;localY:number;place:ScrewPlace;detached:boolean;x:number;y:number}
export interface BoxState{id:number;color:ColorId|null;screws:string[];completed:number}
export type Phase='playing'|'stuck'|'won';
export type ToolKind='expand-box'|'expand-buffer'|'clear-buffer'|'melt'|'revive';
export interface RunStats {
  elapsedMs:number;picks:number;undos:number;hintsShown:number;assists:Record<ToolKind,number>;peakBuffer:number;
  boxesCompleted:number;maxChain:number;legacy:boolean;legacyAssistCount?:number;
}
export interface GameState {
  version:3;contentVersion:ContentVersion;levelId:number;seed:number;attemptId:string;runId:string;actionRevision:number;
  boards:BoardState[];screws:ScrewState[];boxes:BoxState[];boxQueue:ColorId[];queueCursor:number;
  buffer:(string|null)[];pocket:string[];collected:string[];capacity:number;phase:Phase;moves:number;
  elapsedMs:number;toolsUsed:number;stats:RunStats;reveal?:RevealRule;
  mode?:PlayMode;contentRevision?:number;attempt?:number;
  goal?:ClearRank;
  revealPlan?:RevealPlan;revealState?:RevealState;rewardableIds?:string[];
}
export interface RunCheckpoint {schema:1;state:GameState;history:GameState[]}
export interface RunJournal {schema:1;sequence:number;writtenAt:number;run:RunCheckpoint|null;progress:unknown}
export type Action={type:'pick';screwId:string}|{type:'expand-box'}|{type:'expand-buffer'}|{type:'clear-buffer'}|{type:'melt';boardId:string}|{type:'revive'};
export type GameEvent={type:'picked';screwId:string;from:Vec2}|{type:'routed';screwId:string;color:ColorId;destination:'box'|'buffer'|'pocket';boxId?:number;boxGeneration?:number;slotIndex?:number;sourcePlace?:ScrewPlace;sourceSlotIndex?:number}|{type:'box-completed';boxId:number;boxGeneration?:number;color:ColorId}|{type:'box-opened';boxId:number;boxGeneration?:number;color:ColorId|null}|{type:'board-released';boardId:string;remaining:number}|{type:'melted';boardId:string}|{type:'group-revealed';group:number;boardIds:string[]}|{type:'stuck'}|{type:'won'}|{type:'tool';tool:string};
export interface ActionResult{ok:boolean;events:GameEvent[];reason?:string;before?:GameState}
export interface ToolPreview{action:Action;available:boolean;freed:number;added:number;nextColor:ColorId|null;result:Phase;reason:string}
export interface HintSearchOptions{maxNodes?:number;maxMs?:number;beamWidth?:number}
export type HintInfo={type:'move';id:string;reason:string;model:'static-current-pose'|'matter-verified';verifiedSteps:number;searchedNodes:number}|{type:'wait';reason:string}|{type:'unknown';reason:string;searchedNodes:number;budgetExhausted:boolean};
export interface Settings{sound:boolean;reducedMotion:boolean;colorLabels:boolean}
export type ClearRank='complete'|'independent'|'clean';
export interface BestRecord{puzzleId:string;contentVersion:ContentVersion;levelId:number;attempt:number;seed:number;rank:ClearRank;elapsedMs:number;undos:number;hintsShown:number;assists:number;clears:number;updatedAt:number;mode?:PlayMode;contentRevision?:number;moves?:number;bestMoves?:number;peakBuffer?:number;capacity?:number}
export interface DailyMark{rank:ClearRank;theme:number;attempt:number;updatedAt:number}
export interface SaveData {
  version:3|4;current:GameState|null;completed:number[];unlocked:number;album:number[];settings:Settings;updatedAt:number;
  materialBalance?:number;artworkProgress?:number[];rewardedAttempts?:string[];attemptCounter?:number;attempts?:Record<string,number>;legacyCompleted?:number[];
}

