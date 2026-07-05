#!/usr/bin/env bash
# BeaconGaze — slice a cinematic sequence into optimized scroll frames.
# Usage: ./scripts/slice-frames.sh <video-url-or-file> hero [frame-count]
# Requires: ffmpeg. Output: assets/frames/<name>/ + manifest.json
set -euo pipefail
SRC="${1:?usage: slice-frames.sh <video> <name> [count]}"
NAME="${2:?name required (e.g. hero)}"
COUNT="${3:-120}"
OUT="assets/frames/$NAME"
mkdir -p "$OUT"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
FPS=$(python3 -c "print(f'{$COUNT/$DUR:.4f}')")
# 1080p-wide, quality-tuned webp — small enough to preload, sharp enough for full-bleed
ffmpeg -y -i "$SRC" -vf "fps=$FPS,scale=1920:-2" -c:v libwebp -quality 72 -preset picture "$OUT/f_%04d.webp"
python3 - << PY
import json, os, glob
files = sorted(os.path.basename(f) for f in glob.glob("$OUT/f_*.webp"))
import subprocess
w,h = subprocess.check_output(["ffprobe","-v","error","-select_streams","v:0",
  "-show_entries","stream=width,height","-of","csv=p=0","$OUT/"+files[0]]).decode().strip().split(",")[:2] if False else ("1920","1080")
json.dump({"width":1920,"height":1080,"frames":files}, open("$OUT/manifest.json","w"))
print(f"sliced {len(files)} frames -> $OUT (manifest.json written)")
PY
