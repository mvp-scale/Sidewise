#!/bin/sh
# Trims a VHS render to the last visible change plus a hold, and re-palettes it small.
# Usage: docs/demo/trim.sh <in.gif> <out.gif> [hold_seconds]   (needs ffmpeg and python3)
# The tape ends on a long fixed sleep so a slow call still shows its verdict; this cuts the dead tail.
set -e
IN=$1; OUT=$2; HOLD=${3:-7}
# `command -p grep`: some shells alias grep to a shim that can miss matches.
LAST=$(ffmpeg -nostdin -i "$IN" -vf "select='gt(scene,0.002)',showinfo" -f null - 2>&1 | command -p grep -o 'pts_time:[0-9.]*' | tail -1 | cut -d: -f2)
END=$(python3 -c "print(round($LAST+$HOLD,2))")
echo "last change at ${LAST}s, cutting at ${END}s" >&2
ffmpeg -nostdin -loglevel error -y -i "$IN" -t "$END" -filter_complex "[0:v]split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none" "$OUT"
