---
name: ps-video-fix-fps
description: Diagnose variable frame rate in screen recordings (QuickTime, OBS, Loom) and re-render them to a constant frame rate with ffmpeg, so there are no dead/dropped frames. Use when the user says "low frame rate", "dead frames", "martwe klatki", "niski frame rate", "fix fps", "make it constant 30/60 fps", "re-render this recording", or invokes /ps-video-fix-fps.
user-invocable: true
---

# Fix Frame Rate in Screen Recordings

QuickTime screen recordings (and other screen capturers) are **variable frame rate**: a frame is written only when the screen changes. A static screen can produce multi-second gaps with no frames at all. Players and editors then stutter, scrubbing is jumpy, and the nominal `r_frame_rate` (usually 60) lies about what's really in the file.

This skill: measure the real frame pacing, then re-render to a **constant frame rate** (CFR), duplicating frames across the dead stretches. Requires `ffmpeg`/`ffprobe` with `libx264`.

## Inputs

- **Target file(s)**: the recording(s) to fix. If the user didn't name one, or described them loosely ("the recordings from today after 5pm", "the newest one"), resolve it yourself with `ls -lt`/`ls -la` over the likely directory and filter by mtime and name — then say which files you picked before processing.
- **Target fps**: default **60**. Use what the user asks for if they name a number ("at least 30" → 60 is fine and keeps sub-60 motion smooth). Keep one fps across a batch so the files stay editable together.
- Process multiple files in turn; report per file.

## Step 1 — diagnose before touching anything

Always measure first and show the user the numbers. `avg_frame_rate` alone is not enough — a file can average 57 fps and still have a 50 s hole.

```bash
ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration \
  -of default=noprint_wrappers=1 "<input>"
```

Then the gap distribution, which is what actually matters:

```bash
ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -of csv=p=0 "<input>" \
| awk -F, 'NF&&$1!=""{t=$1; if(p!=""){d=t-p; n++; s+=d; if(d>mx)mx=d; if(d>0.0334)o30++} p=t}
  END{printf "klatek=%d  sredni odstep=%.4fs (%.1f fps)  max przerwa=%.2fs  przerw>33ms=%d (%.1f%%)\n", n+1, s/n, n/s, mx, o30, 100*o30/n}'
```

This decodes frame headers for the whole file — on a long 1440p recording it takes tens of seconds, so allow a generous timeout.

Read the result like this:

- **max przerwa ≤ ~0.05 s and <1 % of gaps over 33 ms** → the file is fine in practice; it's still VFR, but nothing is visibly missing. Say so rather than implying you rescued it.
- **max przerwa in seconds, or a double-digit % of gaps over 33 ms** → the real problem. Quote the average fps and the worst gap.

Re-render anyway when the user asked for it — CFR output is worth having for editing even when the source was fine — but report honestly which files actually had the defect.

## Step 2 — re-render to CFR

```bash
ffmpeg -hide_banner -loglevel warning -stats -y -i "<input>" \
  -vf "fps=60" -fps_mode cfr -r 60 \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart \
  "<basename>-60fps.mp4"
```

- `fps=60` + `-fps_mode cfr -r 60` fills the dead stretches with duplicated frames. Timing and total duration are preserved exactly — nothing is sped up or cut.
- `libx264 -preset veryfast -crf 20` is the right trade for screen content: visually lossless-ish, fast, and duplicate frames cost almost nothing (they encode as near-empty P-frames). Screen recordings usually come out *smaller* than the source despite more frames.
- `h264_videotoolbox` is available on macOS and is faster, but at this CRF x264 is already ~13x realtime at 1440p and gives better quality per byte. Only reach for videotoolbox on very long files where wall-clock matters.
- `-pix_fmt yuv420p` and `+faststart` keep the output playable everywhere.
- **Audio**: check for an audio stream first. QuickTime screen recordings often have none — then pass `-an` and say so in the report. If audio exists, carry it with `-c:a aac -b:a 192k` (re-encoding, since the container changes) and never silently drop it.

Never overwrite the source. Write `<basename>-<fps>fps.mp4` next to the original unless the user asks for another location, and leave the `.mov` untouched.

## Step 3 — verify

Don't claim it's fixed without checking the output:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate,nb_frames,duration \
  -of default=noprint_wrappers=1 "<output>"
```

Expect `avg_frame_rate=60/1` and a duration matching the source. Re-running the gap script on the output should give `max przerwa` ≈ 1/fps (0.0167 s at 60).

## Report

A small before/after table per file: average fps, max gap, frame count, size — plus the output filename, unchanged duration, and whether audio was present. Name the files that were already fine, so the user learns which recordings actually have the problem.
