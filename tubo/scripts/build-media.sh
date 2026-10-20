#!/usr/bin/env bash
# Turns media/source/ into the web-ready files under public/.
#   entrance.mp4  -> public/frames/{hd,sd}/f00000.webp ... (scroll-scrubbed hero)
#                 -> public/frames/{hd,sd}/wall.webp  (last frame with the wall sign removed)
#                 -> public/media/lobby.mp4 + .webp    (lobby loop for the reveal)
#                 -> public/photos/station.webp, lounge.webp (stills for the menu)
#   photos/*.jpeg -> public/photos/*.webp
#                 -> public/media/reel.mp4 + .webp     (Ken Burns nail reel for the post)
# Needs ffmpeg. Re-run whenever a source file changes.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=media/source
FPS=15 # hero frames per second of footage; the player crossfades between them
# The "Tubo" lettering on the reception wall in the film's last frame, in
# source pixels (1280x720), with a margin. Keep in step with SIGN in main.ts.
SIGN_X=548 SIGN_Y=297 SIGN_W=120 SIGN_H=45

rm -rf public/frames public/media public/photos
mkdir -p public/frames/hd public/frames/sd public/media public/photos

ffmpeg -v error -i "$SRC/entrance.mp4" -vf "fps=$FPS,scale=1280:-2:flags=lanczos" \
  -c:v libwebp -quality 76 -start_number 0 public/frames/hd/f%05d.webp
ffmpeg -v error -i "$SRC/entrance.mp4" -vf "fps=$FPS,scale=720:-2:flags=lanczos" \
  -c:v libwebp -quality 66 -start_number 0 public/frames/sd/f%05d.webp
count=$(ls public/frames/hd | wc -l | tr -d ' ')
printf '{ "count": %s, "fps": %s }\n' "$count" "$FPS" > src/frames.generated.json

# The wall without its sign: the same frame the film ends on, with the
# lettering painted out, so the name can be pulled off the wall.
last=$(printf 'f%05d.webp' $((count - 1)))
ffmpeg -v error -i "public/frames/hd/$last" \
  -vf "delogo=x=$SIGN_X:y=$SIGN_Y:w=$SIGN_W:h=$SIGN_H" -c:v libwebp -quality 80 public/frames/hd/wall.webp
ffmpeg -v error -i public/frames/hd/wall.webp -vf "scale=720:-2:flags=lanczos" -c:v libwebp -quality 70 public/frames/sd/wall.webp

# Lobby loop: the last stretch of the walk, played forward then back.
ffmpeg -v error -ss 4.2 -t 3.8 -i "$SRC/entrance.mp4" -an \
  -filter_complex "[0:v]scale=960:-2,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]" -map "[v]" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart public/media/lobby.mp4
ffmpeg -v error -i public/frames/hd/wall.webp -vf "scale=960:-2" -c:v libwebp -quality 75 public/media/lobby.webp

# Stills from the lobby for the treatment menu.
ffmpeg -v error -i "public/frames/hd/$last" -vf "crop=600:400:0:170" -c:v libwebp -quality 80 public/photos/station.webp
ffmpeg -v error -i "public/frames/hd/$last" -vf "crop=560:380:720:150" -c:v libwebp -quality 80 public/photos/lounge.webp

for photo in "$SRC"/photos/*.jpeg; do
  name=$(basename "$photo" .jpeg)
  ffmpeg -v error -i "$photo" -vf "scale='min(1000,iw)':-2" -c:v libwebp -quality 80 "public/photos/$name.webp"
done

# Nail reel for the Instagram-style post: slow push-in on each photo, crossfaded.
REEL=(pink-bloom-stiletto lilac-ombre black-white-flowers orange-flame pink-flower-toes crystal-3d-coffin rose-noir-stiletto)
HOLD=2.2 FADE=0.45 RFPS=30
frames=$(awk "BEGIN{print int($HOLD*$RFPS)}")
inputs=() chain=''
for i in "${!REEL[@]}"; do
  inputs+=(-loop 1 -t "$HOLD" -i "$SRC/photos/${REEL[$i]}.jpeg")
  chain+="[$i:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,setsar=1,"
  chain+="zoompan=z='1+0.10*on/$frames':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=544x680:fps=$RFPS,format=yuv420p[p$i];"
done
prev='p0'
for ((i = 1; i < ${#REEL[@]}; i++)); do
  offset=$(awk "BEGIN{print $i*($HOLD-$FADE)}")
  chain+="[$prev][p$i]xfade=transition=fade:duration=$FADE:offset=$offset[x$i];"
  prev="x$i"
done
ffmpeg -v error "${inputs[@]}" -filter_complex "${chain%;}" -map "[$prev]" -r $RFPS \
  -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart public/media/reel.mp4
ffmpeg -v error -i "$SRC/photos/${REEL[0]}.jpeg" -vf "scale=544:680:force_original_aspect_ratio=increase,crop=544:680" \
  -c:v libwebp -quality 75 public/media/reel.webp

echo "hero frames: $count"
du -sh public/frames/hd public/frames/sd public/media public/photos
