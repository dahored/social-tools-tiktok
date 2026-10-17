#!/usr/bin/env bash
# Builds the soundtrack of each scene transition (assets/sounds/transitions/<game>.mp3)
# and the chat overlay message sounds (assets/sounds/chat/<style>.mp3).
# Cue times match the GSAP timelines in widgets/scene-transition/games/<game>.js.
# Sources: Kenney CC0 packs (assets/sounds/kenney, see License.txt) + whooshes
# synthesised here from filtered noise. Requires ffmpeg. Re-run after changing cues.
set -euo pipefail
cd "$(dirname "$0")/.."

K=assets/sounds/kenney
OUT=assets/sounds/transitions
mkdir -p "$OUT"

# whoosh <file> <seconds> <lowpass Hz> — swelling filtered pink noise
whoosh() {
  local rise fall
  rise=$(awk "BEGIN { printf \"%.3f\", $2 * 0.6 }")
  fall=$(awk "BEGIN { printf \"%.3f\", $2 * 0.4 }")
  ffmpeg -v error -y -f lavfi -i "anoisesrc=d=$2:c=pink:a=0.9:r=48000" \
    -af "highpass=f=250,lowpass=f=$3,afade=t=in:d=$rise:curve=qsin,afade=t=out:st=$rise:d=$fall:curve=qsin,aformat=channel_layouts=stereo" \
    "$1"
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
whoosh "$TMP/whoosh-in.wav"  0.50 4200
whoosh "$TMP/whoosh-out.wav" 0.45 2600

# mix <out> <total seconds> <file>:<start s>:<volume> ...
mix() {
  local out=$1 total=$2; shift 2
  local inputs=() filters="" labels="" i=0
  for cue in "$@"; do
    IFS=: read -r file start vol <<<"$cue"
    inputs+=(-i "$file")
    local ms; ms=$(awk "BEGIN { printf \"%d\", $start * 1000 }")
    filters+="[$i:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=$vol,adelay=${ms}|${ms}[a$i];"
    labels+="[a$i]"
    i=$((i+1))
  done
  ffmpeg -v error -y "${inputs[@]}" -filter_complex \
    "${filters}${labels}amix=inputs=$i:normalize=0,alimiter=limit=0.9,apad,atrim=0:$total" \
    -c:a libmp3lame -q:a 3 "$out"
  echo "built $out"
}

# GTA (2.2 s): bands in → box slam → sax on the name → sparkle → bands out
mix "$OUT/gta.mp3" 2.2 \
  "$TMP/whoosh-in.wav:0.00:2.6" \
  "$K/impactPunch_heavy_001.ogg:0.38:0.8" \
  "$K/jingles_SAX03.ogg:0.48:0.75" \
  "$K/glass_001.ogg:0.62:0.5" \
  "$TMP/whoosh-out.wav:1.42:2.2"

# Default (2.0 s): bands in → box pop → musical hit → bands out
mix "$OUT/default.mp3" 2.0 \
  "$TMP/whoosh-in.wav:0.00:2.6" \
  "$K/impactSoft_heavy_000.ogg:0.32:0.8" \
  "$K/jingles_HIT03.ogg:0.42:0.7" \
  "$TMP/whoosh-out.wav:1.33:2.2"

# ── Chat overlay: one short sound per incoming message ────────────────
CHAT=assets/sounds/chat
mkdir -p "$CHAT"
OUT=$CHAT

# Default: friendly two-note ding
mix "$CHAT/default.mp3" 0.45 \
  "$K/confirmation_001.ogg:0.00:0.9"

# GTA: crisp "phone text" glint + a quick Vice City sax lick
mix "$CHAT/gta.mp3" 0.6 \
  "$K/glass_002.ogg:0.00:1.0" \
  "$K/jingles_SAX09.ogg:0.03:1.4"
