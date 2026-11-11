import type {SynthVoice} from '../audio';

/** 全部现场合成，不新增任何采样素材。增益刻意压低，交给混音链统一控制响度。 */
const note=(freq:number,start:number,dur:number,gain:number,osc:OscillatorType='square'):SynthVoice=>({osc,freq,start,dur,gain,attack:.004});
const N={C5:523.25,D5:587.33,E5:659.25,G5:783.99,A5:880,B5:987.77,C6:1046.5,D6:1174.66,E6:1318.51};

export const DELIGHT_SOUNDS={
  /** 序列号滚动时的单个像素滴答。 */
  keyTick:[note(1568,0,.022,.016),{noise:'white',start:0,dur:.01,gain:.006,attack:.001,filter:'highpass',filterFreq:5000,filterQ:.7}] as SynthVoice[],
  /** 补丁打完：八拍原创方波短句，像老式注册机的结尾。 */
  patchJingle:[
    note(N.E5,0,.07,.022),note(N.A5,.075,.07,.022),note(N.C6,.15,.07,.022),note(N.E6,.225,.1,.02),
    note(N.D6,.34,.07,.02),note(N.B5,.415,.07,.02),note(N.G5,.49,.07,.02),note(N.A5,.565,.22,.024,'triangle'),
    note(N.A5/2,0,.3,.02,'triangle'),note(N.E5/2,.34,.3,.018,'triangle'),
  ] as SynthVoice[],
  /** 后续使用只留两声确认，不重复整段。 */
  patchShort:[note(N.C6,0,.05,.018),note(N.E6,.06,.09,.018)] as SynthVoice[],
  /** 墙裂：高频碎响与两声玻璃余振。 */
  crack:[
    {noise:'white',start:0,dur:.05,gain:.05,attack:.001,filter:'highpass',filterFreq:3200,filterQ:.8},
    {noise:'white',start:.06,dur:.04,gain:.035,attack:.001,filter:'highpass',filterFreq:4200,filterQ:.8},
    {noise:'white',start:.11,dur:.07,gain:.04,attack:.001,filter:'bandpass',filterFreq:2600,filterQ:1.1},
    {osc:'triangle',freq:2637,freqEnd:2349,start:.12,dur:.32,gain:.016,attack:.004},
    {osc:'sine',freq:3520,freqEnd:3136,start:.18,dur:.28,gain:.01,attack:.004},
  ] as SynthVoice[],
  /** 印章落下：一记闷响。 */
  stamp:[
    {osc:'sine',freq:120,freqEnd:52,start:0,dur:.2,gain:.11,attack:.003},
    {noise:'brown',start:0,dur:.12,gain:.06,attack:.002,filter:'lowpass',filterFreq:500,filterQ:.6},
    {noise:'white',start:0,dur:.02,gain:.02,attack:.001,filter:'bandpass',filterFreq:1800,filterQ:1},
  ] as SynthVoice[],
  /** 首页戳 Doro：软弹。 */
  boing:[{osc:'sine',freq:240,freqEnd:470,start:0,dur:.11,gain:.05,attack:.006},{osc:'triangle',freq:470,freqEnd:360,start:.09,dur:.1,gain:.02,attack:.01}] as SynthVoice[],
  /** 戳晕：下滑小哨。 */
  dizzy:[{osc:'sine',freq:1250,freqEnd:520,start:0,dur:.38,gain:.03,attack:.02},{osc:'sine',freq:1500,freqEnd:640,start:.05,dur:.36,gain:.014,attack:.02}] as SynthVoice[],
  /** 长按鼓起后松手：噗。 */
  pop:[{noise:'white',start:0,dur:.04,gain:.04,attack:.001,filter:'bandpass',filterFreq:1400,filterQ:1.3},{osc:'sine',freq:520,freqEnd:980,start:.01,dur:.09,gain:.04,attack:.004}] as SynthVoice[],
  /** 长按蓄气：缓慢上扬的细音。 */
  inflate:[{osc:'triangle',freq:220,freqEnd:440,start:0,dur:.65,gain:.018,attack:.2}] as SynthVoice[],
};
export type DelightSound=keyof typeof DELIGHT_SOUNDS;
