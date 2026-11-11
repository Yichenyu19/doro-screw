#!/usr/bin/env python3
"""Objective SFX checks for mix v3.

Renders review WAV spectrograms, measures peaks / approximate loudness / clicks /
spectral centroid, stress-tests overlapping buses, and optionally renders
synth-recipe fallbacks. Writes /workspace/doro-screw-review/sfx-v3/.
Does not claim a human heard the files.
"""
from __future__ import annotations
import json, re, subprocess, sys
from pathlib import Path
import numpy as np

SR = 48000
ROOT = Path(__file__).resolve().parents[1]
WAV_DIR = Path("/workspace/doro-screw-review/sfx-v3")
OGG_DIR = ROOT / "public" / "sfx"
STEMS = [
    "pick", "loosen", "arrive-0", "arrive-1", "arrive-2", "box", "refill",
    "fall", "reveal", "tool", "blocked", "chain", "win", "wall",
    "undo", "ui", "album", "full",
]
# Runtime bus gains copied from src/audio.ts (keep in sync).
BUS = {
    "pick": ("action", 0.85, 0.85),
    "loosen": ("action", 0.90, 0.85),
    "arrive-0": ("action", 0.88, 0.85),
    "arrive-1": ("action", 0.88, 0.85),
    "arrive-2": ("action", 0.88, 0.85),
    "refill": ("action", 0.72, 0.85),
    "reveal": ("impact", 0.68, 0.95),
    "fall": ("impact", 1.00, 0.95),
    "box": ("reward", 1.00, 1.00),
    "chain": ("reward", 0.78, 1.00),
    "win": ("reward", 1.00, 1.00),
    "wall": ("reward", 1.00, 1.00),
    "tool": ("ui", 0.80, 0.58),
    "undo": ("ui", 0.70, 0.58),
    "ui": ("ui", 0.50, 0.58),
    "album": ("ui", 0.85, 0.58),
    "blocked": ("warn", 0.72, 0.75),
    "full": ("warn", 0.80, 0.75),
}
MASTER = 0.9
TP_LIMIT = -1.0
START_END_LIMIT = 0.03

def load_wav(path: Path) -> np.ndarray:
    data = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    )
    return np.frombuffer(data, dtype=np.float32).copy()

def ffprobe(path: Path) -> tuple[float, int]:
    meta = json.loads(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-of", "json", str(path)]
    ))
    return float(meta["format"]["duration"]), int(meta["format"]["size"])

def ebur128(path: Path) -> dict:
    err = subprocess.run(
        ["ffmpeg", "-nostats", "-i", str(path), "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    vd = subprocess.run(
        ["ffmpeg", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    def grab(pat, text, default=None):
        m = re.search(pat, text)
        return float(m.group(1)) if m else default
    tps = re.findall(r"True peak:.*?Peak:\s+([-\d.]+)", err, re.S)
    return {
        "lufs_i": grab(r"I:\s+([-\d.]+) LUFS", err),
        "true_peak_db": float(tps[-1]) if tps else None,
        "max_volume_db": grab(r"max_volume:\s+([-\d.]+) dB", vd),
        "mean_volume_db": grab(r"mean_volume:\s+([-\d.]+) dB", vd),
    }

def kweighted_db(y: np.ndarray) -> float:
    """Rough K-weighting (high shelf + high-pass) mean power in dB, useful on short SFX."""
    # 48 kHz high-shelf (BS.1770 stage 1) and high-pass (stage 2), SOS form.
    # Coefficients from ITU-R BS.1770-4 at 48 kHz.
    def sos_filter(x, b, a):
        # Direct form I, 2nd order
        y = np.zeros_like(x)
        x1 = x2 = y1 = y2 = 0.0
        b0, b1, b2 = b
        a1, a2 = a
        for i, s in enumerate(x):
            out = b0 * s + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2, x1 = x1, s
            y2, y1 = y1, out
            y[i] = out
        return y
    # Pre-filter
    x = sos_filter(y, [1.53512485958697, -2.69169618940638, 1.19839281085285], [-1.69065929318241, 0.73248077421585])
    x = sos_filter(x, [1.0, -2.0, 1.0], [-1.99004745483398, 0.99007225036621])
    return float(10 * np.log10(np.mean(x ** 2) + 1e-12))

def momentary_k(y: np.ndarray, window=0.4) -> float:
    """K-weighted power over a 400 ms gate (pad short SFX), closer to momentary loudness."""
    n = int(window * SR)
    if len(y) < n:
        z = np.zeros(n, dtype=np.float32)
        z[: len(y)] = y
        return kweighted_db(z)
    # loudest window
    hop = max(1, n // 4)
    best = -120.0
    for start in range(0, len(y) - n + 1, hop):
        best = max(best, kweighted_db(y[start : start + n]))
    return best

def centroid(y: np.ndarray) -> float:
    if y.size < 16:
        return 0.0
    w = np.hanning(len(y))
    spec = np.abs(np.fft.rfft(y * w))
    freqs = np.fft.rfftfreq(len(y), 1 / SR)
    total = float(spec.sum())
    if total <= 1e-12:
        return 0.0
    return float((freqs * spec).sum() / total)

def band_ratio(y: np.ndarray, f0: float, f1: float) -> float:
    w = np.hanning(len(y))
    spec = np.abs(np.fft.rfft(y * w)) ** 2
    freqs = np.fft.rfftfreq(len(y), 1 / SR)
    total = float(spec.sum())
    if total <= 1e-12:
        return 0.0
    return float(spec[(freqs >= f0) & (freqs < f1)].sum() / total)

def edge_click(y: np.ndarray) -> dict:
    start_amp = float(y[0]) if y.size else 0.0
    end_amp = float(y[-1]) if y.size else 0.0
    return {
        "start_amp": round(start_amp, 5),
        "end_amp": round(end_amp, 5),
        "click": abs(start_amp) > START_END_LIMIT or abs(end_amp) > START_END_LIMIT,
    }

def clipped(y: np.ndarray) -> int:
    return int(np.sum(np.abs(y) >= 0.99))

def write_wav(path: Path, y: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0", "-c:a", "pcm_s24le", str(path)],
        input=y.astype(np.float32).tobytes(),
        check=True,
    )

def spectrogram(wav: Path, png: Path) -> None:
    png.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(wav),
         "-lavfi", "showspectrumpic=s=720x400:legend=1:scale=log:fscale=log:color=intensity:gain=4",
         str(png)],
        check=True,
    )

def soft_limit(y: np.ndarray, ceiling=10 ** (-1.5 / 20)) -> np.ndarray:
    # Approximates the runtime limiter: peaks above -1.5 dBFS are pulled down.
    m = float(np.max(np.abs(y))) if y.size else 0.0
    if m <= ceiling or m <= 1e-12:
        return y
    return (y * (ceiling / m)).astype(np.float32)

def place(dst: np.ndarray, src: np.ndarray, at=0.0, gain=1.0) -> np.ndarray:
    start = int(round(at * SR))
    end = start + len(src)
    if end > len(dst):
        out = np.zeros(end, dtype=np.float32)
        out[: len(dst)] = dst
        dst = out
    dst[start:end] += src * gain
    return dst

def bus_gain(name: str) -> float:
    voice, bus = BUS[name][1], BUS[name][2]
    return voice * bus * MASTER

def mix_scene(clips: dict[str, np.ndarray], events: list[tuple[str, float]], duck=False) -> np.ndarray:
    # events: (stem, time)
    acc = np.zeros(1, dtype=np.float32)
    duck_until = -1.0
    for name, t in events:
        g = bus_gain(name)
        if duck and BUS[name][0] == "action" and t < duck_until:
            g *= 0.38
        if BUS[name][0] == "reward" and BUS[name][1] >= 0.99:
            duck_until = t + 0.26
        acc = place(acc, clips[name], t, g)
    return soft_limit(acc * 1.0)

def render_recipe(recipe: list[dict], seed=1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = max(v["start"] + v["dur"] for v in recipe) + 0.03
    n = int(round(dur * SR))
    acc = np.zeros(n, dtype=np.float32)
    for voice in recipe:
        start = int(round(voice["start"] * SR))
        length = int(round(voice["dur"] * SR))
        t = np.arange(length) / SR
        if voice.get("noise"):
            if voice["noise"] == "brown":
                w = rng.standard_normal(length)
                x = np.cumsum(w).astype(np.float64)
                x /= max(1e-6, np.max(np.abs(x)))
            else:
                x = rng.standard_normal(length)
        else:
            freq = max(20.0, float(voice.get("freq") or 440))
            freq_end = voice.get("freqEnd")
            kind = voice.get("osc") or "sine"
            if freq_end:
                k = np.log(max(float(freq_end), 20) / freq) / max(voice["dur"], 1e-6)
                phase = freq * (np.exp(k * t) - 1) / (k if k else 1)
                x = np.sin(2 * np.pi * phase)
            else:
                x = np.sin(2 * np.pi * freq * t)
                if kind == "triangle":
                    x = 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1
                elif kind == "square":
                    x = np.sign(np.sin(2 * np.pi * freq * t))
        # one-pole filter approximation
        ftype = voice.get("filter")
        f0 = float(voice.get("filterFreq") or 1200)
        if ftype and length:
            out = np.zeros_like(x, dtype=np.float64)
            prev = 0.0
            alpha = np.exp(-2 * np.pi * f0 / SR)
            for i, s in enumerate(x):
                prev = (1 - alpha) * s + alpha * prev
                out[i] = prev
            if ftype == "highpass":
                x = x - out
            elif ftype == "bandpass":
                # cheap: lowpass then subtract a lower lowpass
                alpha2 = np.exp(-2 * np.pi * (f0 * 0.5) / SR)
                prev = 0.0
                low = np.zeros_like(out)
                for i, s in enumerate(out):
                    prev = (1 - alpha2) * s + alpha2 * prev
                    low[i] = prev
                x = out - low
            else:
                x = out
        env = np.zeros(length, dtype=np.float64)
        attack = max(1, int(max(0.001, min(voice["attack"], voice["dur"] / 3)) * SR))
        if attack < length:
            env[:attack] = np.linspace(0, voice["gain"], attack)
            # exponential-ish decay to ~0.001
            rest = np.arange(length - attack)
            env[attack:] = voice["gain"] * np.exp(-rest / max(1, (length - attack) / 4))
        else:
            env[:] = voice["gain"]
        env[-min(length, int(0.008 * SR)):] *= np.linspace(1, 0, min(length, int(0.008 * SR)))
        sig = (x * env).astype(np.float32)
        end = min(n, start + length)
        acc[start:end] += sig[: end - start]
    return acc.astype(np.float32)

def measure_clip(wav: Path, ogg: Path | None, y: np.ndarray) -> dict:
    duration, size = ffprobe(wav)
    meters = ebur128(wav)
    click = edge_click(y)
    row = {
        "file": wav.name,
        "duration_s": round(duration, 3),
        "bytes": size,
        "ogg_bytes": ogg.stat().st_size if ogg and ogg.exists() else None,
        "true_peak_db": meters["true_peak_db"],
        "max_volume_db": meters["max_volume_db"],
        "rms_db": meters["mean_volume_db"],
        "kweighted_db": round(kweighted_db(y), 2),
        "k_momentary_db": round(momentary_k(y), 2),
        "lufs_i": meters["lufs_i"],
        "centroid_hz": round(centroid(y), 1),
        "band_sub_200": round(band_ratio(y, 0, 200), 3),
        "band_mud_200_500": round(band_ratio(y, 200, 500), 3),
        "band_harsh_2_5k": round(band_ratio(y, 2000, 5000), 3),
        "band_air_5_9k": round(band_ratio(y, 5000, 9000), 3),
        "band_above_9k": round(band_ratio(y, 9000, 20000), 3),
        "clipped_samples": clipped(y),
        **click,
    }
    return row

def main() -> int:
    WAV_DIR.mkdir(parents=True, exist_ok=True)
    spec_dir = WAV_DIR / "spectrograms"
    clips = {}
    report = []
    failures = []
    for name in STEMS:
        wav = WAV_DIR / f"{name}.wav"
        if not wav.exists():
            failures.append(f"missing wav {name}")
            continue
        y = load_wav(wav)
        clips[name] = y
        row = measure_clip(wav, OGG_DIR / f"{name}.ogg", y)
        report.append(row)
        spectrogram(wav, spec_dir / f"{name}.png")
        if row["true_peak_db"] is not None and row["true_peak_db"] > TP_LIMIT:
            failures.append(f"{name} true peak {row['true_peak_db']} > {TP_LIMIT} dBTP")
        if row["clipped_samples"]:
            failures.append(f"{name} has {row['clipped_samples']} clipped samples")
        if row["click"]:
            failures.append(f"{name} edge click start={row['start_amp']} end={row['end_amp']}")

    # Layering expectations (K-weighted, more stable than integrated LUFS on short SFX).
    kw = {row["file"].replace(".wav", ""): row["k_momentary_db"] for row in report}
    def quieter(a, b, margin=0.8):
        if a in kw and b in kw and kw[a] > kw[b] - margin:
            failures.append(f"loudness layering: {a} ({kw[a]} dB) should sit under {b} ({kw[b]} dB)")
    quieter("reveal", "fall", 2.0)
    quieter("reveal", "box", 1.0)
    quieter("arrive-0", "box", 1.5)
    quieter("chain", "win", 1.0)
    quieter("ui", "pick", 1.0)
    quieter("undo", "fall", 2.0)
    quieter("full", "wall", 1.5)
    quieter("pick", "fall", 1.5)

    scenes = {
        "pick-arrive": [("pick", 0.0), ("arrive-0", 0.04)],
        "fill-box": [("pick", 0.0), ("arrive-2", 0.04), ("box", 0.08)],
        "layer-clear": [("fall", 0.0), ("reveal", 0.12)],
        "box-refill": [("box", 0.0), ("refill", 0.18), ("arrive-0", 0.22)],
        "chaos": [("pick", 0.0), ("arrive-1", 0.03), ("box", 0.08), ("fall", 0.1)],
        "win": [("win", 0.0)],
        "wall": [("wall", 0.0)],
        "stuck": [("blocked", 0.0), ("full", 0.05)],
    }
    mix_report = []
    for title, events in scenes.items():
        mix = mix_scene(clips, events, duck=any(BUS[n][0] == "reward" and BUS[n][1] >= 0.99 for n, _ in events))
        path = WAV_DIR / f"mix-{title}.wav"
        write_wav(path, mix)
        spectrogram(path, spec_dir / f"mix-{title}.png")
        row = measure_clip(path, None, mix)
        row["scene"] = title
        mix_report.append(row)
        if row["true_peak_db"] is not None and row["true_peak_db"] > TP_LIMIT:
            failures.append(f"mix {title} true peak {row['true_peak_db']} > {TP_LIMIT} dBTP")
        if row["clipped_samples"]:
            failures.append(f"mix {title} clipped")

    # Synth fallbacks, if a recipe dump is present.
    recipes_path = WAV_DIR / "synth-recipes.json"
    synth_report = []
    if recipes_path.exists():
        recipes = json.loads(recipes_path.read_text(encoding="utf-8"))
        for name, recipe in recipes.items():
            y = render_recipe(recipe)
            path = WAV_DIR / f"synth-{name}.wav"
            write_wav(path, y)
            spectrogram(path, spec_dir / f"synth-{name}.png")
            row = measure_clip(path, None, y)
            row["file"] = path.name
            synth_report.append(row)
            if row["true_peak_db"] is not None and row["true_peak_db"] > TP_LIMIT:
                failures.append(f"synth {name} true peak {row['true_peak_db']} > {TP_LIMIT} dBTP")
            if row["click"]:
                failures.append(f"synth {name} edge click start={row['start_amp']} end={row['end_amp']}")

    total_ogg = sum((OGG_DIR / f"{name}.ogg").stat().st_size for name in STEMS if (OGG_DIR / f"{name}.ogg").exists())
    payload = {
        "hearing": "unheard",
        "note": "所有计量均为脚本/ffmpeg 客观检测，未经人耳验收。短音效的 Integrated LUFS 常为 -70，分层比较改用 K 加权均方根。",
        "total_ogg_bytes": total_ogg,
        "total_ogg_mib": round(total_ogg / 1048576, 3),
        "limits": {"true_peak_dbtp": TP_LIMIT, "edge_abs": START_END_LIMIT, "voice_cap": 5},
        "clips": report,
        "mixes": mix_report,
        "synths": synth_report,
        "failures": failures,
        "passed": not failures,
    }
    (WAV_DIR / "measurements.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"passed": payload["passed"], "failures": failures, "total_ogg_bytes": total_ogg}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1

if __name__ == "__main__":
    sys.exit(main())
