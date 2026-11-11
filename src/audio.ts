type SoundName='pick'|'arrive'|'box'|'loosen'|'fall'|'chain'|'win'|'tool'|'blocked';
const NOTES:Record<SoundName,number[]>={pick:[840,1220],arrive:[1180],loosen:[380,290],fall:[150,100],chain:[660,880,1320,1760],box:[620,830,1240],win:[523,659,784,1047,1319],tool:[430,860],blocked:[230,180]};

/** 短音效在第一次用户手势后启用；音频失败不影响任何游戏动作。 */
export class GameAudio {
  private context:AudioContext|null=null;
  private enabled=true;
  private voices=new Set<AudioScheduledSourceNode>();
  private buffers=new Map<SoundName,AudioBuffer>();
  private preparing=false;

  constructor(enabled:boolean) { this.enabled=enabled; }

  unlock():void {
    if (!this.enabled || document.hidden) return;
    try {
      this.context??=new AudioContext();
      if (this.context.state==='suspended') void this.context.resume().catch(()=>{});
      if(!this.preparing){this.preparing=true;void this.prepare();}
    } catch { /* 无音频设备时仍然正常游玩。 */ }
  }
  private async prepare():Promise<void>{
    if(typeof OfflineAudioContext==='undefined'||!this.context)return;
    for(const name of Object.keys(NOTES) as SoundName[]){
      try{const rate=this.context.sampleRate,duration=(NOTES[name].length-1)*(name==='win'?.095:.045)+.16,offline=new OfflineAudioContext(1,Math.ceil(rate*duration),rate);
        NOTES[name].forEach((frequency,index)=>{
          const oscillator=offline.createOscillator(),gain=offline.createGain(),start=index*(name==='win'?.095:.045);oscillator.type=name==='blocked'?'sine':'triangle';
          oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(frequency*1.035,start+.075);
          gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(name==='win'?.07:.045,start+.006);gain.gain.exponentialRampToValueAtTime(.001,start+.13);
          oscillator.connect(gain);gain.connect(offline.destination);oscillator.start(start);oscillator.stop(start+.15);
        });this.buffers.set(name,await offline.startRendering());
      }catch{ /* 离线音频不可用时沿用即时合成。 */ }
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

  play(name:SoundName):void {
    if (!this.enabled || document.hidden) return;
    this.unlock();
    const context=this.context;
    if (!context || context.state!=='running') return;
    try {
      const buffer=this.buffers.get(name);if(buffer){const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();};source.start();return;}
      NOTES[name].forEach((frequency,index)=>{
        const oscillator=context.createOscillator();
        const gain=context.createGain();
        const start=context.currentTime+index*(name==='win'?.095:.045);
        oscillator.type=name==='blocked'?'sine':'triangle';
        oscillator.frequency.setValueAtTime(frequency,start);
        oscillator.frequency.exponentialRampToValueAtTime(frequency*1.035,start+.075);
        gain.gain.setValueAtTime(0,start);
        gain.gain.linearRampToValueAtTime(name==='win'?.07:.045,start+.006);
        gain.gain.exponentialRampToValueAtTime(.001,start+.13);
        oscillator.connect(gain);
        gain.connect(context.destination);
        this.voices.add(oscillator);
        oscillator.onended=()=>{this.voices.delete(oscillator);oscillator.disconnect();gain.disconnect();};
        oscillator.start(start);
        oscillator.stop(start+.15);
      });
    } catch { /* 浏览器中止音频后，下一次手势会重新尝试。 */ }
  }
}

