#!/usr/bin/env bash
# Turns media/source/ into the web-ready files under public/.
#   entrance.mp4 / entrance-portrait.mp4
#                 -> public/frames/{land,port}/{hd,sd}/f00000.webp ... (scroll-scrubbed hero)
#                 -> public/frames/{land,port}/{hd,sd}/wall.webp, wall-blur.webp
#                    (last frame with the wall sign removed, and a soft-focus copy of it)
#                 -> public/media/lobby.mp4 + .webp    (lobby loop for the reveal)
#                 -> public/photos/station.webp, lounge.webp (stills for the menu)
#   photos/*.jpeg -> public/photos/*.webp
#                 -> public/media/reel.mp4 + .webp     (Ken Burns nail reel for the post)
# Needs ffmpeg. Re-run whenever a source file changes.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=media/source
FPS=12 # hero frames per second of footage; the player crossfades between them

rm -rf public/frames public/media public/photos
mkdir -p public/media public/photos

# film <name> <source> <hd width> <hd quality> <sd width> <sd quality> <sign box x:y:w:h in source pixels>
# The sign box is the "Tubo" lettering on the reception wall in the source's
# last frame, with a margin; keep it in step with FILMS in src/main.ts.
film() {
  local name=$1 src=$2 hdw=$3 hdq=$4 sdw=$5 sdq=$6 box=$7
  local srcw count last
  srcw=$(ffprobe -v error -select_streams v -show_entries stream=width -of csv=p=0 "$src")
  IFS=: read -r bx by bw bh <<<"$box"
  for tier in hd sd; do
    local w=$hdw q=$hdq
    [ "$tier" = sd ] && w=$sdw q=$sdq
    mkdir -p "public/frames/$name/$tier"
    ffmpeg -v error -i "$src" -vf "fps=$FPS,scale=$w:-2:flags=lanczos" \
      -c:v libwebp -quality "$q" -compression_level 6 -start_number 0 "public/frames/$name/$tier/f%05d.webp"
    count=$(ls "public/frames/$name/$tier" | wc -l | tr -d ' ')
    last=$(printf 'f%05d.webp' $((count - 1)))
    # The wall without its sign: the same frame the film ends on, with the
    # lettering painted out, so the name can be pulled off the wall; and a
    # soft-focus copy for when focus racks to the name (cheaper than a live blur).
    local k
    k=$(awk "BEGIN{print $w/$srcw}")
    ffmpeg -v error -i "public/frames/$name/$tier/$last" -vf \
      "delogo=x=$(awk "BEGIN{print int($bx*$k)}"):y=$(awk "BEGIN{print int($by*$k)}"):w=$(awk "BEGIN{print int($bw*$k)+1}"):h=$(awk "BEGIN{print int($bh*$k)+1}")" \
      -c:v libwebp -quality "$q" "public/frames/$name/$tier/wall.webp"
    ffmpeg -v error -i "public/frames/$name/$tier/wall.webp" -vf "scale=iw/4:-2,gblur=sigma=$(awk "BEGIN{print $w/400}"),scale=$w:-2" \
      -c:v libwebp -quality 60 "public/frames/$name/$tier/wall-blur.webp"
  done
  echo "\"$name\": { \"count\": $count }"
}

land=$(film land "$SRC/entrance.mp4" 1280 70 854 58 548:297:120:45)
port=$(film port "$SRC/entrance-portrait.mp4" 720 66 540 56 200:532:202:72)
printf '{ "fps": %s, %s, %s }\n' "$FPS" "$land" "$port" > src/frames.generated.json
last=$(printf 'f%05d.webp' $(($(ls public/frames/land/hd | grep -c '^f') - 1)))

# Lobby loop: the last stretch of the walk, played forward then back.
ffmpeg -v error -ss 4.2 -t 3.8 -i "$SRC/entrance.mp4" -an \
  -filter_complex "[0:v]scale=960:-2,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]" -map "[v]" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart public/media/lobby.mp4
ffmpeg -v error -i public/frames/land/hd/wall.webp -vf "scale=960:-2" -c:v libwebp -quality 72 public/media/lobby.webp
ffmpeg -v error -ss 4.2 -t 3.8 -i "$SRC/entrance-portrait.mp4" -an \
  -filter_complex "[0:v]scale=540:-2,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]" -map "[v]" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart public/media/lobby-portrait.mp4
ffmpeg -v error -i public/frames/port/hd/wall.webp -vf "scale=540:-2" -c:v libwebp -quality 72 public/media/lobby-portrait.webp

# Stills from the lobby for the treatment menu.
ffmpeg -v error -i "public/frames/land/hd/$last" -vf "crop=600:400:0:170" -c:v libwebp -quality 80 public/photos/station.webp
ffmpeg -v error -i "public/frames/land/hd/$last" -vf "crop=560:380:720:150" -c:v libwebp -quality 80 public/photos/lounge.webp

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

cat src/frames.generated.json
du -sh public/frames/*/* public/media public/photos
