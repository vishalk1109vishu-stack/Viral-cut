#!/usr/bin/env python3
"""Speech-to-text with faster-whisper. Emits PROGRESS lines for the TS pipeline."""
import argparse
import json
import sys

from faster_whisper import WhisperModel


def transcribe_with_vad(model, audio_path):
    """First pass: with VAD (skips long silences — saves time on podcasts)."""
    return model.transcribe(
        audio_path,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={
            "min_silence_duration_ms": 600,
            "speech_pad_ms": 200,
            "threshold": 0.35,  # lower = more permissive (music videos, noisy audio)
        },
        beam_size=1,
        condition_on_previous_text=False,
    )


def transcribe_no_vad(model, audio_path):
    """Fallback pass: no VAD. Always emits segments for music-heavy or noisy audio."""
    return model.transcribe(
        audio_path,
        word_timestamps=True,
        vad_filter=False,
        beam_size=1,
        condition_on_previous_text=False,
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--audio", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--model", default="tiny")
    p.add_argument("--models-dir", default="/data/storage/models")
    args = p.parse_args()

    model = WhisperModel(
        args.model, device="cpu", compute_type="int8", download_root=args.models_dir
    )

    # First pass: VAD on (fast for podcasts / interviews).
    # If VAD eats everything (music videos, constant background noise), retry without.
    segments_iter, info = transcribe_with_vad(model, args.audio)
    total = float(info.duration) or 1.0
    segments = []
    for s in segments_iter:
        words = [
            {"start": round(float(w.start), 3), "end": round(float(w.end), 3), "word": w.word}
            for w in (s.words or [])
        ]
        seg = {
            "start": round(float(s.start), 3),
            "end": round(float(s.end), 3),
            "text": s.text.strip(),
            "words": words,
        }
        segments.append(seg)
        pct = min(99.0, round(float(s.end) / total * 100.0, 1))
        print(f"PROGRESS {pct}", flush=True)

    if not segments:
        # VAD over-filtered — fall back to transcribing everything.
        print("PROGRESS 1 (re-running without VAD)", flush=True)
        segments_iter, info = transcribe_no_vad(model, args.audio)
        total = float(info.duration) or 1.0
        for s in segments_iter:
            words = [
                {"start": round(float(w.start), 3), "end": round(float(w.end), 3), "word": w.word}
                for w in (s.words or [])
            ]
            seg = {
                "start": round(float(s.start), 3),
                "end": round(float(s.end), 3),
                "text": s.text.strip(),
                "words": words,
            }
            segments.append(seg)
            pct = min(99.0, round(float(s.end) / total * 100.0, 1))
            print(f"PROGRESS {pct}", flush=True)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            {
                "language": info.language,
                "duration": total,
                "segments": segments,
            },
            f,
            ensure_ascii=False,
        )
    print(f"OK {len(segments)} segments, language={info.language}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"FATAL {e}", file=sys.stderr, flush=True)
        sys.exit(1)
