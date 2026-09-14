---
name: ps-extract-audio
description: Extract an audio-only MP3 track from a movie/video file using ffmpeg. Use when the user says "extract audio", "pull audio from this video", "get the mp3 from this mov/mp4", or invokes /ps-extract-audio.
user-invocable: true
---

# Extract Audio from Video

Extract the audio track from a video file (mov, mp4, mkv, etc.) into a standalone MP3 using `ffmpeg`. Requires `ffmpeg` with `libmp3lame`.

## Inputs

- **Target file**: the movie file to extract audio from. If the user didn't name one (or named one ambiguously / it doesn't exist), ask them which file, or list video files in the current directory (`*.mov`, `*.mp4`, `*.mkv`, `*.m4v`) and ask them to pick.
- Support multiple files if the user gives more than one — process each in turn.

## Defaults

Unless the user specifies otherwise, default to a **lowish-quality mono MP3** (small file size, fine for voice/lecture-style content):

- Mono: `-ac 1`
- Sample rate: `-ar 22050`
- Bitrate: `-b:a 64k`
- Codec: `-codec:a libmp3lame`

Only ask the user about these params if:
- The file sounds music-heavy or high-fidelity is implied (e.g. "music track", "song"), in which case suggest stereo + higher bitrate (e.g. `-ac 2 -ar 44100 -b:a 192k`) and confirm.
- The user's request is ambiguous about quality (e.g. just "extract the audio" with no quality hint given previously) — a quick one-line confirmation of the default is enough, don't over-ask.
- Otherwise, just proceed with the lowish-quality default silently — don't interrupt for params that already have a sensible default.

## Command

```bash
ffmpeg -i "<input>" -vn -ac 1 -ar 22050 -codec:a libmp3lame -b:a 64k "<output>.mp3"
```

- `-vn` drops the video stream entirely (audio-only output).
- Output filename: same basename as input, `.mp3` extension, written alongside the source file unless the user asks for a different location.
- Don't overwrite an existing output file without confirming — ffmpeg will prompt interactively otherwise, which can hang in a non-interactive shell; check first with `ls` or pass `-y`/`-n` deliberately based on user intent.

## After running

Report the output filename, resulting duration/size, and the bitrate/mono setting used, so the user can tell at a glance what they got.
