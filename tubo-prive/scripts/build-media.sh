#!/usr/bin/env bash
# Turns media/source/ into the web-ready files under public/.
#   entrance.mp4  -> public/frames/{hd,sd}/f00000.webp ... (scroll-scrubbed hero)
#   clips         -> public/media/*.mp4 (muted, faststart) + poster .webp
#   photos/*.jpeg -> public/photos/*.webp
# Needs ffmpeg. Re-run whenever a source file changes.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=media/source
FPS=12 # hero frames per second of footage; the player crossfades between them

rm -rf public/frames public/media public/photos
mkdir -p public/frames/hd public/frames/sd public/media public/photos

ffmpeg -v error -i "$SRC/entrance.mp4" -vf "fps=$FPS,scale=1600:-2:flags=lanczos" \
  -c:v libwebp -quality 72 -start_number 0 public/frames/hd/f%05d.webp
ffmpeg -v error -i "$SRC/entrance.mp4" -vf "fps=$FPS,scale=800:-2:flags=lanczos" \
  -c:v libwebp -quality 64 -start_number 0 public/frames/sd/f%05d.webp
count=$(ls public/frames/hd | wc -l | tr -d ' ')
printf '{ "count": %s, "fps": %s }\n' "$count" "$FPS" > src/frames.generated.json

for clip in facial nails lashes; do
  ffmpeg -v error -i "$SRC/$clip.mp4" -an -vf "scale=540:-2" -c:v libx264 -preset slow -crf 27 \
    -pix_fmt yuv420p -movflags +faststart "public/media/$clip.mp4"
  ffmpeg -v error -ss 1 -i "$SRC/$clip.mp4" -frames:v 1 -vf "scale=540:-2" -c:v libwebp -quality 75 \
    "public/media/$clip.webp"
done

for photo in "$SRC"/photos/*.jpeg; do
  name=$(basename "$photo" .jpeg)
  ffmpeg -v error -i "$photo" -vf "scale='min(1200,iw)':-2" -c:v libwebp -quality 80 "public/photos/$name.webp"
done

echo "hero frames: $count"
du -sh public/frames/hd public/frames/sd public/media public/photos
