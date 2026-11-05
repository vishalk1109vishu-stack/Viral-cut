#!/usr/bin/env python3
"""Detect faces (frontal + profile) and motion saliency on a low-res proxy video.

Outputs a normalized timeline: {t, cx, cy, face} samples used to build a
smooth crop path so subjects never get chopped in half by the reframer.
"""
import argparse
import json

import cv2


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--proxy", required=True, help="low-res proxy video (2 fps)")
    p.add_argument("--fps", type=float, required=True, help="fps of the proxy video")
    p.add_argument("--out", required=True)
    args = p.parse_args()

    frontal = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    profile = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_profileface.xml"
    )

    cap = cv2.VideoCapture(args.proxy)
    if not cap.isOpened():
        print("FATAL cannot open proxy", flush=True)
        raise SystemExit(1)
    width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

    samples = []
    prev_gray = None
    idx = 0
    min_face = max(24, int(width * 0.07))
    last_pos = None  # carry-forward: keep the last known subject position

    while True:
        ok = cap.grab()
        if not ok:
            break
        ok, frame = cap.retrieve()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray_eq = cv2.equalizeHist(gray)

        faces = list(frontal.detectMultiScale(gray_eq, 1.12, 5, minSize=(min_face, min_face)))
        if not faces:
            flipped = cv2.flip(gray_eq, 1)
            pf = profile.detectMultiScale(flipped, 1.12, 5, minSize=(min_face, min_face))
            faces = [(width - x - w, y, w, h) for (x, y, w, h) in pf]

        # motion centroid (fallback when nobody is visible)
        mx = my = motion = 0.0
        if prev_gray is not None:
            diff = cv2.absdiff(gray, prev_gray)
            _, diff = cv2.threshold(diff, 18, 255, cv2.THRESH_BINARY)
            diff = cv2.dilate(diff, None, iterations=2)
            m = cv2.moments(diff)
            if m["m00"] > 0:
                mx = m["m10"] / m["m00"] / width
                my = m["m01"] / m["m00"] / height
                motion = m["m00"] / (width * height)

        t = round(idx / args.fps, 3)
        if faces:
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            last_pos = (round((x + w / 2) / width, 4), round((y + h / 2) / height, 4))
            samples.append(
                {
                    "t": t,
                    "cx": last_pos[0],
                    "cy": last_pos[1],
                    "face": True,
                    "faces": len(faces),
                }
            )
        elif motion > 0.0008:
            last_pos = (round(mx, 4), round(my, 4))
            samples.append({"t": t, "cx": last_pos[0], "cy": last_pos[1], "face": False})
        elif last_pos is not None:
            # carry the last known position so the crop path has no blind gaps
            samples.append({"t": t, "cx": last_pos[0], "cy": last_pos[1], "face": False, "carried": True})
        prev_gray = gray
        idx += 1

    cap.release()
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"width": width, "height": height, "samples": samples}, f)
    face_n = sum(1 for s in samples if s.get("face"))
    print(f"OK {len(samples)} samples ({face_n} with faces)", flush=True)


if __name__ == "__main__":
    main()
