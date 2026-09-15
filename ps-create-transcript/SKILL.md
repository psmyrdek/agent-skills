---
name: ps-create-transcript
description: Transcribe an audio/video file to a Polish SRT and translate it to an English SRT using OpenRouter (or OpenAI directly). Use when the user says "transcribe this", "make subtitles", "create a transcript", "generate SRT", "translate this recording to English", or invokes /ps-create-transcript.
user-invocable: true
---

# Create Transcript (SRT)

Turns a recording into two subtitle files:

- `<name>.pl.srt` — transcript in the source language (Polish by default)
- `<name>.en.srt` — English translation, cue-for-cue aligned with the transcript

Everything runs through `scripts/transcript.ts` (Bun + ffmpeg, no npm install needed).

## Inputs

- **Target file**: any audio or video file (`mp3`, `m4a`, `wav`, `mov`, `mp4`, `mkv`…). If the user didn't name one, or it doesn't exist, list likely candidates in the current directory and ask which one.
- Multiple files: run the script once per file.

## Run it

```bash
bun ~/.claude/skills/ps-create-transcript/scripts/transcript.ts "<file>"
```

That default does both modes, Polish source, OpenRouter, output next to the input file. Useful flags:

| Flag | Purpose |
| --- | --- |
| `--mode transcribe` / `--mode translate` | only one of the two outputs (default `both`) |
| `--lang en`, `--lang de`, … | source language is not Polish (also renames the output to `<name>.<lang>.srt`) |
| `--provider openai` | go direct to OpenAI instead of OpenRouter |
| `--prompt "Przemek, 10xDevs, Astro"` | names/jargon hint sent to the transcriber itself |
| `--glossary "Claude Code, Astro"` | force these spellings in the review pass |
| `--no-review` | skip the review pass (faster and cheaper, worse proper nouns) |
| `--out-dir <dir>` | write the SRTs somewhere else |
| `--force` | overwrite existing SRT files (the script refuses by default) |
| `--dry-run` | show duration, chunking plan and target files without spending tokens |
| `--chunk-seconds <n>` | shorter chunks (default 600) if a chunk still exceeds 25 MB |
| `--model` / `--translate-model` | override the STT or translation model |

Run `--dry-run` first for anything long or unfamiliar — it reports how many API requests the real run will make.

## The review pass

Speech recognition reliably mangles English product and personal names spoken inside Polish — real observed output: `Cloud co day`, `skiliwce laude caude`, `Skilliftlaude codej`, all meaning "skille w Claude Code". A raw transcript is therefore not usable as-is.

So after transcribing, the script runs a review (on by default):

1. **Glossary** — one call reads the whole transcript and reports the garbled spellings it finds, with corrections. Working across the whole transcript is what makes this reliable: a name mangled five different ways is recognisable in aggregate even when a single cue is ambiguous.
2. **Proofread** — cues are corrected in batches against that glossary, with the preceding cues as context.

The review is deliberately narrow: it may fix mangled names, technical jargon and obvious mishearings, and nothing else. It must not translate, rephrase, tidy up informal speech, or change cue count or timings. If a batch comes back with the wrong number of cues, that batch is kept unreviewed rather than risking broken timings.

Pass `--glossary "Claude Code, Astro, 10xDevs"` when you already know the vocabulary — it anchors the glossary step instead of making it guess. Pass `--no-review` to skip the pass entirely.

**Verify the corrections on anything important.** `PS_TRANSCRIPT_VERBOSE=1` logs every `- before` / `+ after` change to stderr. The glossary step can over-reach on ambiguous fragments — during development it once turned Polish `i o` ("and about") into a hallucinated `Claude Code I/O` across 13 cues. The prompts guard against this, but a spot-check on a long recording is cheap insurance.

## Providers and keys

Default provider is **openrouter**, which reads `OPENROUTER_API_KEY` from the environment. `--provider openai` reads `OPENAI_PLATFORM_TOKEN`, then `OPENAI_API_KEY`. Each provider also falls back to `~/.<provider>_token` files and the macOS keychain. The script prints exact setup instructions if it finds no key — don't invent a key or hardcode one.

## How it works (and why)

- **Audio prep** — ffmpeg downmixes to mono 16 kHz MP3. Video files, wav, and anything over the providers' 25 MB upload cap go through this; small supported audio is uploaded as-is.
- **Chunking** — if still over 25 MB, the audio is split into 10-minute chunks and the per-chunk SRT timestamps are shifted by each chunk's measured start time before merging, so timings stay correct on long recordings.
- **SRT is built locally** from `verbose_json` segments. OpenRouter rejects `response_format=srt` (only `json` and `verbose_json`), so asking the API for SRT directly is not an option there.
- **Translation uses a chat model** (`--translate-mode llm`, the default) rather than a speech translation endpoint. OpenRouter has no `/audio/translations` endpoint at all, and translating the transcribed cues keeps the English timings identical to the Polish ones, so the two SRTs line up. `--translate-mode native` uses OpenAI's `/v1/audio/translations` instead, and only works with `--provider openai`.

## Testing a change to the script

`PS_TRANSCRIPT_SIZE_LIMIT=1000` lowers the size threshold that triggers splitting, so the chunk-and-merge path can be exercised on a short clip (`--chunk-seconds 30`) instead of needing a 25 MB recording.

## After running

Report the output paths, cue counts, the source duration, and how many cues the review corrected. If the glossary found terms, show them — they tell the user at a glance whether the review understood the subject matter or went off the rails. If the user is going to burn subtitles into a video or review them, mention that both SRTs share identical timings so they can be swapped freely.

Don't paste whole transcripts into chat unless asked — point at the files, and quote at most a few cues to show the result looks right.
