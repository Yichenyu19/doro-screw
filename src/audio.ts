export type SoundName='pick'|'arrive'|'box'|'refill'|'loosen'|'fall'|'reveal'|'chain'|'win'|'tool'|'blocked'|'wall';
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
/** 采样缺失时的后备合成。运行时优先播放 public/sfx 里的短采样。 */
export const SYNTH_RECIPES:Record<SoundName,SynthVoice[]>={
  pick:[{osc:'triangle',freq:780,freqEnd:920,start:0,dur:.055,gain:.055,attack:.004},{osc:'sine',freq:2100,freqEnd:1600,start:.002,dur:.03,gain:.035,attack:.001},{noise:'white',start:0,dur:.022,gain:.02,attack:.001,filter:'highpass',filterFreq:2500,filterQ:.7}],
  arrive:[{osc:'sine',freq:210,freqEnd:140,start:0,dur:.09,gain:.07,attack:.006},{osc:'triangle',freq:640,freqEnd:480,start:.008,dur:.07,gain:.035,attack:.004},{noise:'brown',start:0,dur:.05,gain:.03,attack:.002,filter:'lowpass',filterFreq:900,filterQ:.6}],
  box:[{osc:'triangle',freq:520,freqEnd:430,start:0,dur:.11,gain:.08,attack:.005},{osc:'sine',freq:980,start:.02,dur:.1,gain:.05,attack:.006},{osc:'sine',freq:1470,start:.04,dur:.12,gain:.03,attack:.008},{noise:'white',start:0,dur:.04,gain:.025,attack:.002,filter:'bandpass',filterFreq:1200,filterQ:1.2}],
  refill:[{osc:'sine',freq:660,freqEnd:880,start:0,dur:.12,gain:.06,attack:.008},{osc:'triangle',freq:880,freqEnd:1175,start:.055,dur:.13,gain:.05,attack:.01},{noise:'white',start:.02,dur:.08,gain:.018,attack:.01,filter:'highpass',filterFreq:1800,filterQ:.8}],
  loosen:[{osc:'triangle',freq:340,freqEnd:190,start:0,dur:.2,gain:.04,attack:.02},{osc:'square',freq:190,freqEnd:120,start:.03,dur:.16,gain:.012,attack:.03},{noise:'brown',start:0,dur:.18,gain:.035,attack:.015,filter:'lowpass',filterFreq:700,filterQ:.8}],
  fall:[{osc:'sine',freq:92,freqEnd:48,start:0,dur:.28,gain:.14,attack:.003},{osc:'triangle',freq:220,freqEnd:90,start:.008,dur:.16,gain:.06,attack:.004},{noise:'white',start:0,dur:.12,gain:.08,attack:.001,filter:'lowpass',filterFreq:1600,filterQ:.5},{noise:'brown',start:.02,dur:.22,gain:.05,attack:.008,filter:'lowpass',filterFreq:400,filterQ:.6}],
  reveal:[{osc:'sine',freq:1240,freqEnd:1860,start:0,dur:.2,gain:.04,attack:.02},{osc:'triangle',freq:1860,freqEnd:2480,start:.05,dur:.18,gain:.025,attack:.03},{noise:'white',start:0,dur:.22,gain:.03,attack:.02,filter:'bandpass',filterFreq:3200,filterQ:1.4}],
  chain:[{osc:'triangle',freq:660,start:0,dur:.08,gain:.06,attack:.006},{osc:'triangle',freq:880,start:.06,dur:.08,gain:.06,attack:.006},{osc:'sine',freq:1320,start:.12,dur:.1,gain:.05,attack:.006},{osc:'sine',freq:1760,start:.18,dur:.12,gain:.04,attack:.008}],
  win:[{osc:'triangle',freq:523,start:0,dur:.16,gain:.07,attack:.01},{osc:'triangle',freq:659,start:.09,dur:.16,gain:.07,attack:.01},{osc:'sine',freq:784,start:.18,dur:.18,gain:.07,attack:.01},{osc:'sine',freq:1047,start:.27,dur:.2,gain:.06,attack:.012},{osc:'sine',freq:1319,start:.36,dur:.24,gain:.05,attack:.014}],
  tool:[{osc:'triangle',freq:430,start:0,dur:.08,gain:.05,attack:.005},{osc:'sine',freq:860,start:.04,dur:.1,gain:.04,attack:.006},{noise:'white',start:0,dur:.04,gain:.015,attack:.002,filter:'bandpass',filterFreq:2000,filterQ:1}],
  blocked:[{osc:'sine',freq:180,freqEnd:120,start:0,dur:.12,gain:.05,attack:.003},{noise:'brown',start:0,dur:.08,gain:.025,attack:.002,filter:'lowpass',filterFreq:300,filterQ:.7}],
  wall:[{osc:'sine',freq:196,freqEnd:98,start:0,dur:.32,gain:.12,attack:.004},{osc:'triangle',freq:392,start:0,dur:.28,gain:.06,attack:.006},{osc:'sine',freq:587,start:.04,dur:.3,gain:.05,attack:.008},{noise:'white',start:0,dur:.12,gain:.06,attack:.001,filter:'lowpass',filterFreq:1800,filterQ:.5}],
};
const COALESCE:Partial<Record<SoundName,number>>={refill:.06,reveal:.08,fall:.08,box:.05,chain:.08,win:.2,wall:.25,pick:.03,arrive:.02};
const VOICE_CAP=6;
const SAMPLE_FILES:Partial<Record<SoundName,string|string[]>>={
  pick:'sfx/pick.ogg',loosen:'sfx/loosen.ogg',
  arrive:['sfx/arrive-0.ogg','sfx/arrive-1.ogg','sfx/arrive-2.ogg'],
  box:'sfx/box.ogg',refill:'sfx/refill.ogg',fall:'sfx/fall.ogg',reveal:'sfx/reveal.ogg',
  tool:'sfx/tool.ogg',blocked:'sfx/blocked.ogg',chain:'sfx/chain.ogg',win:'sfx/win.ogg',wall:'sfx/wall.ogg',
};

function noiseBuffer(context:BaseAudioContext,kind:'white'|'brown',seconds=.35):AudioBuffer{
  const length=Math.max(1,Math.ceil(context.sampleRate*seconds)),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
  let last=0;
  for(let i=0;i<length;i++){const white=Math.random()*2-1;last=kind==='brown'?(last+0.02*white)/1.02:white;data[i]=last;}
  return buffer;
}

export function scheduleRecipe(context:BaseAudioContext,destination:AudioNode,recipe:SynthVoice[],when=0):void{
  const noiseCache=new Map<string,AudioBuffer>();
  for(const voice of recipe){
    const start=when+voice.start,end=start+voice.dur,gain=context.createGain();
    gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(voice.gain,start+Math.max(.001,Math.min(voice.attack,voice.dur/3)));
    gain.gain.exponentialRampToValueAtTime(.001,end);
    let node:AudioNode;
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
  }
}

export interface PlayOptions{tone?:number}

/** 短音效在第一次用户手势后启用；音频失败不影响任何游戏动作。 */
export class GameAudio {
  private context:AudioContext|null=null;
  private enabled=true;
  private voices=new Set<AudioScheduledSourceNode>();
  private buffers=new Map<string,AudioBuffer>();
  private preparing=false;
  private lastPlayed=new Map<SoundName,number>();

  constructor(enabled:boolean) { this.enabled=enabled; }

  unlock():void {
    if (!this.enabled || document.hidden) return;
    try {
      this.context??=new AudioContext();
      if (this.context.state==='suspended') void this.context.resume().catch(()=>{});
      if(!this.preparing){this.preparing=true;void this.prepare();}
    } catch { /* 无音频设备时仍然正常游玩。 */ }
  }
  private sampleUrl(file:string):string{
    if(typeof document!=='undefined'&&document.baseURI)return new URL(file,document.baseURI).href;
    return '/'+file.replace(/^\//,'');
  }
  private async loadUrl(context:AudioContext,file:string):Promise<AudioBuffer|null>{
    try{
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
          const recipe=SYNTH_RECIPES[name],duration=recipe.reduce((max,voice)=>Math.max(max,voice.start+voice.dur),0)+.04;
          const offline=new OfflineAudioContext(1,Math.ceil(context.sampleRate*duration),context.sampleRate);
          scheduleRecipe(offline,offline.destination,recipe,0);
          this.buffers.set(name,await offline.startRendering());
        }catch{ /* 离线音频不可用时沿用即时合成。 */ }
      }
    }
  }

  setEnabled(enabled:boolean):void {
    this.enabled=enabled;
    if (enabled && this.context) this.unlock();
    else this.suspend();
  }

  suspend():void {
    for (const voice of this.voices) { try {voice.stop();} catch { /* 音符可能已经结束。 */ } }
    this.voices.clear();
    if (this.context?.state==='running') void this.context.suspend().catch(()=>{});
  }

  play(name:SoundName,options:PlayOptions={}):void {
    if (!this.enabled || document.hidden) return;
    this.unlock();
    const context=this.context;
    if (!context || context.state!=='running') return;
    const gap=COALESCE[name]??0,now=context.currentTime;
    if(gap&&now-(this.lastPlayed.get(name)??-10)<gap)return;
    this.lastPlayed.set(name,now);
    try {
      if(this.voices.size>=VOICE_CAP){
        const oldest=this.voices.values().next().value;
        if(oldest){try{oldest.stop();}catch{ /* already ended */ }this.voices.delete(oldest);}
      }
      const files=SAMPLE_FILES[name];
      const file=Array.isArray(files)?files[Math.max(0,Math.min(files.length-1,options.tone??0))]:files;
      const buffer=(file&&this.buffers.get(file))||this.buffers.get(name);
      const rate=1+(Math.random()*0.06-0.03);
      const gainValue=1+(Math.random()*0.16-0.08);
      if(buffer){
        const source=context.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;
        const gain=context.createGain();gain.gain.value=gainValue;
        source.connect(gain);gain.connect(context.destination);
        this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};
        source.start();return;
      }
      scheduleRecipe(context,context.destination,SYNTH_RECIPES[name],now);
    } catch { /* 浏览器中止音频后，下一次手势会重新尝试。 */ }
  }
}
