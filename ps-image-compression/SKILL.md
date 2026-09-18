---
name: ps-image-compression
description: Compress PNG images with pngquant, optionally downscaling first, driven by a quality or resolution parameter. Use when the user says "compress this image", "make this png smaller", "optimize screenshots", "resize to 1200px", or invokes /ps-image-compression.
user-invocable: true
---

# Compress PNG Images

Shrink PNG files using `pngquant` (lossy palette quantization), with optional downscaling via `sips` before quantization. Requires `pngquant` (`brew install pngquant`); `sips` ships with macOS.

## Inputs

- **Target**: one or more PNG files, or a directory/glob. If the user didn't name one (or it doesn't exist), list PNGs in the current directory and ask them to pick.
- **`quality`** (optional): target visual quality, given as a number `0-100` or a range like `65-85`. Maps to pngquant's `--quality=min-max`.
- **`resolution`** (optional): max dimension in pixels (e.g. `1200`) or an explicit `WxH`. Downscale happens *before* quantization.

Both params are optional and independent — the user may pass one, both, or neither. Parse them out of natural phrasing too ("quality 60", "resize to 1600px wide", "under 500KB" → pick a quality that gets there).

## Defaults

Unless told otherwise:

- Quality: `--quality=65-85` — visually near-lossless for screenshots and UI captures, typically 60-80% smaller.
- Resolution: unchanged (no downscale).
- Speed: `--speed 1` (slowest, best compression — these are small files, it's fine).
- Strip metadata: `--strip`.

Don't interrupt to confirm defaults. Only ask when the request is genuinely ambiguous (e.g. "make it tiny" with no size target).

## Commands

Downscale first, only if `resolution` was given:

```bash
sips -Z <max-dimension> "<input>" --out "<work>.png"      # max dimension, preserves aspect
sips -z <H> <W> "<input>" --out "<work>.png"              # explicit HxW (note: height first)
```

Then quantize:

```bash
pngquant --quality=<min>-<max> --speed 1 --strip --force --output "<output>.png" -- "<input>.png"
```

Notes:

- pngquant **exits 99** when it can't hit the requested minimum quality and writes nothing. That's not a crash — widen the range (e.g. `45-85`) and retry once, and say so in the report.
- Exit 98 means the output would be larger than the input; keep the original in that case.
- Write to a new file by default (`<name>-min.png` alongside the source). Only overwrite in place when the user explicitly asks; `--force` is there for re-runs, not for silently clobbering originals.
- Non-PNG input (jpg, webp, heic): convert with `sips -s format png` first, or tell the user this skill is PNG-only if they want jpeg-native compression.
- Multiple files: loop, and keep going if one fails — report failures at the end rather than aborting.

## After running

Report a compact table: filename, before → after size, percent saved, and the final dimensions if you downscaled. Mention the quality range used, and flag any file that was skipped or needed a widened range.
