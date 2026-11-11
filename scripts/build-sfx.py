#!/usr/bin/env python3
"""Crop, limit and encode game SFX. Outputs public/sfx/*.ogg and review wavs. Measurements printed as JSON."""
from __future__ import annotations
import json, subprocess, shutil
from pathlib import Path
import numpy as np

SR=48000
RAW=Path('/tmp/doro-sfx-raw')
OUT_OGG=Path('/workspace/doro-screw/public/sfx')
OUT_WAV=Path('/workspace/doro-screw-review/sfx-v2')
OUT_OGG.mkdir(parents=True, exist_ok=True)
OUT_WAV.mkdir(parents=True, exist_ok=True)

def decode(path:Path, start=0.0, dur=None)->np.ndarray:
    cmd=['ffmpeg','-v','error','-ss',str(start),'-i',str(path),'-ac','1','-ar',str(SR)]
    if dur is not None: cmd.extend(['-t',str(dur)])
    cmd.extend(['-f','f32le','-'])
    data=subprocess.check_output(cmd)
    return np.frombuffer(data,dtype=np.float32).copy()

def fade(y:np.ndarray, attack=0.003, release=0.05)->np.ndarray:
    y=np.array(y,dtype=np.float32,copy=True)
    n=len(y)
    a=min(n,int(attack*SR)); r=min(n,int(release*SR))
    if a: y[:a]*=np.linspace(0,1,a,dtype=np.float32)
    if r: y[-r:]*=np.linspace(1,0,r,dtype=np.float32)
    return y

def highpass(y:np.ndarray, freq=70.0)->np.ndarray:
    # 1-pole
    rc=1/(2*np.pi*freq); dt=1/SR; alpha=rc/(rc+dt)
    out=np.zeros_like(y); prev=0; prevx=0
    for i,x in enumerate(y):
        out[i]=alpha*(prev+x-prevx); prev=out[i]; prevx=x
    return out.astype(np.float32)

def peak_normalize(y:np.ndarray, peak=0.89)->np.ndarray:
    m=float(np.max(np.abs(y))) if y.size else 0
    if m<=1e-6: return y
    return (y*(peak/m)).astype(np.float32)

def mix(*parts:np.ndarray, gains=None)->np.ndarray:
    gains=gains or [1]*len(parts)
    n=max(len(p) for p in parts)
    acc=np.zeros(n,dtype=np.float32)
    for p,g in zip(parts,gains):
        acc[:len(p)]+=p*g
    return acc

def write_wav(path:Path, y:np.ndarray):
    # 48k 24-bit via ffmpeg
    path.parent.mkdir(parents=True, exist_ok=True)
    proc=subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(SR),'-ac','1','-i','pipe:0','-c:a','pcm_s24le',str(path)],input=y.astype(np.float32).tobytes(),check=True)

def write_ogg(path:Path, y:np.ndarray, br='64k'):
    proc=subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(SR),'-ac','1','-i','pipe:0','-c:a','libvorbis','-b:a',br,str(path)],input=y.astype(np.float32).tobytes(),check=True)

def measure(path:Path)->dict:
    err=subprocess.run(['ffmpeg','-nostats','-i',str(path),'-filter_complex','ebur128=peak=true','-f','null','-'],capture_output=True,text=True).stderr
    vd=subprocess.run(['ffmpeg','-i',str(path),'-af','volumedetect,astats=metadata=1:reset=1','-f','null','-'],capture_output=True,text=True).stderr
    import re
    def grab(pat, text, default=None):
        m=re.search(pat,text)
        return float(m.group(1)) if m else default
    dur=grab(r'Duration: (\d+):(\d+):(\d+\.\d+)', err)
    # duration from ffprobe
    import json as _j
    meta=_j.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size','-of','json',str(path)]))
    duration=float(meta['format']['duration'])
    size=int(meta['format']['size'])
    tp_list=re.findall(r'Peak:\s+([-\d.]+)', err)
    # true peak last "True peak" block
    tps=re.findall(r'True peak:.*?Peak:\s+([-\d.]+)', err, re.S)
    return{
        'file':path.name,
        'duration_s':round(duration,3),
        'bytes':size,
        'lufs_i':grab(r'I:\s+([-\d.]+) LUFS',err),
        'true_peak_db':float(tps[-1]) if tps else None,
        'max_volume_db':grab(r'max_volume:\s+([-\d.]+) dB',vd),
        'rms_db':grab(r'RMS_level:\s+([-\d.]+)',vd) or grab(r'mean_volume:\s+([-\d.]+) dB',vd),
    }

def synth_tone(freq,dur,gain=0.12,*,attack=0.006,kind='sine',freq_end=None)->np.ndarray:
    n=int(dur*SR); t=np.arange(n)/SR
    if freq_end:
        # exponential sweep
        k=np.log(freq_end/freq)/(dur if dur else 1)
        phase=freq*(np.exp(k*t)-1)/(k if k else 1)
        x=np.sin(2*np.pi*phase)
    else:
        x=np.sin(2*np.pi*freq*t)
        if kind=='triangle':
            x=2*np.abs(2*(t*freq-np.floor(t*freq+0.5)))-1
    env=np.ones(n,dtype=np.float32)
    a=min(n,int(attack*SR)); r=min(n,int(0.08*SR))
    if a: env[:a]=np.linspace(0,1,a)
    if r: env[-r:]=np.linspace(env[-r] if r<n else 1,0,r)
    # exp decay
    env*=np.exp(-t*8).astype(np.float32)
    return (x*env*gain).astype(np.float32)

R=RAW
clips={}
# long sources
clips['pick']=fade(highpass(decode(R/'fs_353245_screwing-and-unscrewing-brass.mp3',5.492,0.32),120),0.002,0.06)
clips['pick_tick']=fade(decode(R/'fs_442313_Metal-Tssht.mp3',0.0,0.09),0.001,0.03)
clips['loosen']=fade(highpass(decode(R/'fs_706440_Flashlight-battery-compartment-unscrew.mp3',3.17,0.42),80),0.004,0.08)
clips['arrive']=fade(decode(R/'fs_220179_Click-Metal-Ting.mp3',0.0,0.42),0.001,0.08)
clips['glass']=fade(decode(R/'mk_2936_Wine-glass-clink.wav',0.02,0.55),0.002,0.12)
clips['glass2']=fade(decode(R/'mk_2183_Glass-hitting-a-metal.wav',0.0,0.4),0.002,0.1)
clips['plate']=fade(highpass(decode(R/'mk_3158_Thin-metal-plate-drop.wav',0.0,0.7),50),0.002,0.12)
clips['tool_drop']=fade(highpass(decode(R/'mk_835_Metal-tool-drop.wav',0.0,0.7),50),0.002,0.12)
clips['hammer']=fade(decode(R/'mk_833_Metal-hammer-hit.wav',0.0,0.4),0.001,0.1)
clips['ascend']=fade(decode(R/'fs_422516_Menu-FX-03-ascending-wav.mp3',0.0,0.29),0.002,0.06)
clips['plastic']=fade(decode(R/'fs_63531_click1-wav.mp3',0.0,0.13),0.001,0.03)
clips['plastic2']=fade(decode(R/'fs_448393_Satisfying-Plastic-Handle-Unlock.mp3',0.48,0.35),0.002,0.08)
clips['clasp']=fade(decode(R/'fs_822397_small-metal-clasp-open-close-switching.mp3',0.0,0.18),0.001,0.05)
clips['snap']=fade(decode(R/'fs_582904_Snap-Click-03-wav.mp3',0.0,0.18),0.001,0.05)
clips['clamp']=fade(highpass(decode(R/'fs_181635_Tools-Screw-Clamp-wav.mp3',10.62,0.35),100),0.003,0.08)

def bank():
    pick=peak_normalize(mix(clips['pick'],clips['pick_tick'],clips['clamp'],gains=[0.85,0.35,0.28]),0.72)
    loosen=peak_normalize(mix(clips['loosen'],clips['clamp'],gains=[1.0,0.25]),0.62)
    arrive0=peak_normalize(mix(clips['arrive'],synth_tone(520,0.14,0.05),gains=[1,0.6]),0.7)
    arrive1=peak_normalize(mix(clips['arrive'],synth_tone(620,0.14,0.055),gains=[1,0.7]),0.7)
    arrive2=peak_normalize(mix(clips['arrive'],clips['glass'],synth_tone(740,0.16,0.06),gains=[0.85,0.4,0.7]),0.74)
    box=peak_normalize(mix(clips['glass'],clips['ascend'],synth_tone(523,0.22,0.07),synth_tone(659,0.22,0.06),synth_tone(784,0.28,0.05),gains=[0.7,0.45,1,1,1]),0.8)
    refill=peak_normalize(mix(clips['clasp'],synth_tone(660,0.16,0.05,freq_end=880),synth_tone(880,0.16,0.04,freq_end=1100),gains=[0.8,0.8,0.6]),0.65)
    fall=peak_normalize(mix(clips['plate'],clips['tool_drop'],synth_tone(70,0.28,0.08,freq_end=42),gains=[0.9,0.35,0.5]),0.78)
    reveal=peak_normalize(mix(clips['ascend'],synth_tone(1240,0.2,0.035,freq_end=1860),gains=[0.9,0.5]),0.6)
    tool=peak_normalize(mix(clips['plastic'],clips['plastic2'],gains=[0.9,0.45]),0.65)
    blocked=peak_normalize(mix(clips['snap'],synth_tone(160,0.12,0.05,freq_end=110),gains=[0.7,0.6]),0.55)
    chain=peak_normalize(mix(clips['glass'],clips['ascend'],synth_tone(660,0.1,0.05),synth_tone(880,0.1,0.05),synth_tone(1320,0.14,0.04),gains=[0.4,0.5,1,1,1]),0.72)
    win=peak_normalize(mix(clips['glass'],clips['ascend'],synth_tone(523,0.2,0.06),synth_tone(659,0.2,0.06),synth_tone(784,0.24,0.05),synth_tone(1047,0.28,0.045),gains=[0.55,0.5,1,1,1,1]),0.8)
    wall=peak_normalize(mix(clips['hammer'],clips['plate'],clips['glass'],clips['ascend'],synth_tone(196,0.32,0.08,freq_end=98),synth_tone(392,0.28,0.06),synth_tone(587,0.3,0.05),gains=[0.7,0.55,0.4,0.45,0.8,0.7,0.6]),0.78)
    return{
        'pick':pick,'loosen':loosen,'arrive-0':arrive0,'arrive-1':arrive1,'arrive-2':arrive2,
        'box':box,'refill':refill,'fall':fall,'reveal':reveal,'tool':tool,'blocked':blocked,
        'chain':chain,'win':win,'wall':wall,
    }

def main():
    sounds=bank()
    report=[]
    for name,y in sounds.items():
        wav=OUT_WAV/f'{name}.wav'
        ogg=OUT_OGG/f'{name}.ogg'
        write_wav(wav,y)
        write_ogg(ogg,y)
        m=measure(wav)
        m['ogg_bytes']=ogg.stat().st_size
        report.append(m)
        print(name, m)
    total=sum(p.stat().st_size for p in OUT_OGG.glob('*.ogg'))
    (OUT_WAV/'measurements.json').write_text(json.dumps({'total_ogg_bytes':total,'clips':report},indent=2),encoding='utf-8')
    print('TOTAL_OGG', total, 'MiB', round(total/1048576,3))

if __name__=='__main__':
    main()
