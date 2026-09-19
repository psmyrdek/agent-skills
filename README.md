# agent-skills

Personal [Claude Code](https://claude.com/claude-code) skills.

| Skill | What it does |
|---|---|
| [`ps-url-to-lead`](ps-url-to-lead/) | Turns a URL into a short Polish newsletter lead, following a fixed four-beat structure and style guide. |
| [`ps-video-to-audio`](ps-video-to-audio/) | Extracts an audio-only MP3 track from a video file using `ffmpeg`. |
| [`ps-text-translate`](ps-text-translate/) | Translates between Polish and English, direction detected from the input, preserving register, terminology and markdown structure. |
| [`ps-audio-to-transcript`](ps-audio-to-transcript/) | Turns a recording into a source-language SRT and a time-aligned English SRT, with a review pass that repairs proper nouns the transcriber mangled. |
| [`ps-image-compression`](ps-image-compression/) | Compresses PNGs with `pngquant`, with optional downscaling, driven by a `quality` or `resolution` param. |
| [`ps-video-fix-fps`](ps-video-fix-fps/) | Diagnoses variable frame rate in screen recordings and re-renders them to a constant 60 fps with `ffmpeg`, removing dead frames. |

## Install

Clone into your Claude Code skills directory:

```bash
git clone https://github.com/psmyrdek/agent-skills.git /tmp/agent-skills
cp -R /tmp/agent-skills/ps-* ~/.claude/skills/
```

Restart your session, then invoke with `/ps-url-to-lead <url>`, `/ps-video-to-audio <file>`, `/ps-text-translate <text|file>` `/ps-audio-to-transcript <file>`, `/ps-image-compression <file>` or `/ps-video-fix-fps <file>`.

`ps-video-to-audio` and `ps-video-fix-fps` need [`ffmpeg`](https://ffmpeg.org) (`brew install ffmpeg`). `ps-image-compression` needs [`pngquant`](https://pngquant.org) (`brew install pngquant`). `ps-audio-to-transcript` additionally needs [Bun](https://bun.sh), `ffmpeg`, and an `OPENROUTER_API_KEY` (or `OPENAI_PLATFORM_TOKEN`) in your environment.
