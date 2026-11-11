import Phaser from 'phaser';
import './geometry-setup';
import { ART, assetUrl } from './art';
import { GameEngine } from './core';
import { blockingBoards, boardPolygon, isScrewExposed, pointInPolygon, remainingOnBoard, screwPosition } from './geometry';
import { capturePlatePhysics, configurePlatePhysics, createPlatePhysics, rotate } from './physics';
import type { PlatePhysics, PlatePhysicsAdapter } from './physics';
import { COLORS, SHAPES, COLOR_MARKS } from './types';
import type { BoardState, GameEvent, ScrewState, Settings, Vec2 } from './types';
import {BoardGestures,type PickTarget} from './gestures';
import {COLOR_NAMES, type ColorId} from './types';
import {drawColorSign} from './color-signs';
import {VisibilityCache} from './visibility-cache';

export interface GameView {
  sync(events?: GameEvent[], reset?: boolean): void;
  setPaused(value: boolean): void;
  setHint(id: string | null): void;
  setMeltMode(value: boolean): void;
  capturePhysics(): void;
  destroy(): void;
  getScrewScreenPosition(id: string): Vec2 | null;
  screenPoint(point: Vec2): Vec2 | null;
  whenSettled(timeoutMs?: number): Promise<void>;
  zoomBy(factor:number):void;
  resetCamera():void;
  isInspecting():boolean;
  diagnostics():Array<{at:number;delta:number;total:number;physics:number;visibility:number;paint:number;plates:number;pins:number}>;
  invalidateLayout():void;
}
interface Callbacks { onPick: (id: string) => void; onBoard: (id: string) => void; onBlocked?: (ids:string[])=>void; onFall?:(id:string)=>void;onInspect?:(text:string|null)=>void;onCamera?:(zoom:number)=>void;onInvalid?:()=>void;onReveal?:(events:GameEvent[])=>void;onAmbiguous?:()=>void }
interface PlateView extends PlatePhysics {
  image: Phaser.GameObjects.Image;
  holes: Map<string, Phaser.GameObjects.Image>;
}

const WIDTH = 390, HEIGHT = 420, STEP = 1000 / 60;
type SceneSheet='plates'|'plateExtra'|'plateA'|'plateB'|'plateC'|'heads'|'assistHeads'|'screws'|'fx';
interface SettleWaiter { timer: number; finish: () => void }

class PuzzleScene extends Phaser.Scene {
  private plates = new Map<string, PlateView>();
  private screws = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Image>();
  private marks = new Map<string, Phaser.GameObjects.Image>();
  private hintImage?: Phaser.GameObjects.Image;
  private hintId: string | null = null;
  private melt = false;
  private pausedByUI = false;
  private accumulator = 0;
  private clock = 0;
  private dirty = true;
  private blockedUntil = new Map<string,number>();
  private visibility=new VisibilityCache();
  private exposed=this.visibility.exposed;
  private readable=this.visibility.readable;
  private indexedState:GameEngine['state']|null=null;
  private orderedBoards:Array<{board:BoardState;index:number}>=[];
  private screwStates = new Map<string, ScrewState>();
  private boardStates = new Map<string, BoardState>();
  private effects = new Set<Phaser.GameObjects.Image>();
  private effectPool:Phaser.GameObjects.Image[]=[];
  private settleWaiters = new Set<SettleWaiter>();
  private ready = false;
  private disposed = false;
  private loadFailed = false;
  private gestures?:BoardGestures;
  private userZoom=1;
  private baseZoom=1;
  private cameraCenter:Vec2={x:195,y:210};
  private inspected:string|null=null;
  private inspectedBoards=new Set<string>();
  private canvasRect:DOMRect|null=null;
  private lastPulsePaint=0;
  private layoutWatchers:Array<()=>void>=[];
  private frameCosts:Array<{at:number;delta:number;total:number;physics:number;visibility:number;paint:number;plates:number;pins:number}>=[];

  constructor(private engine: GameEngine, private settings: Settings, private callbacks: Callbacks,
    private loaded: () => void, private failed: (error: Error) => void) { super('puzzle'); }

  private sceneSheets():SceneSheet[]{return [...((this.engine.state.contentRevision??1)>=2?[]:this.engine.state.contentVersion==='v2'?['plates','plateExtra']:['plateA','plateB','plateC']),'heads','assistHeads','screws','fx'] as SceneSheet[];}

  preload(): void {
    for (const kind of this.sceneSheets()) this.load.image(kind, assetUrl(ART.sheets[kind].file));
    if((this.engine.state.contentRevision??1)>=2)for(const shape of new Set(this.engine.state.boards.map(b=>b.shape))){const index=SHAPES.indexOf(shape),kind=(['plateA','plateB','plateC'] as const)[Math.floor(index/6)];this.load.image('plate-r2-'+shape,assetUrl(ART.sheets[kind].sprites[index%6].file));}
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.loadFailed = true;
      this.failed(new Error(`图片加载失败：${file.key}`));
    });
  }

  create(): void {
    if (this.disposed || this.loadFailed) return;
    for (const kind of this.sceneSheets()) {
      const texture = this.textures.get(kind);
      ART.sheets[kind].frames.forEach((frame, index) => texture.add(String(index), 0, frame.x, frame.y, frame.width, frame.height));
    }
    this.matter.world.autoUpdate = false;
    this.matter.world.setGravity(0, .75);
    this.resize();
    this.scale.on('resize', () => this.resize());
    this.gestures=new BoardGestures(this.game.canvas,{target:p=>this.targetAt(p),activate:t=>this.activate(t),world:p=>this.worldPoint(p),camera:()=>({zoom:this.userZoom,center:{...this.cameraCenter}}),setCamera:(zoom,center)=>this.setCamera(zoom,center),inspect:t=>this.inspect(t),enabled:()=>!this.pausedByUI&&this.engine.state.phase==='playing',invalid:()=>this.callbacks.onInvalid?.()});
    this.watchLayout();
    this.ready = true;
    this.rebuild();
    // 加载阶段准备首次约束切换和粒子对象，临时刚体不参与任何物理步进。
    const first=this.engine.state.boards.find(b=>b.active!==false&&!b.gone&&!b.melted);
    if(first){const adapter=this.physicsAdapter(),body=createPlatePhysics({...first},adapter);configurePlatePhysics(body,first.screws.slice(0,2),adapter);configurePlatePhysics(body,first.screws.slice(0,1),adapter);configurePlatePhysics(body,[],adapter);this.matter.world.remove(body.body);}
    for(let i=0;i<12;i++)this.effectPool.push(this.add.image(0,0,'fx','0').setDepth(9999).setVisible(false));
    for(let i=0;i<6;i++)this.sync();
    this.burst({x:WIDTH/2,y:24},0,3);
    this.loaded();
  }

  private resize(): void {
    if(this.disposed)return;
    this.baseZoom=Math.min(this.scale.width / WIDTH, this.scale.height / HEIGHT);
    this.setCamera(this.userZoom,this.cameraCenter);
    this.dirty=true;
    this.canvasRect=null;requestAnimationFrame(()=>{if(!this.disposed)this.canvasRect=this.game.canvas.getBoundingClientRect();});
  }

  setCamera(zoom:number,center:Vec2):void {
    this.userZoom=Math.max(1,Math.min(3,zoom));const z=this.baseZoom*this.userZoom;
    const halfW=this.scale.width/(2*z),halfH=this.scale.height/(2*z);
    this.cameraCenter={x:halfW>=WIDTH/2?WIDTH/2:Math.max(halfW,Math.min(WIDTH-halfW,center.x)),y:halfH>=HEIGHT/2?HEIGHT/2:Math.max(halfH,Math.min(HEIGHT-halfH,center.y))};
    this.cameras.main.setZoom(z).centerOn(this.cameraCenter.x,this.cameraCenter.y);this.dirty=true;this.callbacks.onCamera?.(this.userZoom);
  }
  private worldPoint(point:Vec2):Vec2 {
    const canvas=this.measureCanvas(),zoom=this.cameras.main.zoom;
    return{x:this.cameraCenter.x+(point.x-canvas.left-canvas.width/2)*this.scale.width/canvas.width/zoom,y:this.cameraCenter.y+(point.y-canvas.top-canvas.height/2)*this.scale.height/canvas.height/zoom};
  }
  private measureCanvas():DOMRect{
    if(!this.canvasRect||this.canvasRect.width<=0||this.canvasRect.height<=0)this.canvasRect=this.game.canvas.getBoundingClientRect();
    return this.canvasRect;
  }

  zoomBy(factor:number):void{this.gestures?.cancel();this.setCamera(this.userZoom*factor,this.cameraCenter);}
  resetCamera():void{this.gestures?.cancel();this.setCamera(1,{x:WIDTH/2,y:HEIGHT/2});}
  isInspecting():boolean{return this.inspected!==null;}
  invalidateLayout():void{if(this.disposed)return;this.canvasRect=null;this.resize();}
  private watchLayout():void{
    const invalidate=()=>this.invalidateLayout();
    const viewport=visualViewport;
    window.addEventListener('orientationchange',invalidate);
    viewport?.addEventListener('resize',invalidate);
    viewport?.addEventListener('scroll',invalidate);
    this.layoutWatchers.push(()=>window.removeEventListener('orientationchange',invalidate));
    if(viewport){
      this.layoutWatchers.push(()=>viewport.removeEventListener('resize',invalidate));
      this.layoutWatchers.push(()=>viewport.removeEventListener('scroll',invalidate));
    }
  }

  private makePlate(board: BoardState, renderDepth: number): PlateView {
    const physics = createPlatePhysics(board, this.physicsAdapter());
    const count = remainingOnBoard(this.engine.state, board.id).length;
    const shapeIndex = SHAPES.indexOf(board.shape);
    const legacy=this.engine.state.contentVersion==='v2';
    const texture = legacy?(shapeIndex>=12?'plateExtra':'plates'):(['plateA','plateB','plateC'][Math.floor(shapeIndex/6)]);
    const frame = legacy?(shapeIndex>=12?shapeIndex-12:shapeIndex):shapeIndex%6;
    const modern=(this.engine.state.contentRevision??1)>=2;
    const image = this.add.image(board.x, board.y, modern?'plate-r2-'+board.shape:texture, modern?undefined:String(frame))
      .setDisplaySize(board.width, board.height).setRotation(board.angle).setDepth(renderDepth).setAlpha(.66);
    const view: PlateView = { ...physics, image, holes: new Map() };
    for (const screw of board.screws) view.holes.set(screw.id, this.add.image(0, 0, 'screws', '8').setDisplaySize(18, 18).setAlpha(.68).setDepth(renderDepth + 1));
    this.configurePin(board, view, count);
    return view;
  }

  private configurePin(board: BoardState, view: PlateView, count: number): void {
    if (view.remaining === count) return;
    configurePlatePhysics(view, remainingOnBoard(this.engine.state, board.id).map(screw => ({ x: screw.localX, y: screw.localY })), this.physicsAdapter());
  }

  private physicsAdapter(): PlatePhysicsAdapter {
    return {
      fromVertices: (...args) => this.matter.add.fromVertices(...args),
      setAngle: this.matter.body.setAngle,
      setVelocity: this.matter.body.setVelocity,
      setAngularVelocity: this.matter.body.setAngularVelocity,
      setStatic: this.matter.body.setStatic,
      addPin: (body, pointA, pointB) => this.matter.add.worldConstraint(body, 0, .97, { pointA, pointB, damping: .14 }),
      removePin: pin => { this.matter.world.removeConstraint(pin); },
    };
  }

  private clearObjects(): void {
    this.cancelSettleWaiters();
    for (const id of [...this.plates.keys()]) this.removePlate(id);
    this.screws.forEach(screw => screw.destroy()); this.screws.clear();
    this.labels.forEach(label => label.destroy()); this.labels.clear();
    this.marks.forEach(mark => mark.destroy()); this.marks.clear();
    this.hintImage?.destroy(); this.hintImage = undefined;
    for (const effect of this.effects) { this.tweens.killTweensOf(effect); effect.destroy(); }
    this.effects.clear();
    this.effectPool.forEach(effect=>effect.destroy());this.effectPool=[];
    this.screwStates.clear(); this.boardStates.clear();
    this.indexedState=null;this.visibility.clear();
    this.accumulator = 0;
  }

  private removePlate(id: string): void {
    const view = this.plates.get(id);
    if (!view) return;
    if (view.pin) this.matter.world.removeConstraint(view.pin);
    this.matter.world.remove(view.body);
    view.image.destroy(); view.holes.forEach(hole => hole.destroy());
    this.plates.delete(id);
  }

  private refreshStateIndex(): void {
    if(this.indexedState===this.engine.state)return;this.indexedState=this.engine.state;
    this.screwStates = new Map(this.engine.state.screws.map(screw => [screw.id, screw]));
    this.boardStates = new Map(this.engine.state.boards.map(board => [board.id, board]));
    this.orderedBoards=this.engine.state.boards.map((board,index)=>({board,index})).sort((a,b)=>a.board.depth-b.board.depth||a.index-b.index);
  }

  private rebuild(): void {
    this.clearObjects();
    this.refreshStateIndex();
    const ordered = this.engine.state.boards.map((board, index) => ({ board, index })).sort((a, b) => a.board.depth - b.board.depth || a.index - b.index);
    ordered.forEach(({ board }, index) => this.addBoard(board,index*10));
    this.hintImage = this.add.image(0, 0, 'screws', '10').setDisplaySize(45, 45).setDepth(10000).setVisible(false);
    this.refreshExposed();this.capture();this.paint();this.dirty=true;
  }

  private glyph(color:typeof COLORS[number]):string{
    const key=`label-${color}`;if(this.textures.exists(key))return key;
    const texture=this.textures.createCanvas(key,64,64)!;
    const context=texture.getContext();context.clearRect(0,0,64,64);context.fillStyle='#fff9ec';context.beginPath();context.arc(32,32,27,0,Math.PI*2);context.fill();context.font='700 48px "Microsoft YaHei UI", "PingFang SC", sans-serif';context.fillStyle='#281e25';context.textAlign='center';context.textBaseline='middle';context.fillText(COLOR_MARKS[color],32,34);texture.refresh();return key;
  }
  private signTexture(color:ColorId):string{
    const key=`sign-${color}`;if(this.textures.exists(key))return key;
    const texture=this.textures.createCanvas(key,32,32)!;
    const context=texture.getContext();context.clearRect(0,0,32,32);
    context.fillStyle='#fff9ece6';context.beginPath();context.arc(16,16,15,0,Math.PI*2);context.fill();
    drawColorSign(context,color,16,16,16);texture.refresh();return key;
  }

  private addBoard(board:BoardState,depth:number):void{
      if(board.active===false)return;
      if (!board.gone && !board.melted && !this.plates.has(board.id)) this.plates.set(board.id, this.makePlate(board, depth));
      for (const screw of this.engine.state.screws.filter(s => s.boardId === board.id && s.place === 'board')) {
        if(this.screws.has(screw.id))continue;
        const point = this.engine.position(screw);
        const pinDepth=(this.engine.state.contentRevision??1)>=2?1000+board.depth*.1:depth+2;
        this.screws.set(screw.id, this.add.image(point.x, point.y, this.settings.colorLabels?'assistHeads':'heads', String(COLORS.indexOf(screw.color))).setDisplaySize(30, 30).setDepth(pinDepth));
        if(this.settings.colorLabels)this.labels.set(screw.id,this.add.image(point.x,point.y,this.glyph(screw.color)).setDepth(pinDepth+1));
        else this.marks.set(screw.id,this.add.image(point.x,point.y,this.signTexture(screw.color)).setDisplaySize(12,12).setDepth(pinDepth+1));
      }
  }

  private refreshExposed(): void {
    this.visibility.update(this.engine.state);
  }

  sync(events: GameEvent[] = [], reset = false): void {
    if (!this.ready || this.disposed) return;
    if (reset) { this.hintId = null; this.rebuild(); return; }
    this.refreshStateIndex();
    this.dirty=true;
    this.orderedBoards.forEach(({board},index)=>{
      if(board.active!==false&&!board.gone&&!board.melted&&!this.plates.has(board.id))this.addBoard(board,index*10);
    });
    for (const board of this.engine.state.boards) {
      const view = this.plates.get(board.id);
      if (view && (board.melted || board.gone)) {
        if (board.melted) this.burst({ x: board.x, y: board.y }, 4, 8);
        this.removePlate(board.id);
      } else if (view) this.configurePin(board, view, remainingOnBoard(this.engine.state, board.id).length);
    }
    for (const [id, image] of this.screws) {
      if (this.screwStates.get(id)?.place !== 'board') {
        this.tweens.killTweensOf(image);
        image.destroy(); this.screws.delete(id); this.labels.get(id)?.destroy(); this.labels.delete(id); this.marks.get(id)?.destroy(); this.marks.delete(id);
      }
    }
    // 飞入、旧盒装满和后续回流由 PresentationDirector 单独编排。
    for (const event of events) {
      if (event.type === 'picked') this.burst(event.from, 0, 3);
      if (event.type === 'board-released' && event.remaining === 1) {
        const last = this.engine.state.screws.find(s => s.boardId === event.boardId && s.place === 'board');
        if (last) this.burst(this.engine.position(last), 2, this.settings.reducedMotion ? 2 : 5);
      }
      if (event.type === 'board-released' && event.remaining === 0) {
        const board = this.boardStates.get(event.boardId);
        if (board) this.burst({ x: board.x, y: board.y }, 3, this.settings.reducedMotion ? 3 : 8);
      }
      if (event.type === 'group-revealed') {
        for (const id of event.boardIds) {
          const board = this.engine.state.boards.find(b => b.id === id);
          if (board) this.burst({ x: board.x, y: board.y }, 1, this.settings.reducedMotion ? 2 : 6);
          const view = this.plates.get(id);
          if (view && !this.settings.reducedMotion) this.tweens.add({ targets: view.image, alpha: 1, duration: 180, yoyo: true, hold: 40 });
        }
      }
      if (event.type === 'won') this.burst({ x: WIDTH / 2, y: HEIGHT / 2 }, 5, 12);
    }
    this.hintId = null;
    this.refreshExposed(); this.paint();
    this.checkSettled();
  }

  private burst(point: Vec2, frame: number, count: number): void {
    if (this.settings.reducedMotion) count = Math.min(2, count);
    for (let i = 0; i < count; i++) {
      if (this.effects.size >= 48) break;
      const angle = i * Math.PI * 2 / count;
      const effect = (this.effectPool.pop()??this.add.image(0,0,'fx','0').setDepth(9999)).setTexture('fx',String(frame)).setPosition(point.x,point.y).setVisible(true).setAlpha(1).setAngle(0).setDisplaySize(frame === 5 ? 54 : 18, frame === 5 ? 54 : 18);
      this.effects.add(effect);
      this.tweens.add({ targets: effect, x: point.x + Math.cos(angle) * 35, y: point.y + Math.sin(angle) * 35, alpha: 0, angle: i % 2 ? 45 : -45, duration: this.settings.reducedMotion ? 160 : 440, ease: 'Cubic.Out', onComplete: () => { this.effects.delete(effect);effect.setVisible(false);this.effectPool.push(effect); } });
    }
  }

  private targetAt(point:Vec2): PickTarget|null {
    if (this.pausedByUI || this.engine.state.phase !== 'playing') return null;
    this.capture();
    if (this.melt) {
      const candidates = this.engine.state.boards.map((board, index) => ({ board, index }))
        .filter(({board}) => board.active!==false && !board.melted && !board.gone && !board.falling && pointInPolygon(point, boardPolygon(board)))
        .sort((a, b) => b.board.depth - a.board.depth || b.index - a.index);
      return candidates[0]?{kind:'board',id:candidates[0].board.id}:null;
    }
    const cssScale = this.cssScale();
    if (cssScale <= 0) return null;
    const hitRadius = Math.max(15, 22 / cssScale);
    const candidates = this.engine.state.screws.filter(s => s.place === 'board'&&this.screws.has(s.id)&&this.readable.has(s.id)).map(screw => ({ screw, point: this.engine.position(screw), depth: this.screws.get(screw.id)?.depth ?? 0 }))
      .map(item => ({...item, distance: Math.hypot(item.point.x - point.x, item.point.y - point.y)}))
      .filter(item => item.distance <= hitRadius).sort((a, b) => a.distance - b.distance);
    // 触摸坐标可能被浏览器取整；可见钉头覆盖着的下层钉不能抢走命中。
    // 这里只优先实际半径内、通过完整遮挡检查的钉，扩展容差仍保留阻挡反馈。
    const visibleHead = candidates.filter(item => item.distance <= 15 && this.engine.canPick(item.screw.id))
      .sort((a, b) => b.depth - a.depth || a.distance - b.distance)[0];
    if (visibleHead) return{kind:'screw',id:visibleHead.screw.id};
    const nearest = candidates[0];
    if (!nearest) return null;
    const other=candidates.find(item=>Math.hypot(item.point.x-nearest.point.x,item.point.y-nearest.point.y)*cssScale>1);
    if(other&&Math.abs(other.distance-nearest.distance)*cssScale<5){this.callbacks.onAmbiguous?.();return null;}
    // 同中心钉子按实际绘制深度选最上面的可拆项，特别是熔板后留下的独立螺丝。
    const coincident = candidates.filter(item => Math.hypot(item.point.x - nearest.point.x, item.point.y - nearest.point.y) * cssScale <= 1)
      .sort((a, b) => b.depth - a.depth);
    const candidate = coincident.find(item => this.engine.canPick(item.screw.id)) ?? coincident[0];
    return candidate?{kind:'screw',id:candidate.screw.id}:null;
  }
  private activate(target:PickTarget):void {
    if(this.pausedByUI||this.engine.state.phase!=='playing')return;
    this.capture();
    if(target.kind==='board'){this.callbacks.onBoard(target.id);return;}
    if (this.engine.canPick(target.id)) this.callbacks.onPick(target.id);
    else {
      const image = this.screws.get(target.id);
      if (image) this.tweens.add({ targets: image, angle: 9, yoyo: true, repeat: 1, duration: 50 });
      const blockers=blockingBoards(this.engine.state,target.id);
      for(const id of blockers)this.blockedUntil.set(id,this.clock+650);
      this.dirty=true;this.callbacks.onBlocked?.(blockers);
    }
  }
  private inspect(target:PickTarget|null):void {
    this.capture();this.inspected=target?.id??null;this.inspectedBoards.clear();
    if(!target){this.callbacks.onInspect?.(null);this.accumulator=0;this.dirty=true;return;}
    if(target.kind==='board'){this.inspectedBoards.add(target.id);this.callbacks.onInspect?.('这块玻璃正在高亮。松手结束检查，轻点才会执行融化。');}
    else {const screw=this.engine.state.screws.find(s=>s.id===target.id);if(!screw)return;const blockers=blockingBoards(this.engine.state,target.id);this.inspectedBoards.add(screw.boardId);for(const id of blockers)this.inspectedBoards.add(id);this.callbacks.onInspect?.(`${COLOR_NAMES[screw.color]}钉 · ${this.engine.canPick(target.id)?'当前可以拆':blockers.length?'被 '+blockers.length+' 块上层玻璃遮挡':'等待玻璃露出'}。相关玻璃已高亮，松手结束检查。`);}
    this.accumulator=0;this.dirty=true;
  }

  capture(): void {
    if (!this.ready || this.disposed) return;
    const visibleBottom = HEIGHT / 2 + this.scale.height / (2 * this.baseZoom);
    for (const board of this.engine.state.boards) {
      const view = this.plates.get(board.id);
      if (!view || board.melted || board.gone) continue;
      capturePlatePhysics(board, view);
      if (view.remaining === 0) board.falling = true;
      if (board.falling && board.y - Math.hypot(board.width, board.height) / 2 > visibleBottom + 20) {
        board.gone = true;
        this.removePlate(board.id);
        this.callbacks.onFall?.(board.id);this.dirty=true;
      }
    }
    this.checkSettled();
  }

  private paint(): void {
    const labelSize=18/(this.cssScale()||1);
    const topDepth = Math.max(0, ...this.engine.state.boards.filter(board => board.active!==false && !board.gone && !board.melted).map(board => board.depth));
    for (const board of this.engine.state.boards) {
      const view = this.plates.get(board.id);
      if (!view) continue;
      view.image.setPosition(board.x, board.y).setRotation(board.angle).setVisible(!board.gone);
      const distance = Math.max(0, topDepth - board.depth);
      const opacity = this.engine.state.contentVersion==='v4'?Math.max(.30,.77-distance*.105):Math.max(.60,.73-distance*.025);
      const blocked=(this.blockedUntil.get(board.id)??0)>this.clock;
      view.image.setAlpha(this.inspected?(this.inspectedBoards.has(board.id)?.96:.20):blocked?.86+Math.sin(this.clock/65)*.12:this.melt && !board.falling ? .72 + Math.sin(this.clock / 150) * .06 : opacity);
      for (const original of board.screws) {
        const hole = view.holes.get(original.id)!;
        const p = rotate(original, board.angle);
        hole.setPosition(board.x + p.x, board.y + p.y).setRotation(board.angle).setVisible(!board.gone).setAlpha(this.engine.state.contentVersion==='v4'?.32:.68);
      }
    }
    const boxColors=new Set(this.engine.state.boxes.map(b=>b.color).filter((c):c is NonNullable<typeof c>=>!!c));
    for (const [id, image] of this.screws) {
      const screw = this.screwStates.get(id)!;
      const board = this.boardStates.get(screw.boardId)!;
      const p = screwPosition(screw, board);
      const matching=boxColors.has(screw.color);
      const layer=Math.max(0, topDepth - board.depth);
      const obscuredOpacity = this.engine.state.contentVersion==='v4'?(matching?.50:.23):Math.max(.44, .52 - layer * .025);
      const ghost=matching&&!this.readable.has(id)&&layer<=2&&this.engine.state.contentVersion==='v4';
      const visible=this.readable.has(id)||ghost;
      const pulse=!this.settings.reducedMotion&&matching&&this.exposed.has(id)?1+Math.sin(this.clock/220)*.07:1;
      image.setPosition(p.x, p.y).setVisible(visible).setAlpha(this.exposed.has(id) ? 1 : ghost?.28:obscuredOpacity).setDisplaySize(30*pulse,30*pulse);
      this.labels.get(id)?.setPosition(p.x,p.y).setDisplaySize(labelSize*pulse,labelSize*pulse).setVisible(this.settings.colorLabels&&visible).setAlpha(this.exposed.has(id)?1:ghost?.28:obscuredOpacity);
      const markSize=11*pulse/(this.cssScale()||1);
      this.marks.get(id)?.setPosition(p.x+8,p.y+8).setDisplaySize(markSize,markSize).setVisible(!this.settings.colorLabels&&visible).setAlpha(this.exposed.has(id)?1:ghost?.28:obscuredOpacity);
    }
    if (this.hintId && this.hintImage && this.engine.canPick(this.hintId)) {
      const p = this.engine.position(this.hintId);
      this.hintImage.setPosition(p.x, p.y).setVisible(true).setAlpha(.65 + Math.sin(this.clock / 170) * .25);
    } else this.hintImage?.setVisible(false);
  }

  update(_time: number, delta: number): void {
    if (!this.ready || this.disposed) return;
    const profiling=import.meta.env.DEV||import.meta.env.MODE==='verification'||(typeof location!=='undefined'&&new URLSearchParams(location.search).has('check')),start=profiling?performance.now():0;let physicsCost=0,visibilityCost=0,paintCost=0;
    this.clock += delta;
    const moving=[...this.plates.values()].some(p=>p.remaining<2);
    if (!this.pausedByUI && !this.inspected && this.engine.state.phase !== 'stuck' && moving) {
      this.accumulator = Math.min(100, this.accumulator + delta);
      while (this.accumulator >= STEP) { this.matter.world.step(STEP); this.accumulator -= STEP; }
      this.capture();
      if(profiling)physicsCost=performance.now()-start;
      this.refreshExposed();this.dirty=true;
      if(profiling)visibilityCost=performance.now()-start-physicsCost;
    }
    if(!this.pausedByUI&&!this.inspected){const events=this.engine.advanceWorld(delta);if(events.length){this.sync(events);this.callbacks.onReveal?.(events);}}
    const paintStart=profiling?performance.now():0;
    const pulsing=!this.settings.reducedMotion&&(!!this.hintId||this.melt||this.inspected!==null||[...this.blockedUntil.values()].some(t=>t>this.clock)||this.engine.state.boxes.some(b=>b.color));
    if(pulsing&&this.clock-this.lastPulsePaint>=66){this.dirty=true;this.lastPulsePaint=this.clock;}
    if(this.dirty){this.paint();this.dirty=false;}
    if(profiling){paintCost=performance.now()-paintStart;this.frameCosts.push({at:start,delta,total:performance.now()-start,physics:physicsCost,visibility:visibilityCost,paint:paintCost,plates:this.plates.size,pins:this.screws.size});if(this.frameCosts.length>2400)this.frameCosts.shift();}
  }
  diagnostics(){return this.frameCosts;}

  private cssScale(): number {
    if (!this.ready || this.disposed || !this.game.canvas?.isConnected) return 0;
    const width = this.measureCanvas().width;
    return width > 0 && this.scale.width > 0 ? this.cameras.main.zoom * width / this.scale.width : 0;
  }

  screenPoint(point: Vec2): Vec2 | null {
    if (!this.ready || this.disposed || !this.game.canvas?.isConnected || this.cssScale() <= 0) return null;
    const canvas = this.measureCanvas(), camera = this.cameras.main;
    return { x: canvas.left + (this.scale.width / 2 + (point.x - this.cameraCenter.x) * camera.zoom) * canvas.width / this.scale.width,
      y: canvas.top + (this.scale.height / 2 + (point.y - this.cameraCenter.y) * camera.zoom) * canvas.height / this.scale.height };
  }
  setPaused(value: boolean): void { if(value)this.gestures?.cancel();this.pausedByUI = value; this.accumulator = 0; }
  setHint(id: string | null): void { this.hintId = id;this.dirty=true; }
  setMeltMode(value: boolean): void { this.melt = value;this.dirty=true; }

  private hasReleasedPlates(): boolean {
    return this.engine.state.boards.some(board => !board.gone && !board.melted &&
      (board.falling || this.plates.get(board.id)?.remaining === 0));
  }

  private checkSettled(): void {
    if (!this.hasReleasedPlates()) for (const waiter of [...this.settleWaiters]) waiter.finish();
  }

  private cancelSettleWaiters(): void {
    for (const waiter of [...this.settleWaiters]) waiter.finish();
  }

  whenSettled(timeoutMs = 3000): Promise<void> {
    if (!this.ready || this.disposed || !this.hasReleasedPlates()) return Promise.resolve();
    const timeout = Number.isFinite(timeoutMs) ? Math.max(0, Math.min(30000, timeoutMs)) : 3000;
    return new Promise(resolve => {
      const waiter: SettleWaiter = { timer: 0, finish: () => undefined };
      waiter.finish = () => {
        if (!this.settleWaiters.delete(waiter)) return;
        window.clearTimeout(waiter.timer);
        resolve();
      };
      this.settleWaiters.add(waiter);
      waiter.timer = window.setTimeout(waiter.finish, timeout);
      this.checkSettled();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gestures?.destroy();
    for(const stop of this.layoutWatchers)stop();this.layoutWatchers=[];
    this.ready = false;
    this.clearObjects();
  }
}

export function mountGame(container: HTMLElement, engine: GameEngine, settings: Settings, callbacks: Callbacks): Promise<GameView> {
  return new Promise((resolve, reject) => {
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    let game: Phaser.Game;
    let observer: ResizeObserver;
    let settled = false;
    let destroyed = false;
    const scene = new PuzzleScene(engine, settings, callbacks, () => {
      if (settled) return; settled = true;
      resolve({
        sync: (events, reset) => scene.sync(events, reset), setPaused: value => scene.setPaused(value),
        setHint: id => scene.setHint(id), setMeltMode: value => scene.setMeltMode(value), capturePhysics: () => scene.capture(),
        getScrewScreenPosition: id => engine.state.screws.some(s => s.id === id && s.place === 'board') ? scene.screenPoint(engine.position(id)) : null,
        screenPoint: point => scene.screenPoint(point), whenSettled: timeoutMs => scene.whenSettled(timeoutMs),
        zoomBy:factor=>scene.zoomBy(factor),resetCamera:()=>scene.resetCamera(),isInspecting:()=>scene.isInspecting(),
        diagnostics:()=>scene.diagnostics(),invalidateLayout:()=>scene.invalidateLayout(),
        destroy: () => { if (destroyed) return; destroyed = true; observer?.disconnect(); scene.dispose(); game.destroy(true); },
      });
    }, error => { if (!settled) { settled = true; observer?.disconnect(); setTimeout(() => game?.destroy(true), 0); reject(error); } });
    // 保持 WebKit 尺寸变化后的画布可见；本场景仅使用图片精灵，支持官方 Canvas 后备。
    const webKit = /AppleWebKit\//.test(navigator.userAgent) && !/(?:Chrome|Chromium|Edg|OPR)\//.test(navigator.userAgent);
    const canvasProbe=(import.meta.env.DEV||import.meta.env.MODE==='verification')&&new URLSearchParams(location.search).get('renderer')==='canvas';
    game = new Phaser.Game({ type: webKit||canvasProbe ? Phaser.CANVAS : Phaser.AUTO, parent: container, transparent: true,
      width: Math.max(1, container.clientWidth * pixelRatio), height: Math.max(1, container.clientHeight * pixelRatio),
      antialias: true,
      input:{mouse:false,touch:false,keyboard:false,gamepad:false},
      render: { antialias: true, antialiasGL:false, roundPixels: false, transparent: true, premultipliedAlpha: true },
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / pixelRatio, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: 'matter', matter: { gravity: { x: 0, y: .75 }, enableSleeping: false, autoUpdate: false, positionIterations: 8, velocityIterations: 8, constraintIterations: 4 } },
      // 60Hz 屏逐帧更新；给高刷屏留出计时余量，避免严格60上限因微小抖动跳过整帧。
      scene: [scene], banner: false, audio: { noAudio: true }, fps: { target: 60, limit:90, smoothStep: false },
    });
    observer = new ResizeObserver(() => { if (game.scale && container.clientWidth && container.clientHeight) game.scale.resize(container.clientWidth * pixelRatio, container.clientHeight * pixelRatio); });
    observer.observe(container);
  });
}
