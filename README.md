# agent-skills

Personal [Claude Code](https://claude.com/claude-code) skills.

| Skill | What it does |
|---|---|
| [`ps-to-lead`](ps-to-lead/) | Turns a URL into a short Polish newsletter lead, following a fixed four-beat structure and style guide. |
| [`ps-extract-audio`](ps-extract-audio/) | Extracts an audio-only MP3 track from a video file using `ffmpeg`. |
| [`ps-translate`](ps-translate/) | Translates between Polish and English, direction detected from the input, preserving register, terminology and markdown structure. |

## Install

Clone into your Claude Code skills directory:

```bash
git clone https://github.com/psmyrdek/agent-skills.git /tmp/agent-skills
cp -R /tmp/agent-skills/ps-* ~/.claude/skills/
```

Restart your session, then invoke with `/ps-to-lead <url>`, `/ps-extract-audio <file>` or `/ps-translate <text|file>`.
