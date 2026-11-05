#!/usr/bin/env python3
"""Per-step RMS loudness of a 16-bit mono WAV — feeds the energy signal."""
import argparse
import json
import wave

import numpy as np


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--wav", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--step", type=float, default=0.5)
    args = p.parse_args()

    w = wave.open(args.wav, "rb")
    sr = w.getframerate()
    n = w.getnframes()
    ch = w.getnchannels()
    sw = w.getsampwidth()
    raw = w.readframes(n)
    w.close()

    dtype = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
    a = np.frombuffer(raw, dtype=dtype).astype(np.float32) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)

    step = max(1, int(sr * args.step))
    n_steps = len(a) // step
    if n_steps == 0:
        json.dump({"step": args.step, "rms": []}, open(args.out, "w"))
        print("OK 0", flush=True)
        return
    rms = np.sqrt(np.mean(a[: n_steps * step].reshape(n_steps, step) ** 2, axis=1))
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            {"step": args.step, "rms": [round(float(x), 5) for x in rms]}, f
        )
    print(f"OK {n_steps} steps", flush=True)


if __name__ == "__main__":
    main()
