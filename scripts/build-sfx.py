#!/usr/bin/env python3
"""Crop, limit and encode game SFX (revision 4, mix v3).

Outputs public/sfx/*.ogg and review WAVs under /workspace/doro-screw-review/sfx-v3/.
Raw inputs stay in /tmp/doro-sfx-raw and are not committed.
"""
from __future__ import annotations
import json, subprocess, sys
from pathlib import Path
import numpy as np

SR = 48000
ROOT = Path(__file__).resolve().parents[1]
RAW = Path("/tmp/doro-sfx-raw")
OUT_OGG = ROOT / "public" / "sfx"
OUT_WAV = Path("/workspace/doro-screw-review/sfx-v3")
RNG = np.random.default_rng(20261111)

def decode(path: Path, start=0.0, dur=None) -> np.ndarray:
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", str(path), "-ac", "1", "-ar", str(SR)]
    if dur is not None:
        cmd.extend(["-t", str(dur)])
    cmd.extend(["-f", "f32le", "-"])
    data = subprocess.check_output(cmd)
    return np.frombuffer(data, dtype=np.float32).copy()

def fade(y: np.ndarray, attack=0.003, release=0.05) -> np.ndarray:
    y = np.array(y, dtype=np.float32, copy=True)
    n = len(y)
    a = min(n, int(attack * SR))
    r = min(n, int(release * SR))
    if a:
        y[:a] *= np.linspace(0, 1, a, dtype=np.float32)
    if r:
        y[-r:] *= np.linspace(1, 0, r, dtype=np.float32)
    return y

def highpass(y: np.ndarray, freq=70.0) -> np.ndarray:
    rc = 1 / (2 * np.pi * freq)
    dt = 1 / SR
    alpha = rc / (rc + dt)
    out = np.zeros_like(y)
    prev = 0.0
    prevx = 0.0
    for i, x in enumerate(y):
        out[i] = alpha * (prev + x - prevx)
        prev = out[i]
        prevx = x
    return out.astype(np.float32)

def lowpass(y: np.ndarray, freq=8000.0) -> np.ndarray:
    dt = 1 / SR
    rc = 1 / (2 * np.pi * freq)
    alpha = dt / (rc + dt)
    out = np.zeros_like(y)
    prev = 0.0
    for i, x in enumerate(y):
        prev = prev + alpha * (x - prev)
        out[i] = prev
    return out.astype(np.float32)

def lowpass_n(y: np.ndarray, freq=8000.0, poles=3) -> np.ndarray:
    for _ in range(poles):
        y = lowpass(y, freq)
    return y

def peak_normalize(y: np.ndarray, peak=0.89) -> np.ndarray:
    m = float(np.max(np.abs(y))) if y.size else 0.0
    if m <= 1e-6:
        return y
    return (y * (peak / m)).astype(np.float32)

def place(dst: np.ndarray, src: np.ndarray, at=0.0, gain=1.0) -> np.ndarray:
    start = int(round(at * SR))
    if start < 0:
        src = src[-start:]
        start = 0
    end = start + len(src)
    if end > len(dst):
        out = np.zeros(end, dtype=np.float32)
        out[: len(dst)] = dst
        dst = out
    dst[start : start + len(src)] += src * gain
    return dst

def mix(*parts: np.ndarray, gains=None, offsets=None) -> np.ndarray:
    gains = gains or [1] * len(parts)
    offsets = offsets or [0] * len(parts)
    total = 0
    for p, off in zip(parts, offsets):
        total = max(total, int(round(off * SR)) + len(p))
    acc = np.zeros(total, dtype=np.float32)
    for p, g, off in zip(parts, gains, offsets):
        acc = place(acc, p, off, g)
    return acc

def write_wav(path: Path, y: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0", "-c:a", "pcm_s24le", str(path)],
        input=y.astype(np.float32).tobytes(),
        check=True,
    )

def write_ogg(path: Path, y: np.ndarray, br="64k") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0", "-c:a", "libvorbis", "-b:a", br, str(path)],
        input=y.astype(np.float32).tobytes(),
        check=True,
    )

def synth_tone(freq, dur, gain=0.12, *, attack=0.006, release=0.08, kind="sine", freq_end=None, decay=8.0) -> np.ndarray:
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    if freq_end:
        k = np.log(max(freq_end, 20) / max(freq, 20)) / (dur if dur else 1)
        phase = freq * (np.exp(k * t) - 1) / (k if k else 1)
        x = np.sin(2 * np.pi * phase)
    else:
        x = np.sin(2 * np.pi * freq * t)
        if kind == "triangle":
            x = 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1
        elif kind == "square":
            x = np.sign(np.sin(2 * np.pi * freq * t))
    env = np.ones(n, dtype=np.float32)
    a = min(n, int(attack * SR))
    r = min(n, int(release * SR))
    if a:
        env[:a] = np.linspace(0, 1, a, dtype=np.float32)
    if r:
        env[-r:] *= np.linspace(1, 0, r, dtype=np.float32)
    env *= np.exp(-t * decay).astype(np.float32)
    return fade((x * env * gain).astype(np.float32), 0.002, 0.01)

def noise_whoosh(dur, f0, f1, gain, *, attack=0.008, release=0.05, kind="white") -> np.ndarray:
    n = int(round(dur * SR))
    if kind == "brown":
        w = RNG.standard_normal(n).astype(np.float32)
        x = np.cumsum(w).astype(np.float32)
        x /= max(1e-6, float(np.max(np.abs(x))))
    else:
        x = RNG.standard_normal(n).astype(np.float32)
    out = np.zeros(n, dtype=np.float32)
    prev = 0.0
    for i in range(n):
        t = i / max(n - 1, 1)
        freq = f0 * (f1 / f0) ** t
        alpha = np.exp(-2 * np.pi * freq / SR)
        prev = (1 - alpha) * x[i] + alpha * prev
        out[i] = prev
    env = np.ones(n, dtype=np.float32)
    a = min(n, int(attack * SR))
    r = min(n, int(release * SR))
    if a:
        env[:a] = np.linspace(0, 1, a, dtype=np.float32)
    if r:
        env[-r:] = np.linspace(1, 0, r, dtype=np.float32)
    t = np.arange(n) / SR
    env *= np.exp(-t * 6).astype(np.float32)
    return fade((out * env * gain).astype(np.float32), 0.002, 0.02)

def reverse_clip(y: np.ndarray) -> np.ndarray:
    # trim near-silence so the swell lands at the end
    thresh = 1e-3 * (float(np.max(np.abs(y))) or 1)
    idx = np.flatnonzero(np.abs(y) > thresh)
    if idx.size:
        y = y[idx[0] : idx[-1] + 1]
    return fade(y[::-1].copy(), 0.02, 0.04)

def load_raw() -> dict[str, np.ndarray]:
    R = RAW
    return {
        "pick": fade(lowpass_n(highpass(decode(R / "fs_353245_screwing-and-unscrewing-brass.mp3", 5.492, 0.28), 140), 5200, 3), 0.003, 0.06),
        "pick_tick": fade(lowpass_n(decode(R / "fs_442313_Metal-Tssht.mp3", 0.0, 0.08), 5500, 3), 0.001, 0.03),
        "loosen": fade(lowpass_n(highpass(decode(R / "fs_706440_Flashlight-battery-compartment-unscrew.mp3", 3.17, 0.40), 90), 5000, 3), 0.005, 0.08),
        "arrive": fade(lowpass_n(decode(R / "fs_220179_Click-Metal-Ting.mp3", 0.0, 0.32), 4500, 3), 0.001, 0.08),
        "glass": fade(decode(R / "mk_2936_Wine-glass-clink.wav", 0.02, 0.45), 0.002, 0.12),
        "plate": fade(lowpass_n(highpass(decode(R / "mk_3158_Thin-metal-plate-drop.wav", 0.0, 0.58), 60), 6500, 2), 0.002, 0.12),
        "tool_drop": fade(highpass(decode(R / "mk_835_Metal-tool-drop.wav", 0.0, 0.55), 60), 0.002, 0.12),
        "hammer": fade(highpass(decode(R / "mk_833_Metal-hammer-hit.wav", 0.0, 0.36), 50), 0.001, 0.1),
        "ascend": fade(lowpass(decode(R / "fs_422516_Menu-FX-03-ascending-wav.mp3", 0.0, 0.26), 7000), 0.003, 0.07),
        "plastic": fade(decode(R / "fs_63531_click1-wav.mp3", 0.0, 0.12), 0.001, 0.03),
        "plastic2": fade(decode(R / "fs_448393_Satisfying-Plastic-Handle-Unlock.mp3", 0.48, 0.30), 0.002, 0.08),
        "clasp": fade(decode(R / "fs_822397_small-metal-clasp-open-close-switching.mp3", 0.0, 0.16), 0.001, 0.05),
        "snap": fade(lowpass_n(decode(R / "fs_582904_Snap-Click-03-wav.mp3", 0.0, 0.16), 4200, 3), 0.001, 0.05),
        "clamp": fade(lowpass_n(highpass(decode(R / "fs_181635_Tools-Screw-Clamp-wav.mp3", 10.62, 0.30), 120), 5500, 3), 0.003, 0.08),
    }

# Musical ladder shared by arrive / box / win (C5 E5 G5 C6)
C5, E5, G5, C6, C4, G3, C3 = 523.25, 659.25, 783.99, 1046.50, 261.63, 196.00, 130.81

def bank(clips: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    pick = peak_normalize(mix(clips["pick"], clips["pick_tick"], clips["clamp"], gains=[0.9, 0.28, 0.22]), 0.56)
    loosen = peak_normalize(mix(clips["loosen"], clips["clamp"], gains=[1.0, 0.20]), 0.52)
    # Same metallic ting, C-E-G ladder; later slots slightly longer, still quieter than a filled box.
    arrive0 = peak_normalize(mix(clips["arrive"], synth_tone(C5, 0.12, 0.028, attack=0.004, decay=16), gains=[0.7, 0.85]), 0.42)
    arrive1 = peak_normalize(mix(clips["arrive"], synth_tone(E5, 0.13, 0.032, attack=0.004, decay=15), gains=[0.65, 0.9]), 0.44)
    arrive2 = peak_normalize(
        mix(clips["arrive"], lowpass(clips["glass"], 4500), synth_tone(G5, 0.15, 0.036, attack=0.005, decay=14), gains=[0.55, 0.22, 0.9]),
        0.48,
    )
    # Memory point: glass + staggered C-E-G, almost no menu-ascend so it does not twin the victory sting.
    box = peak_normalize(
        mix(
            clips["glass"],
            synth_tone(C5, 0.20, 0.07, attack=0.006, decay=7),
            synth_tone(E5, 0.22, 0.06, attack=0.008, decay=6.5),
            synth_tone(G5, 0.26, 0.05, attack=0.01, decay=6),
            gains=[0.72, 1, 1, 1],
            offsets=[0, 0, 0.03, 0.06],
        ),
        0.76,
    )
    refill = peak_normalize(
        mix(clips["clasp"], synth_tone(660, 0.14, 0.045, freq_end=880, decay=10), synth_tone(880, 0.14, 0.035, freq_end=1100, decay=10), gains=[0.75, 0.75, 0.55]),
        0.55,
    )
    fall = peak_normalize(
        mix(clips["plate"], clips["tool_drop"], synth_tone(70, 0.26, 0.07, freq_end=42, decay=8, attack=0.004), gains=[0.92, 0.28, 0.42]),
        0.76,
    )
    # Was the loudest RMS in v2. Keep it airy and clearly under a board drop.
    reveal = peak_normalize(
        mix(clips["ascend"], noise_whoosh(0.18, 900, 2800, 0.05, attack=0.02, release=0.05), synth_tone(1240, 0.16, 0.016, freq_end=1860, decay=9, attack=0.02), gains=[0.22, 0.55, 0.7]),
        0.34,
    )
    tool = peak_normalize(mix(clips["plastic"], clips["plastic2"], gains=[0.9, 0.4]), 0.58)
    blocked = peak_normalize(mix(clips["snap"], synth_tone(160, 0.11, 0.045, freq_end=110, decay=14), gains=[0.65, 0.55]), 0.48)
    # Short two-note garnish, no glass, not a mini fanfare.
    chain = peak_normalize(
        mix(synth_tone(G5, 0.09, 0.03, attack=0.005, decay=16), synth_tone(C6, 0.11, 0.026, attack=0.006, decay=14), gains=[1, 1], offsets=[0, 0.05]),
        0.32,
    )
    # Resolved C-E-G-C with a soft C4 floor; less glass than the filled-box sting.
    win = peak_normalize(
        mix(
            lowpass(clips["glass"], 4500),
            synth_tone(C4, 0.32, 0.04, attack=0.02, decay=5),
            synth_tone(C5, 0.20, 0.055, attack=0.01, decay=6),
            synth_tone(E5, 0.20, 0.055, attack=0.01, decay=6),
            synth_tone(G5, 0.24, 0.05, attack=0.012, decay=5.5),
            synth_tone(C6, 0.28, 0.045, attack=0.014, decay=5),
            gains=[0.32, 1, 1, 1, 1, 1],
            offsets=[0, 0, 0, 0.08, 0.16, 0.28],
        ),
        0.80,
    )
    # Weight first (hammer + falling fifth), then a short hopeful C.
    wall = peak_normalize(
        mix(
            clips["hammer"],
            clips["plate"],
            synth_tone(G3, 0.36, 0.08, freq_end=C3, decay=5, attack=0.005),
            synth_tone(G3 * 2, 0.22, 0.045, attack=0.006, decay=7),
            synth_tone(C5, 0.30, 0.05, attack=0.02, decay=5),
            gains=[0.7, 0.42, 0.85, 0.6, 0.7],
            offsets=[0, 0.02, 0, 0, 0.28],
        ),
        0.80,
    )
    undo = peak_normalize(
        mix(reverse_clip(clips["clasp"]), noise_whoosh(0.16, 2200, 700, 0.09, attack=0.01, release=0.05), synth_tone(520, 0.14, 0.03, freq_end=280, decay=10, attack=0.01), gains=[0.7, 0.65, 0.8]),
        0.48,
    )
    ui = peak_normalize(mix(synth_tone(1400, 0.05, 0.022, freq_end=1100, decay=24, attack=0.002), synth_tone(2100, 0.03, 0.01, decay=30, attack=0.001), gains=[1, 0.6]), 0.22)
    album = peak_normalize(
        mix(noise_whoosh(0.10, 1800, 3200, 0.045, attack=0.008, release=0.04), synth_tone(988, 0.18, 0.028, attack=0.01, decay=8), synth_tone(1480, 0.14, 0.014, attack=0.012, decay=9), gains=[0.6, 1, 0.7], offsets=[0, 0.02, 0.03]),
        0.40,
    )
    full = peak_normalize(mix(synth_tone(90, 0.20, 0.045, freq_end=58, decay=10, attack=0.004), noise_whoosh(0.16, 280, 90, 0.05, attack=0.003, release=0.05, kind="brown"), gains=[1, 0.55]), 0.36)
    return {
        "pick": pick,
        "loosen": loosen,
        "arrive-0": arrive0,
        "arrive-1": arrive1,
        "arrive-2": arrive2,
        "box": box,
        "refill": refill,
        "fall": fall,
        "reveal": reveal,
        "tool": tool,
        "blocked": blocked,
        "chain": chain,
        "win": win,
        "wall": wall,
        "undo": undo,
        "ui": ui,
        "album": album,
        "full": full,
    }

def main() -> None:
    if not RAW.exists():
        sys.exit(f"missing raw sources: {RAW}")
    OUT_OGG.mkdir(parents=True, exist_ok=True)
    OUT_WAV.mkdir(parents=True, exist_ok=True)
    sounds = bank(load_raw())
    for name, y in sounds.items():
        write_wav(OUT_WAV / f"{name}.wav", y)
        write_ogg(OUT_OGG / f"{name}.ogg", y)
        print(f"wrote {name}: {len(y)/SR:.3f}s  peak {20*np.log10(np.max(np.abs(y))+1e-12):.2f} dBFS  ogg { (OUT_OGG/f'{name}.ogg').stat().st_size }")
    total = sum(p.stat().st_size for p in OUT_OGG.glob("*.ogg"))
    print("TOTAL_OGG", total, "MiB", round(total / 1048576, 3))

if __name__ == "__main__":
    main()
