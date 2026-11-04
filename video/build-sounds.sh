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

# ── Alerts: donations, subs, follows… (assets/sounds/alerts/<style>.mp3) ──
ALERTS=assets/sounds/alerts
mkdir -p "$ALERTS"

# GTA "mission passed": whoosh in, sax jingle, cascade of casino chips for the money
mix "$ALERTS/gta.mp3" 2.4 \
  "$TMP/whoosh-in.wav:0.00:1.6" \
  "$K/jingles_SAX07.ogg:0.10:1.2" \
  "$K/chips-handle-5.ogg:0.55:0.9"

# Default: bright musical hit with a glass sparkle
mix "$ALERTS/default.mp3" 1.6 \
  "$K/jingles_HIT15.ogg:0.00:1.0" \
  "$K/glass_002.ogg:0.05:0.7"

# ── Alert sound packs (assets/sounds/alerts/packs/<pack>/<type>.mp3) ─────────
# One instrument per pack (cohesive), a DIFFERENT melody per event. Rising
# jingles go to the big events; all clips are loudness-normalised.
J=assets/sounds/kenney/jingles
NORM="loudnorm=I=-17:TP=-1.5:LRA=11"

clip() { # <src> <out>
  ffmpeg -v error -y -i "$1" -af "silenceremove=start_periods=1:start_threshold=-50dB,apad=pad_dur=0.15,$NORM,aformat=sample_rates=48000:channel_layouts=stereo" \
    -c:a libmp3lame -q:a 3 "$2"
}

# pack <name> <donation> <raid> <gift_sub> <subscription> <follow> <share> <like>
pack() {
  local dir=assets/sounds/alerts/packs/$1; shift
  mkdir -p "$dir"
  local i=0
  for t in donation raid gift_sub subscription follow share like; do
    i=$((i+1)); clip "$J/jingles_${!i}.ogg" "$dir/$t.mp3"
  done
  echo "built pack $(basename "$dir")"
}

pack tropical  STEEL12 STEEL03 STEEL13 STEEL10 STEEL09 STEEL04 STEEL08   # steel drums — GTA default
pack sax       SAX02   SAX03   SAX12   SAX15   SAX10   SAX13   SAX05     # Vice City sax
pack pizzicato PIZZI12 PIZZI03 PIZZI02 PIZZI15 PIZZI10 PIZZI06 PIZZI13   # playful strings — Neon default
pack arcade    NES12   NES05   NES08   NES03   NES06   NES09   NES01     # 8-bit
pack impacto   HIT11   HIT15   HIT10   HIT09   HIT03   HIT05   HIT01     # orchestral hits

# ── Stream-style packs from Freesound CC0 (assets/sounds/freesound/CREDITS.txt) ──
FS=assets/sounds/freesound

# sfx <out> <max seconds> <src:start:volume> ... — layered, trimmed, faded, normalised
sfx() {
  local out=$1 len=$2; shift 2
  local inputs=() filters="" labels="" i=0
  for cue in "$@"; do
    IFS=: read -r id start vol <<<"$cue"
    inputs+=(-i "$FS/$id.mp3")
    local ms; ms=$(awk "BEGIN { printf \"%d\", $start * 1000 }")
    filters+="[$i:a]aformat=sample_rates=48000:channel_layouts=stereo,silenceremove=start_periods=1:start_threshold=-45dB,volume=$vol,adelay=${ms}|${ms}[a$i];"
    labels+="[a$i]"; i=$((i+1))
  done
  local fade; fade=$(awk "BEGIN { printf \"%.3f\", $len - 0.35 }")
  ffmpeg -v error -y "${inputs[@]}" -filter_complex \
    "${filters}${labels}amix=inputs=$i:normalize=0,atrim=0:$len,afade=t=out:st=$fade:d=0.35,$NORM" \
    -c:a libmp3lame -q:a 3 "$out"
}

P=assets/sounds/alerts/packs/stream; mkdir -p "$P"     # bright, modern stream alerts
sfx "$P/donation.mp3"     2.2 573374:0:0.9 397354:0.08:1.0          # coins + ta-da
sfx "$P/raid.mp3"         3.1 456966:0:1.0                          # trumpet fanfare
sfx "$P/gift_sub.mp3"     2.0 844398:0:1.0 545238:0.05:0.6          # sparkle flourish
sfx "$P/subscription.mp3" 2.8 528958:0:1.0                          # level up / mission complete
sfx "$P/follow.mp3"       0.9 571513:0:1.0                          # soft ding-dong
sfx "$P/share.mp3"        0.6 242502:0:1.0                          # pop
sfx "$P/like.mp3"         0.7 545238:0:1.0                          # sparkle
echo "built pack stream"

P=assets/sounds/alerts/packs/logros; mkdir -p "$P"     # gamer achievements
sfx "$P/donation.mp3"     2.6 856038:0:1.0 573374:0.15:0.7          # victory + coins
sfx "$P/raid.mp3"         2.0 331361:0:1.0                          # unlock achievement
sfx "$P/gift_sub.mp3"     2.3 462092:0:1.0                          # sparkling star
sfx "$P/subscription.mp3" 1.4 813177:0:1.0                          # achievement
sfx "$P/follow.mp3"       0.5 740423:0:1.0                          # message notification
sfx "$P/share.mp3"        1.4 616699:0:1.0                          # notification chime
sfx "$P/like.mp3"         1.7 442943:0:1.0                          # level up
echo "built pack logros"
