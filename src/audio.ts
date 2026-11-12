export type SoundName='pick'|'arrive'|'box'|'refill'|'loosen'|'fall'|'reveal'|'chain'|'win'|'tool'|'blocked'|'wall'|'undo'|'ui'|'album'|'full';
export type SoundBus='action'|'impact'|'reward'|'warn'|'ui';
export interface SynthVoice {
  osc?:OscillatorType;
  noise?:'white'|'brown';
  freq?:number;
  freqEnd?:number;
  start:number;
  dur:number;
  gain:number;
  attack:number;
  filter?:BiquadFilterType;
  filterFreq?:number;
  filterQ?:number;
}
export interface SoundSpec {
  bus:SoundBus;
  priority:number;
  coalesce:number;
  gain:number;
  rateJitter:number;
  gainJitter:number;
}

/** 采样缺失时的后备合成。运行时优先播放 public/sfx 里的短采样。 */
export const SYNTH_RECIPES:Record<SoundName,SynthVoice[]>={
  pick:[{osc:'triangle',freq:780,freqEnd:920,start:0,dur:.05,gain:.05,attack:.004},{osc:'sine',freq:2100,freqEnd:1600,start:.002,dur:.028,gain:.028,attack:.002},{noise:'white',start:0,dur:.02,gain:.016,attack:.001,filter:'highpass',filterFreq:2500,filterQ:.7}],
  arrive:[{osc:'sine',freq:659,freqEnd:620,start:0,dur:.09,gain:.055,attack:.004},{osc:'triangle',freq:1318,start:.004,dur:.06,gain:.02,attack:.003},{noise:'white',start:0,dur:.03,gain:.018,attack:.001,filter:'bandpass',filterFreq:2400,filterQ:1.2}],
  box:[{osc:'triangle',freq:523,start:0,dur:.12,gain:.07,attack:.006},{osc:'sine',freq:659,start:.03,dur:.14,gain:.06,attack:.008},{osc:'sine',freq:784,start:.06,dur:.16,gain:.05,attack:.01},{noise:'white',start:0,dur:.04,gain:.02,attack:.002,filter:'bandpass',filterFreq:1800,filterQ:1.1}],
  refill:[{osc:'sine',freq:660,freqEnd:880,start:0,dur:.1,gain:.045,attack:.008},{osc:'triangle',freq:880,freqEnd:1175,start:.05,dur:.11,gain:.035,attack:.01},{noise:'white',start:.02,dur:.07,gain:.014,attack:.01,filter:'highpass',filterFreq:1800,filterQ:.8}],
  loosen:[{osc:'triangle',freq:340,freqEnd:190,start:0,dur:.18,gain:.036,attack:.02},{osc:'square',freq:190,freqEnd:120,start:.03,dur:.14,gain:.01,attack:.03},{noise:'brown',start:0,dur:.16,gain:.028,attack:.015,filter:'lowpass',filterFreq:700,filterQ:.8}],
  fall:[{osc:'sine',freq:92,freqEnd:48,start:0,dur:.26,gain:.12,attack:.004},{osc:'triangle',freq:220,freqEnd:90,start:.008,dur:.15,gain:.05,attack:.004},{noise:'white',start:0,dur:.11,gain:.06,attack:.002,filter:'lowpass',filterFreq:1600,filterQ:.5},{noise:'brown',start:.02,dur:.2,gain:.04,attack:.008,filter:'lowpass',filterFreq:400,filterQ:.6}],
  reveal:[{osc:'sine',freq:1240,freqEnd:1860,start:0,dur:.16,gain:.028,attack:.02},{osc:'triangle',freq:1860,freqEnd:2480,start:.04,dur:.14,gain:.016,attack:.025},{noise:'white',start:0,dur:.16,gain:.018,attack:.02,filter:'bandpass',filterFreq:3200,filterQ:1.2}],
  chain:[{osc:'triangle',freq:784,start:0,dur:.07,gain:.045,attack:.005},{osc:'sine',freq:1047,start:.05,dur:.09,gain:.04,attack:.006}],
  win:[{osc:'sine',freq:261.6,start:0,dur:.28,gain:.03,attack:.02},{osc:'triangle',freq:523,start:0,dur:.16,gain:.06,attack:.01},{osc:'triangle',freq:659,start:.08,dur:.16,gain:.06,attack:.01},{osc:'sine',freq:784,start:.16,dur:.18,gain:.055,attack:.012},{osc:'sine',freq:1047,start:.26,dur:.22,gain:.05,attack:.014}],
  tool:[{osc:'triangle',freq:430,start:0,dur:.07,gain:.04,attack:.005},{osc:'sine',freq:860,start:.03,dur:.08,gain:.03,attack:.006},{noise:'white',start:0,dur:.03,gain:.012,attack:.002,filter:'bandpass',filterFreq:2000,filterQ:1}],
  blocked:[{osc:'sine',freq:180,freqEnd:120,start:0,dur:.1,gain:.04,attack:.003},{noise:'brown',start:0,dur:.07,gain:.02,attack:.002,filter:'lowpass',filterFreq:300,filterQ:.7}],
  wall:[{osc:'sine',freq:196,freqEnd:98,start:0,dur:.36,gain:.11,attack:.005},{osc:'triangle',freq:392,start:0,dur:.22,gain:.05,attack:.006},{osc:'sine',freq:523,start:.22,dur:.28,gain:.05,attack:.02},{noise:'white',start:0,dur:.1,gain:.045,attack:.002,filter:'lowpass',filterFreq:1400,filterQ:.5}],
  undo:[{noise:'white',start:0,dur:.14,gain:.03,attack:.008,filter:'bandpass',filterFreq:1800,filterQ:.8},{osc:'triangle',freq:520,freqEnd:280,start:0,dur:.14,gain:.03,attack:.01}],
  ui:[{osc:'sine',freq:1400,freqEnd:1100,start:0,dur:.045,gain:.03,attack:.002},{osc:'triangle',freq:2100,start:0,dur:.03,gain:.012,attack:.001}],
  album:[{noise:'white',start:0,dur:.08,gain:.02,attack:.006,filter:'bandpass',filterFreq:2600,filterQ:.9},{osc:'sine',freq:988,start:.02,dur:.16,gain:.035,attack:.01},{osc:'sine',freq:1480,start:.03,dur:.12,gain:.018,attack:.012}],
  full:[{osc:'sine',freq:90,freqEnd:58,start:0,dur:.2,gain:.07,attack:.004},{noise:'brown',start:0,dur:.16,gain:.03,attack:.003,filter:'lowpass',filterFreq:280,filterQ:.8}],
};

/** 总线、优先级、合并间隔与抖动。高频动作声更克制，胜负与装满几乎不抖音高。 */
export const SOUND_SPEC:Record<SoundName,SoundSpec>={
  pick:{bus:'action',priority:2,coalesce:.05,gain:.85,rateJitter:.03,gainJitter:.06},
  arrive:{bus:'action',priority:3,coalesce:.045,gain:.88,rateJitter:.02,gainJitter:.05},
  loosen:{bus:'action',priority:4,coalesce:.07,gain:.9,rateJitter:.02,gainJitter:.05},
  refill:{bus:'action',priority:4,coalesce:.08,gain:.72,rateJitter:.02,gainJitter:.05},
  reveal:{bus:'impact',priority:5,coalesce:.1,gain:.68,rateJitter:.02,gainJitter:.04},
  fall:{bus:'impact',priority:7,coalesce:.1,gain:1,rateJitter:.015,gainJitter:.04},
  box:{bus:'reward',priority:8,coalesce:.1,gain:1,rateJitter:.01,gainJitter:.03},
  chain:{bus:'reward',priority:6,coalesce:.16,gain:.78,rateJitter:.015,gainJitter:.04},
  win:{bus:'reward',priority:9,coalesce:.25,gain:1,rateJitter:.008,gainJitter:.03},
  wall:{bus:'reward',priority:10,coalesce:.3,gain:1,rateJitter:.008,gainJitter:.03},
  tool:{bus:'ui',priority:3,coalesce:.08,gain:.8,rateJitter:.02,gainJitter:.05},
  blocked:{bus:'warn',priority:3,coalesce:.12,gain:.72,rateJitter:.02,gainJitter:.05},
  undo:{bus:'ui',priority:3,coalesce:.08,gain:.7,rateJitter:.02,gainJitter:.05},
  ui:{bus:'ui',priority:1,coalesce:.1,gain:.5,rateJitter:.015,gainJitter:.04},
  album:{bus:'ui',priority:5,coalesce:.15,gain:.85,rateJitter:.015,gainJitter:.04},
  full:{bus:'warn',priority:4,coalesce:.25,gain:.8,rateJitter:.015,gainJitter:.04},
};

export const VOICE_CAP=5;
export const MASTER_GAIN=.9;
export const BUS_GAIN:Record<SoundBus,number>={action:.85,impact:.95,reward:1,warn:.75,ui:.58};
export const DUCK_GAIN=.38;
export const DUCK_MS=260;
export const SAMPLE_STEMS=['pick','loosen','arrive-0','arrive-1','arrive-2','box','refill','fall','reveal','tool','blocked','chain','win','wall','undo','ui','album','full'] as const;
const SAMPLE_FILES:Partial<Record<SoundName,string|string[]>>={
  pick:'sfx/pick.ogg',loosen:'sfx/loosen.ogg',
  arrive:['sfx/arrive-0.ogg','sfx/arrive-1.ogg','sfx/arrive-2.ogg'],
  box:'sfx/box.ogg',refill:'sfx/refill.ogg',fall:'sfx/fall.ogg',reveal:'sfx/reveal.ogg',
  tool:'sfx/tool.ogg',blocked:'sfx/blocked.ogg',chain:'sfx/chain.ogg',win:'sfx/win.ogg',wall:'sfx/wall.ogg',
  undo:'sfx/undo.ogg',ui:'sfx/ui.ogg',album:'sfx/album.ogg',full:'sfx/full.ogg',
};

export function recipeDuration(recipe:SynthVoice[]):number{
  return recipe.reduce((max,voice)=>Math.max(max,voice.start+voice.dur),0);
}

function noiseBuffer(context:BaseAudioContext,kind:'white'|'brown',seconds=.35):AudioBuffer{
  const length=Math.max(1,Math.ceil(context.sampleRate*seconds)),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
  let last=0;
  for(let i=0;i<length;i++){const white=Math.random()*2-1;last=kind==='brown'?(last+0.02*white)/1.02:white;data[i]=last;}
  return buffer;
}

export function scheduleRecipe(context:BaseAudioContext,destination:AudioNode,recipe:SynthVoice[],when=0):AudioScheduledSourceNode[]{
  const noiseCache=new Map<string,AudioBuffer>(),sources:AudioScheduledSourceNode[]=[];
  for(const voice of recipe){
    const start=when+voice.start,end=start+voice.dur,gain=context.createGain();
    gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(voice.gain,start+Math.max(.001,Math.min(voice.attack,voice.dur/3)));
    gain.gain.exponentialRampToValueAtTime(.001,Math.max(start+voice.attack+.001,end-.006));
    gain.gain.linearRampToValueAtTime(0,end+.008);
    let node:AudioScheduledSourceNode;
    if(voice.noise){
      const key=voice.noise,buffer=noiseCache.get(key)??noiseBuffer(context,voice.noise);
      noiseCache.set(key,buffer);
      const source=context.createBufferSource();source.buffer=buffer;source.loop=true;node=source;source.start(start);source.stop(end+.01);
    }else{
      const oscillator=context.createOscillator();oscillator.type=voice.osc??'sine';
      const freq=Math.max(20,voice.freq??440);oscillator.frequency.setValueAtTime(freq,start);
      if(voice.freqEnd)oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,voice.freqEnd),end);
      node=oscillator;oscillator.start(start);oscillator.stop(end+.01);
    }
    if(voice.filter){
      const filter=context.createBiquadFilter();filter.type=voice.filter;filter.frequency.setValueAtTime(voice.filterFreq??1200,start);filter.Q.setValueAtTime(voice.filterQ??1,start);
      node.connect(filter);filter.connect(gain);
    }else node.connect(gain);
    gain.connect(destination);
    sources.push(node);
  }
  return sources;
}

export interface PlayOptions{tone?:number}
/** 小彩蛋与仪式感用的合成短句：分类沿用音效总线命名，便于并入分类增益链。 */
export interface CueOptions{bus?:'action'|'impact'|'reward'|'warn'|'ui';gain?:number;delay?:number}

interface VoiceSlot{priority:number;gain:GainNode}

/** 短音效在第一次用户手势后启用；音频失败不影响任何游戏动作。 */
export class GameAudio {
  private context:AudioContext|null=null;
  private enabled=true;
  private voices=new Map<AudioScheduledSourceNode,VoiceSlot>();
  private buffers=new Map<string,AudioBuffer>();
  private buses=new Map<SoundBus,GainNode>();
  private master:GainNode|null=null;
  private actionBus:GainNode|null=null;
  private preparing=false;
  private lastPlayed=new Map<SoundName,number>();

  constructor(enabled:boolean){this.enabled=enabled;}

  unlock():void{
    if(!this.enabled||(typeof document!=='undefined'&&document.hidden))return;
    const activation=navigator.userActivation;
    if(activation&&!activation.isActive)return;
    try{
      this.context??=new AudioContext();
      this.ensureGraph(this.context);
      if(this.context.state==='suspended')void this.context.resume().catch(()=>{});
      this.prime(this.context);
      if(!this.preparing){this.preparing=true;void this.prepare();}
    }catch{ /* 无音频设备时仍然正常游玩。 */ }
  }

  private ensureGraph(context:AudioContext):void{
    if(this.master)return;
    const master=context.createGain();master.gain.value=MASTER_GAIN;
    const limiter=context.createDynamicsCompressor();
    limiter.threshold.value=-1.5;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.001;limiter.release.value=.08;
    const compressor=context.createDynamicsCompressor();
    compressor.threshold.value=-18;compressor.knee.value=8;compressor.ratio.value=3;compressor.attack.value=.003;compressor.release.value=.12;
    compressor.connect(limiter);limiter.connect(master);master.connect(context.destination);
    (['action','impact','reward','warn','ui'] as SoundBus[]).forEach(name=>{
      const bus=context.createGain();bus.gain.value=BUS_GAIN[name];bus.connect(compressor);this.buses.set(name,bus);
      if(name==='action')this.actionBus=bus;
    });
    this.master=master;
  }

  /** iOS / 自动播放策略：在同一次用户手势里播一段静音缓冲，帮助解锁。 */
  private prime(context:AudioContext):void{
    try{
      const buffer=context.createBuffer(1,1,context.sampleRate);
      const source=context.createBufferSource();source.buffer=buffer;
      const gain=context.createGain();gain.gain.value=.0001;
      source.connect(gain);gain.connect(context.destination);source.start(0);
    }catch{ /* 解锁失败时下一次手势再试。 */ }
  }

  private sampleUrl(file:string):string{
    if(typeof document!=='undefined'&&document.baseURI)return new URL(file,document.baseURI).href;
    return '/'+file.replace(/^\//,'');
  }
  private async loadUrl(context:AudioContext,file:string):Promise<AudioBuffer|null>{
    try{
      const readBytes=window.__DORO_MAPP__?.readBytes;
      if(readBytes){
        const data=await readBytes(file);
        const copy=new ArrayBuffer(data.byteLength);
        new Uint8Array(copy).set(data);
        return await context.decodeAudioData(copy);
      }
      const response=await fetch(this.sampleUrl(file));
      if(!response.ok)return null;
      return await context.decodeAudioData(await response.arrayBuffer());
    }catch{return null;}
  }
  private async prepare():Promise<void>{
    const context=this.context;if(!context)return;
    for(const [name,file] of Object.entries(SAMPLE_FILES) as [SoundName,string|string[]][]){
      const files=Array.isArray(file)?file:[file];
      for(const item of files){
        const buffer=await this.loadUrl(context,item);
        if(buffer)this.buffers.set(item,buffer);
      }
      if(!this.buffers.has(Array.isArray(file)?file[0]:file)&&typeof OfflineAudioContext!=='undefined'){
        try{
          const recipe=SYNTH_RECIPES[name],duration=recipeDuration(recipe)+.04;
          const offline=new OfflineAudioContext(1,Math.ceil(context.sampleRate*duration),context.sampleRate);
          scheduleRecipe(offline,offline.destination,recipe,0);
          this.buffers.set(name,await offline.startRendering());
        }catch{ /* 离线音频不可用时沿用即时合成。 */ }
      }
    }
  }

  setEnabled(enabled:boolean):void{
    this.enabled=enabled;
    if(this.master)this.master.gain.value=enabled?MASTER_GAIN:0;
    if(enabled&&this.context)this.unlock();
    else this.suspend();
  }

  suspend():void{
    for(const [voice,slot] of this.voices){try{voice.stop();}catch{ /* 音符可能已经结束。 */ }try{slot.gain.disconnect();}catch{ /* already torn down */ }}
    this.voices.clear();
    if(this.context?.state==='running')void this.context.suspend().catch(()=>{});
  }

  private duckAction(context:AudioContext,priority:number):void{
    const bus=this.actionBus;if(!bus||priority<8)return;
    const now=context.currentTime,restore=BUS_GAIN.action;
    try{
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value,now);
      bus.gain.linearRampToValueAtTime(DUCK_GAIN,now+.02);
      bus.gain.linearRampToValueAtTime(restore,now+DUCK_MS/1000);
    }catch{ /* 部分浏览器对正在调度的增益节点更严格。 */ }
  }

  private stealVoice(priority:number):boolean{
    if(this.voices.size<VOICE_CAP)return true;
    let victim:AudioScheduledSourceNode|null=null;let lowest=priority;
    for(const [voice,slot] of this.voices){
      if(slot.priority<lowest){lowest=slot.priority;victim=voice;}
    }
    if(!victim)return false;
    const slot=this.voices.get(victim);if(!slot)return false;
    try{victim.stop();}catch{ /* already ended */ }
    try{slot.gain.disconnect();}catch{ /* already torn down */ }
    this.voices.delete(victim);
    return true;
  }

  /** 播放一段现场合成的短句（不引入新素材）。走分类总线，并计入复音上限。 */
  cue(recipe:SynthVoice[],options:CueOptions={}):void {
    if(!this.enabled||(typeof document!=='undefined'&&document.hidden)||!recipe.length)return;
    this.unlock();
    const context=this.context;
    if(!context||context.state!=='running'||!this.master)return;
    const priority=options.bus==='reward'?8:2;
    if(!this.stealVoice(priority))return;
    try{
      this.duckAction(context,priority);
      const gain=context.createGain();
      gain.gain.value=Math.max(0,Math.min(1,options.gain??1));
      const bus=this.buses.get(options.bus??'ui')??this.master;
      gain.connect(bus);
      const sources=scheduleRecipe(context,gain,recipe,context.currentTime+Math.max(0,options.delay??0));
      const lead=sources[0];
      if(lead){
        this.voices.set(lead,{priority,gain});
        lead.onended=()=>{this.voices.delete(lead);try{gain.disconnect();}catch{ /* already torn down */ }};
      }
    }catch{ /* 合成失败不影响游戏。 */ }
  }

  play(name:SoundName,options:PlayOptions={}):void{
    if(!this.enabled||(typeof document!=='undefined'&&document.hidden))return;
    this.unlock();
    const context=this.context,spec=SOUND_SPEC[name];
    if(!context||context.state!=='running'||!this.master)return;
    const now=context.currentTime;
    if(spec.coalesce&&now-(this.lastPlayed.get(name)??-10)<spec.coalesce)return;
    if(!this.stealVoice(spec.priority))return;
    this.lastPlayed.set(name,now);
    const bus=this.buses.get(spec.bus)??this.master;
    const rate=1+(Math.random()*2-1)*spec.rateJitter;
    const gainValue=spec.gain*(1+(Math.random()*2-1)*spec.gainJitter);
    try{
      this.duckAction(context,spec.priority);
      const files=SAMPLE_FILES[name];
      const file=Array.isArray(files)?files[Math.max(0,Math.min(files.length-1,options.tone??0))]:files;
      const buffer=(file&&this.buffers.get(file))||this.buffers.get(name);
      const gain=context.createGain();
      gain.gain.setValueAtTime(0,now);
      gain.gain.linearRampToValueAtTime(gainValue,now+.002);
      gain.connect(bus);
      if(buffer){
        const source=context.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;
        source.connect(gain);
        this.voices.set(source,{priority:spec.priority,gain});
        source.onended=()=>{this.voices.delete(source);try{source.disconnect();gain.disconnect();}catch{ /* already torn down */ }};
        source.start(now);return;
      }
      const sources=scheduleRecipe(context,gain,SYNTH_RECIPES[name],now);
      const lead=sources[0];
      if(lead){
        this.voices.set(lead,{priority:spec.priority,gain});
        lead.onended=()=>{this.voices.delete(lead);try{gain.disconnect();}catch{ /* already torn down */ }};
      }
    }catch{ /* 浏览器中止音频后，下一次手势会重新尝试。 */ }
  }
}
