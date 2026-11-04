#!/usr/bin/env python3
"""Generates the soft ambient bed for the AnswerOnce video.

Python stdlib synthesis (wavetable pads, a sub bass and a few quiet bells over
a slow D major progression), then ffmpeg adds a convolution reverb with a
generated impulse response, a gentle low-pass, fades and a two-pass loudness
normalisation.

    python3 video/music.py --duration 64.5 --out video/.build/music.wav
"""

import argparse
import json
import math
import os
import random
import struct
import subprocess
import sys
import tempfile
import wave

RATE = 24000  # synthesis rate; everything above ~4 kHz is filtered out anyway
OUT_RATE = 48000
CHORD_SECONDS = 8.0

# Smooth voice leading with common tones (A and F#/D) between chords.
PROGRESSION = [
    {"name": "Dmaj9", "bass": 38, "notes": [50, 57, 61, 64, 66]},
    {"name": "Bm9", "bass": 35, "notes": [47, 57, 61, 62, 66]},
    {"name": "Gmaj9", "bass": 31, "notes": [43, 57, 59, 62, 66]},
    {"name": "A6sus", "bass": 33, "notes": [45, 57, 59, 62, 64]},
]
# Sparse bell notes (D major pentatonic), as (beat offset in seconds, midi).
BELLS = [(1.5, 78), (5.5, 76), (2.0, 74), (6.0, 81), (1.0, 79), (4.5, 78), (3.0, 76), (6.5, 74)]


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def wavetable(harmonics, size=4096):
    table = [sum(a * math.sin(2 * math.pi * (h + 1) * i / size) for h, a in enumerate(harmonics)) for i in range(size)]
    peak = max(abs(v) for v in table)
    return [v / peak for v in table]


PAD = wavetable([1.0, 0.38, 0.16, 0.07, 0.03])
SIZE = len(PAD)


def envelope(t, length, attack, release):
    """Raised-cosine attack and release around a sustained middle."""
    if t < 0 or t > length:
        return 0.0
    if t < attack:
        return 0.5 - 0.5 * math.cos(math.pi * t / attack)
    if t > length - release:
        return 0.5 + 0.5 * math.cos(math.pi * (t - (length - release)) / release)
    return 1.0


def add_voice(left, right, start, length, hz, gain, pan, attack, release, table=PAD, swell=0.0):
    n0 = max(0, int(start * RATE))
    n1 = min(len(left), int((start + length) * RATE))
    step = hz * SIZE / RATE
    phase = random.random() * SIZE
    gl = gain * math.cos((pan + 1) * math.pi / 4)
    gr = gain * math.sin((pan + 1) * math.pi / 4)
    swell_rate = 2 * math.pi * 0.11 / RATE
    swell_phase = random.random() * 2 * math.pi
    for n in range(n0, n1):
        t = n / RATE - start
        env = envelope(t, length, attack, release)
        if swell:
            env *= 1.0 + swell * math.sin(swell_phase + n * swell_rate)
        v = table[int(phase) % SIZE] * env
        left[n] += v * gl
        right[n] += v * gr
        phase += step


def add_bell(left, right, start, hz, gain, pan, decay=2.6):
    n0 = int(start * RATE)
    n1 = min(len(left), n0 + int(decay * 3 * RATE))
    gl = gain * math.cos((pan + 1) * math.pi / 4)
    gr = gain * math.sin((pan + 1) * math.pi / 4)
    w = 2 * math.pi * hz / RATE
    for n in range(n0, n1):
        k = n - n0
        t = k / RATE
        env = min(1.0, t / 0.012) * math.exp(-t / decay)
        v = (math.sin(w * k) + 0.18 * math.sin(2 * w * k) * math.exp(-t / 0.6)) * env
        left[n] += v * gl
        right[n] += v * gr


def synthesize(duration):
    random.seed(7)
    total = int((duration + 1.0) * RATE)
    left = [0.0] * total
    right = [0.0] * total
    chords = math.ceil(duration / CHORD_SECONDS)
    for i in range(chords):
        chord = PROGRESSION[i % len(PROGRESSION)]
        start = i * CHORD_SECONDS - (0.0 if i == 0 else 1.6)
        length = CHORD_SECONDS + (1.6 if i else 0.0) + 3.2
        for j, m in enumerate(chord["notes"]):
            hz = midi_hz(m)
            gain = 0.11 if j else 0.13
            pan = -0.5 + j * 0.25
            for cents, p in ((-4.0, -0.35), (4.0, 0.35)):
                add_voice(left, right, start, length, hz * 2 ** (cents / 1200), gain, max(-0.9, min(0.9, pan + p)), 2.6, 3.4, swell=0.12)
        add_voice(left, right, start, length, midi_hz(chord["bass"]), 0.16, 0.0, 2.0, 3.0, table=wavetable([1.0, 0.12]))
        offset, note = BELLS[i % len(BELLS)]
        if 2.5 < i * CHORD_SECONDS + offset < duration - 4:
            add_bell(left, right, i * CHORD_SECONDS + offset, midi_hz(note), 0.045, 0.4 if i % 2 else -0.4)
    peak = max(max(abs(v) for v in left), max(abs(v) for v in right))
    scale = 0.7 / peak
    return [v * scale for v in left], [v * scale for v in right]


def impulse_response(seconds=3.6, predelay=0.022):
    """Stereo decaying noise, darkened by a one-pole low-pass that closes over time."""
    random.seed(11)
    n = int(seconds * OUT_RATE)
    pre = int(predelay * OUT_RATE)
    channels = []
    for _ in range(2):
        out = [0.0] * (n + pre)
        y = 0.0
        for k in range(n):
            t = k / OUT_RATE
            a = 0.35 * math.exp(-t / 1.4) + 0.04  # brightness falls with time
            y += a * (random.uniform(-1, 1) - y)
            out[pre + k] = y * math.exp(-6.9 * t / seconds)
        channels.append(out)
    return channels


def write_wav(path, rate, left, right):
    with wave.open(path, "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(rate)
        frames = bytearray()
        for l, r in zip(left, right):
            frames += struct.pack("<hh", int(max(-1, min(1, l)) * 32767), int(max(-1, min(1, r)) * 32767))
        f.writeframes(bytes(frames))


def ffmpeg(*args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args], check=True, capture_output=True, text=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--lufs", type=float, default=-19.0)
    args = parser.parse_args()
    d = args.duration
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        dry, ir, wet = (os.path.join(tmp, n) for n in ("dry.wav", "ir.wav", "wet.wav"))
        write_wav(dry, RATE, *synthesize(d))
        write_wav(ir, OUT_RATE, *impulse_response())
        chain = (
            f"[0:a]aresample={OUT_RATE}[a];[a][1:a]afir=dry=7:wet=5:irnorm=1[r];"
            f"[r]highpass=f=50,lowpass=f=3000,lowpass=f=5200,atrim=0:{d},"
            f"afade=t=in:st=0:d=1.5,afade=t=out:st={d - 3:.3f}:d=3[o]"
        )
        ffmpeg("-i", dry, "-i", ir, "-filter_complex", chain, "-map", "[o]", "-ar", str(OUT_RATE), wet)

        target = f"I={args.lufs}:TP=-3:LRA=11"
        probe = ffmpeg("-i", wet, "-af", f"loudnorm={target}:print_format=json", "-f", "null", "-")
        stats = json.loads(probe.stderr[probe.stderr.rindex("{") : probe.stderr.rindex("}") + 1])
        measured = (
            f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:"
            f"measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
        )
        ffmpeg("-i", wet, "-af", f"loudnorm={target}:{measured},aresample={OUT_RATE}", "-c:a", "pcm_s16le", args.out)
    print(f"music: {args.out} ({d:.1f}s)", file=sys.stderr)


if __name__ == "__main__":
    main()
