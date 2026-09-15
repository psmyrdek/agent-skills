#!/usr/bin/env bun
/**
 * transcript.ts — audio/video -> SRT subtitles.
 *
 *   transcribe : source language (default Polish) -> <name>.pl.srt
 *   translate  : -> English                       -> <name>.en.srt
 *
 * Providers (--provider):
 *   openrouter (default) — POST /api/v1/audio/transcriptions, key OPENROUTER_API_KEY
 *   openai               — POST /v1/audio/transcriptions,     key OPENAI_PLATFORM_TOKEN
 *
 * Both providers speak the same multipart contract, so the transcription path is
 * shared. Two provider differences drive the rest of the design:
 *   - OpenRouter rejects response_format=srt (json | verbose_json only), so we
 *     always ask for verbose_json and render the SRT ourselves.
 *   - OpenRouter has no /audio/translations endpoint, so English is produced by
 *     translating the transcribed cues with a chat model. That is the default on
 *     both providers: it keeps English cues time-aligned to the source cues and
 *     reads better than whisper's own translation. --translate-mode native uses
 *     OpenAI's /v1/audio/translations instead (openai provider only).
 *
 * Speech recognition mangles proper nouns spoken inside another language ("Cloud
 * co day" for "Claude Code"), so ASR output goes through a review pass: one call
 * builds a glossary of garbled names across the whole transcript, then batches of
 * cues are proofread against it. The review may only repair recognition errors —
 * cue count and timings are preserved, and a batch whose count comes back wrong is
 * kept unreviewed rather than corrupting the subtitle timing.
 *
 * The 25 MB upload cap is handled by transcoding to mono 16 kHz MP3 and, if still
 * too large, splitting into chunks whose SRT timestamps are stitched back together.
 *
 * Usage:
 *   bun transcript.ts <file> [--mode both|transcribe|translate] [--lang pl]
 *        [--provider openrouter|openai] [--translate-mode llm|native]
 *        [--out-dir DIR] [--model ID] [--translate-model ID] [--prompt "..."]
 *        [--glossary "..."] [--no-review]
 *        [--chunk-seconds 600] [--force] [--keep-temp] [--dry-run]
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, dirname, extname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";

const run = promisify(execFile);

const UPLOAD_LIMIT = 25 * 1024 * 1024; // provider cap on a single audio upload
// Headroom for multipart overhead. PS_TRANSCRIPT_SIZE_LIMIT lowers it so the
// chunk-and-merge path can be exercised without a 25 MB recording.
const SAFE_LIMIT = Number(process.env.PS_TRANSCRIPT_SIZE_LIMIT) || 24 * 1024 * 1024;
const BATCH_SIZE = 40; // cues per translation/review request
const CONTEXT_CUES = 4; // preceding cues shown to the model for continuity
const GLOSSARY_SAMPLE = 16000; // chars of transcript scanned when building the glossary
// PS_TRANSCRIPT_VERBOSE=1 logs every correction the review pass makes, so its
// edits can be audited rather than taken on trust.
const VERBOSE = process.env.PS_TRANSCRIPT_VERBOSE === "1";

type Provider = "openrouter" | "openai";
type Mode = "both" | "transcribe" | "translate";
type TranslateMode = "llm" | "native";

interface ProviderConfig {
  baseUrl: string;
  sttModel: string;
  chatModel: string;
  envKeys: string[];
  keyFiles: string[];
  keychainServices: string[];
  hint: string;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    sttModel: "openai/whisper-1",
    chatModel: "openai/gpt-5.1",
    envKeys: ["OPENROUTER_API_KEY", "OPENROUTER_TOKEN"],
    keyFiles: [".openrouter_token", ".config/openrouter/token"],
    keychainServices: ["openrouter_api_key"],
    hint: 'export OPENROUTER_API_KEY=sk-or-v1-...   (e.g. in ~/.zshenv)',
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    sttModel: "whisper-1",
    chatModel: "gpt-5.1",
    envKeys: ["OPENAI_PLATFORM_TOKEN", "OPENAI_API_KEY", "OPENAI_TOKEN"],
    keyFiles: [".openai_platform_token", ".config/openai/token"],
    keychainServices: ["openai_platform_token"],
    hint: "export OPENAI_PLATFORM_TOKEN=sk-...   (e.g. in ~/.zshenv)",
  },
};

interface Options {
  input: string;
  provider: Provider;
  mode: Mode;
  translateMode: TranslateMode;
  lang: string;
  outDir: string;
  model: string;
  chatModel: string;
  prompt?: string;
  review: boolean;
  glossary: string[];
  chunkSeconds: number;
  force: boolean;
  keepTemp: boolean;
  dryRun: boolean;
}

// ---------------------------------------------------------------- args

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

const USAGE = `Usage: bun transcript.ts <audio-or-video-file> [options]

  --provider openrouter|openai     default: openrouter
  --mode both|transcribe|translate default: both
  --translate-mode llm|native      default: llm (native = OpenAI /audio/translations)
  --lang <iso-639-1>               source language, default: pl
  --out-dir <dir>                  default: alongside the input file
  --model <id>                     speech-to-text model, default: per provider
  --translate-model <id>           chat model for --translate-mode llm
  --prompt <text>                  names/jargon hint for the transcriber
  --glossary "Claude Code, Astro"  terms the transcript must spell this way
  --no-review                      skip the proper-noun/mishearing review pass
  --chunk-seconds <n>              chunk length when splitting, default: 600
  --force                          overwrite existing .srt files
  --keep-temp                      keep the ffmpeg working directory
  --dry-run                        prepare audio, print the plan, make no API calls`;

function parseArgs(argv: string[]): Options {
  const positional: string[] = [];
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (["force", "keep-temp", "dry-run", "help", "no-review"].includes(key)) {
      flags.set(key, "true");
    } else {
      const next = argv[++i];
      if (next === undefined) fail(`Flag --${key} needs a value`);
      flags.set(key, next);
    }
  }

  if (flags.has("help") || positional.length === 0) {
    console.log(USAGE);
    process.exit(flags.has("help") ? 0 : 1);
  }

  const input = resolve(positional[0]);
  if (!existsSync(input)) fail(`Input file not found: ${input}`);

  const provider = (flags.get("provider") ?? "openrouter") as Provider;
  if (!(provider in PROVIDERS)) fail(`--provider must be openrouter|openai, got "${provider}"`);
  const config = PROVIDERS[provider];

  const mode = (flags.get("mode") ?? "both") as Mode;
  if (!["both", "transcribe", "translate"].includes(mode)) {
    fail(`--mode must be both|transcribe|translate, got "${mode}"`);
  }

  const translateMode = (flags.get("translate-mode") ?? "llm") as TranslateMode;
  if (!["llm", "native"].includes(translateMode)) {
    fail(`--translate-mode must be llm|native, got "${translateMode}"`);
  }
  if (translateMode === "native" && provider !== "openai") {
    fail("--translate-mode native needs --provider openai (OpenRouter has no /audio/translations endpoint)");
  }

  const chunkSeconds = Number(flags.get("chunk-seconds") ?? 600);
  if (!Number.isFinite(chunkSeconds) || chunkSeconds < 30) {
    fail("--chunk-seconds must be a number >= 30");
  }

  return {
    input,
    provider,
    mode,
    translateMode,
    lang: flags.get("lang") ?? "pl",
    outDir: resolve(flags.get("out-dir") ?? dirname(input)),
    model: flags.get("model") ?? config.sttModel,
    chatModel: flags.get("translate-model") ?? config.chatModel,
    prompt: flags.get("prompt"),
    review: !flags.has("no-review"),
    glossary: (flags.get("glossary") ?? "")
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean),
    chunkSeconds,
    force: flags.has("force"),
    keepTemp: flags.has("keep-temp"),
    dryRun: flags.has("dry-run"),
  };
}

// ---------------------------------------------------------------- key

/** Looks for the provider's API key in env vars, then dotfiles, then the macOS keychain. */
async function resolveKey(provider: Provider): Promise<string> {
  const config = PROVIDERS[provider];

  for (const name of config.envKeys) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  for (const relative of config.keyFiles) {
    const file = join(homedir(), relative);
    if (existsSync(file)) {
      const value = readFileSync(file, "utf8").trim();
      if (value) return value;
    }
  }

  if (process.platform === "darwin") {
    for (const service of config.keychainServices) {
      for (const selector of ["-s", "-a"]) {
        try {
          const { stdout } = await run("security", [
            "find-generic-password", selector, service, "-w",
          ]);
          const value = stdout.trim();
          if (value) return value;
        } catch {
          // not stored under that name — keep looking
        }
      }
    }
  }

  fail(
    [
      `No ${provider} API key found. Set one of:`,
      `  ${config.hint}`,
      `  echo <key> > ~/${config.keyFiles[0]}`,
      `  security add-generic-password -s ${config.keychainServices[0]} -a $USER -w <key>`,
    ].join("\n"),
  );
}

// ---------------------------------------------------------------- ffmpeg

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const seconds = Number(stdout.trim());
  return Number.isFinite(seconds) ? seconds : 0;
}

const ENCODE_ARGS = [
  "-vn",
  "-ac", "1",
  "-ar", "16000",
  "-codec:a", "libmp3lame",
  "-b:a", "48k",
];

/**
 * Returns an upload-ready file. Small audio already in a supported container is
 * passed through; video and oversized input is downmixed to mono 16 kHz MP3,
 * which is both what the models want and what keeps us under the size cap.
 */
async function prepareAudio(input: string, workDir: string): Promise<string> {
  const supported = [".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg", ".flac"];
  const size = statSync(input).size;
  if (supported.includes(extname(input).toLowerCase()) && size <= SAFE_LIMIT) return input;

  console.error(`> transcoding to mono 16 kHz MP3 (source ${mb(size)})`);
  const output = join(workDir, "audio.mp3");
  await run("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-i", input, ...ENCODE_ARGS, output]);
  return output;
}

interface Chunk {
  path: string;
  offset: number;
}

/** Splits audio into fixed-length chunks, tagging each with its start time. */
async function splitAudio(audio: string, workDir: string, chunkSeconds: number): Promise<Chunk[]> {
  const dir = join(workDir, "chunks");
  mkdirSync(dir, { recursive: true });

  await run("ffmpeg", [
    "-nostdin", "-loglevel", "error", "-y",
    "-i", audio,
    "-f", "segment",
    "-segment_time", String(chunkSeconds),
    "-reset_timestamps", "1",
    ...ENCODE_ARGS,
    join(dir, "chunk-%03d.mp3"),
  ]);

  const names = readdirSync(dir).filter((f) => f.endsWith(".mp3")).sort();
  if (names.length === 0) fail("ffmpeg produced no chunks");

  // Accumulate measured durations instead of assuming an exact chunkSeconds each,
  // so offsets stay correct across a long file.
  const chunks: Chunk[] = [];
  let offset = 0;
  for (const name of names) {
    const path = join(dir, name);
    chunks.push({ path, offset });
    offset += await probeDuration(path);
  }

  const oversized = chunks.filter((c) => statSync(c.path).size > UPLOAD_LIMIT);
  if (oversized.length > 0) {
    fail(`${oversized.length} chunk(s) still exceed 25 MB — rerun with a smaller --chunk-seconds`);
  }
  return chunks;
}

// ---------------------------------------------------------------- srt

interface Cue {
  start: number;
  end: number;
  text: string;
}

function formatTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const pad = (n: number, width = 2) => String(Math.floor(n)).padStart(width, "0");
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${pad(total / 3600)}:${pad((total % 3600) / 60)}:${pad(total % 60)},${pad(ms, 3)}`;
}

/**
 * Sorts cues and removes overlaps. Whisper's final segment in a chunk often runs
 * slightly past that chunk's measured duration, so after merging, a cue can start
 * before its predecessor ends — which some players render badly.
 */
function normalizeCues(cues: Cue[]): Cue[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Cue[] = [];

  for (const cue of sorted) {
    const previous = out[out.length - 1];
    if (previous && cue.start < previous.end) previous.end = cue.start;
    // A cue fully swallowed by the clamp above carries no displayable time; nudge
    // it out to a minimum rather than emitting a zero-length entry.
    const end = cue.end > cue.start ? cue.end : cue.start + 0.5;
    out.push({ ...cue, end });
  }

  return out.filter((cue) => cue.end > cue.start);
}

function renderSrt(cues: Cue[]): string {
  if (cues.length === 0) return "";
  return (
    cues
      .map((c, i) => `${i + 1}\n${formatTime(c.start)} --> ${formatTime(c.end)}\n${c.text}`)
      .join("\n\n") + "\n"
  );
}

// ---------------------------------------------------------------- api

async function request(
  url: string,
  init: RequestInit,
  label: string,
  key: string,
): Promise<Response> {
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${key}` },
    });
    if (response.ok) return response;

    const body = await response.text();
    lastError = `${response.status} ${response.statusText}: ${body.slice(0, 500)}`;
    if (response.status !== 429 && response.status < 500) break;
    if (attempt === 3) break;
    const delay = 2000 * attempt;
    console.error(`> ${label} failed (${response.status}), retrying in ${delay / 1000}s`);
    await new Promise((r) => setTimeout(r, delay));
  }
  fail(`${label} request failed — ${lastError}`);
}

interface VerboseJson {
  text?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
}

/**
 * One speech-to-text call. `endpoint` is "transcriptions" everywhere except the
 * OpenAI-only native translation path.
 */
async function speechToText(
  endpoint: "transcriptions" | "translations",
  file: string,
  opts: Options,
  key: string,
): Promise<Cue[]> {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)]), basename(file));
  form.append("model", opts.model);
  form.append("response_format", "verbose_json");
  if (opts.prompt) form.append("prompt", opts.prompt);
  // /audio/translations always emits English and rejects a language param.
  if (endpoint === "transcriptions" && opts.lang) form.append("language", opts.lang);

  const url = `${PROVIDERS[opts.provider].baseUrl}/audio/${endpoint}`;
  const response = await request(url, { method: "POST", body: form }, endpoint, key);
  const data = (await response.json()) as VerboseJson;

  if (!data.segments || data.segments.length === 0) {
    // No timestamped segments: fall back to one cue covering the whole chunk.
    const text = data.text?.trim();
    if (!text) return [];
    return [{ start: 0, end: await probeDuration(file), text }];
  }

  return data.segments
    .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
    .filter((c) => c.text.length > 0);
}

/** Runs speech-to-text over every chunk and returns one continuous cue list. */
async function cuesFromChunks(
  endpoint: "transcriptions" | "translations",
  chunks: Chunk[],
  opts: Options,
  key: string,
): Promise<Cue[]> {
  const cues: Cue[] = [];
  for (const [i, chunk] of chunks.entries()) {
    if (chunks.length > 1) console.error(`> ${endpoint}: chunk ${i + 1}/${chunks.length}`);
    for (const cue of await speechToText(endpoint, chunk.path, opts, key)) {
      cues.push({ start: cue.start + chunk.offset, end: cue.end + chunk.offset, text: cue.text });
    }
  }
  return normalizeCues(cues);
}

// ---------------------------------------------------------------- chat

/** One JSON-mode chat completion, parsed. Shared by the review and translate passes. */
async function chatJson<T>(
  system: string,
  user: string,
  label: string,
  opts: Options,
  key: string,
): Promise<T> {
  const response = await request(
    `${PROVIDERS[opts.provider].baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.chatModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    },
    label,
    key,
  );

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) fail(`${label} response had no content`);

  try {
    return JSON.parse(content) as T;
  } catch {
    return fail(`${label} response was not JSON: ${content.slice(0, 300)}`);
  }
}

/** Splits cues into batches, each paired with the cues immediately preceding it. */
function batched(cues: Cue[]): Array<{ batch: Cue[]; context: Cue[]; start: number }> {
  const groups: Array<{ batch: Cue[]; context: Cue[]; start: number }> = [];
  for (let i = 0; i < cues.length; i += BATCH_SIZE) {
    groups.push({
      batch: cues.slice(i, i + BATCH_SIZE),
      context: cues.slice(Math.max(0, i - CONTEXT_CUES), i),
      start: i,
    });
  }
  return groups;
}

// ---------------------------------------------------------------- review

interface Term {
  heard: string;
  correct: string;
}

const GLOSSARY_SYSTEM = `You audit an automatic speech-to-text transcript for garbled proper nouns.

The transcript is of a software/technology talk. Speech recognition reliably mangles English product names, tool names, library names, company names and personal names when they appear inside speech in another language — for example "Cloud co day" is really "Claude Code", "w S kju el" is really "SQL".

Find those. For each, report the exact garbled spelling as it appears in the transcript and the correct spelling.

Rules:
- Only report proper nouns, product/tool/library names, and technical jargon. Never report ordinary words, grammar, or style.
- Only report a term when the correct spelling is genuinely recoverable from context. If unsure, leave it out.
- Report each distinct garbled spelling once.
- Never let a term absorb neighbouring words of the surrounding language. The garbled span must cover the name and nothing else. If the transcript reads "Laude co D i o transkrypcji", the name is "Laude co D" -> "Claude Code"; the trailing "i o" is ordinary speech and must stay outside the term.
- Never invent extra words that make the name look more technical. Correct to the plain product name only — do not append suffixes, versions, or acronyms that you inferred rather than heard.
- Reply with JSON only: {"terms": [{"heard": "...", "correct": "..."}]} and nothing else. An empty list is a valid answer.`;

/**
 * Asks the model which proper nouns the transcriber mangled, so the review pass
 * corrects them consistently everywhere instead of guessing cue by cue.
 */
async function buildGlossary(cues: Cue[], opts: Options, key: string): Promise<Term[]> {
  const full = cues.map((c) => c.text).join(" ");
  // A long transcript repeats its vocabulary, so a prefix is enough to spot the terms.
  const sample = full.length > GLOSSARY_SAMPLE ? `${full.slice(0, GLOSSARY_SAMPLE)}…` : full;
  const known =
    opts.glossary.length > 0
      ? `These terms are known to appear and are spelled correctly here — treat them as the target spellings:\n${opts.glossary.join(", ")}\n\n`
      : "";

  const data = await chatJson<{ terms?: Term[] }>(
    GLOSSARY_SYSTEM,
    `${known}Transcript:\n${sample}`,
    "glossary",
    opts,
    key,
  );

  const terms = (data.terms ?? []).filter(
    (t) => t && typeof t.heard === "string" && typeof t.correct === "string" && t.heard.trim() && t.heard !== t.correct,
  );
  return terms.map((t) => ({ heard: t.heard.trim(), correct: t.correct.trim() }));
}

const REVIEW_SYSTEM = `You are proofreading subtitle cues produced by automatic speech recognition.

Fix only recognition errors:
- Garbled proper nouns, product names, tool names, library names, personal names.
- Technical jargon and code identifiers heard as ordinary words.
- Obvious mishearings that make a sentence nonsensical.
- Sentence casing and punctuation where the transcriber clearly got it wrong.

Never do any of the following:
- Never translate. Keep every cue in its original language.
- Never rephrase, shorten, expand, summarise, or improve the wording of correct text.
- Never merge, split, drop, add or reorder cues.
- Never "fix" speech that is simply informal, repetitive, or a false start — spoken language stays as spoken.

Return EXACTLY one entry per input cue, in the same order. Return a cue unchanged if it has no recognition error.
Reply with JSON only: {"cues": ["...", "..."]} and nothing else.`;

/**
 * Second pass over ASR output: repairs mangled names and mishearings while
 * leaving timings, cue count and wording otherwise untouched.
 */
async function reviewCues(
  cues: Cue[],
  languageLabel: string,
  terms: Term[],
  opts: Options,
  key: string,
): Promise<Cue[]> {
  // The user's --glossary terms are authoritative: they must be enforced even when
  // the glossary step found no garbled spelling to pair them with.
  const requiredBlock =
    opts.glossary.length > 0
      ? `These names MUST be spelled exactly like this wherever they occur, including where the transcriber ran them together or split them apart:\n${opts.glossary.join("\n")}\n\n`
      : "";
  const glossaryBlock =
    terms.length > 0
      ? `Apply this glossary wherever the garbled spelling appears. The transcriber spells inconsistently, so allow for near variants — but replace ONLY the name itself, never the words around it, and never delete surrounding speech to make a replacement fit:\n${terms
          .map((t) => `"${t.heard}" -> "${t.correct}"`)
          .join("\n")}\n\n`
      : "";

  const out: Cue[] = [];
  let changed = 0;

  for (const { batch, context, start } of batched(cues)) {
    console.error(`> reviewing cues ${start + 1}-${start + batch.length} of ${cues.length}`);
    const contextBlock =
      context.length > 0
        ? `Preceding cues, for context only — do NOT return these:\n${context.map((c) => c.text).join("\n")}\n\n`
        : "";

    const data = await chatJson<{ cues?: unknown }>(
      REVIEW_SYSTEM,
      `${requiredBlock}${glossaryBlock}${contextBlock}Language: ${languageLabel}. Proofread these ${batch.length} cues:\n${batch
        .map((c, i) => `${i + 1}. ${c.text}`)
        .join("\n")}`,
      "review",
      opts,
      key,
    );

    const fixed = data.cues;
    if (!Array.isArray(fixed) || fixed.length !== batch.length) {
      // A count mismatch means the model merged or dropped cues; the originals are
      // still usable, so keep them rather than corrupting the subtitle timing.
      console.error(
        `> review returned ${Array.isArray(fixed) ? fixed.length : "no"} cues for ${batch.length} — keeping this batch unreviewed`,
      );
      out.push(...batch);
      continue;
    }

    batch.forEach((cue, i) => {
      const text = String(fixed[i]).trim() || cue.text;
      if (text !== cue.text) {
        changed++;
        if (VERBOSE) console.error(`  - ${cue.text}\n  + ${text}`);
      }
      out.push({ ...cue, text });
    });
  }

  console.error(
    `> review: ${changed} of ${cues.length} cues corrected` +
      (changed > 0 && !VERBOSE ? " (PS_TRANSCRIPT_VERBOSE=1 to see each change)" : ""),
  );
  return out;
}

// ---------------------------------------------------------------- llm translation

const TRANSLATE_SYSTEM = `You translate subtitle cues into natural, fluent English.

Rules:
- Translate each numbered cue independently but keep the meaning continuous across cues.
- Return EXACTLY one translation per input cue, in the same order. Never merge, split, drop, or add cues.
- Keep it subtitle-length: concise spoken English, no added commentary or explanation.
- Preserve proper nouns, product names, code identifiers and numbers verbatim.
- If a cue is a filler sound or untranslatable, return the closest short English equivalent rather than an empty string.
- Reply with JSON only: {"translations": ["...", "..."]} and nothing else.`;

async function translateBatch(
  batch: Cue[],
  context: Cue[],
  terms: Term[],
  opts: Options,
  key: string,
): Promise<string[]> {
  // User-supplied terms first: they are authoritative target spellings.
  const spellings = [...new Set([...opts.glossary, ...terms.map((t) => t.correct)])];
  const glossaryBlock =
    spellings.length > 0
      ? `Use these exact spellings for names and technical terms:\n${spellings.join(", ")}\n\n`
      : "";
  const contextBlock =
    context.length > 0
      ? `Preceding cues, for context only — do NOT translate these:\n${context.map((c) => c.text).join("\n")}\n\n`
      : "";

  const data = await chatJson<{ translations?: unknown }>(
    TRANSLATE_SYSTEM,
    `${glossaryBlock}${contextBlock}Translate these ${batch.length} cues to English:\n${batch
      .map((c, i) => `${i + 1}. ${c.text}`)
      .join("\n")}`,
    "translate",
    opts,
    key,
  );

  const translations = data.translations;
  if (!Array.isArray(translations) || translations.length !== batch.length) {
    fail(
      `translator returned ${Array.isArray(translations) ? translations.length : "no"} lines for ${batch.length} cues`,
    );
  }
  return translations.map((t) => String(t).trim());
}

/** Translates cues in batches, keeping the source timings so both SRTs stay aligned. */
async function translateCues(
  cues: Cue[],
  terms: Term[],
  opts: Options,
  key: string,
): Promise<Cue[]> {
  const out: Cue[] = [];
  for (const { batch, context, start } of batched(cues)) {
    console.error(`> translating cues ${start + 1}-${start + batch.length} of ${cues.length}`);
    const texts = await translateBatch(batch, context, terms, opts, key);
    batch.forEach((cue, i) => out.push({ ...cue, text: texts[i] || cue.text }));
  }
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const stem = basename(opts.input, extname(opts.input));

  const wantTranscript = opts.mode !== "translate";
  const wantTranslation = opts.mode !== "transcribe";
  const transcriptPath = join(opts.outDir, `${stem}.${opts.lang}.srt`);
  const translationPath = join(opts.outDir, `${stem}.en.srt`);

  const outputs = [
    ...(wantTranscript ? [transcriptPath] : []),
    ...(wantTranslation ? [translationPath] : []),
  ];
  for (const path of outputs) {
    if (existsSync(path) && !opts.force) fail(`${path} already exists — pass --force to overwrite`);
  }

  const key = opts.dryRun ? "dry-run" : await resolveKey(opts.provider);
  mkdirSync(opts.outDir, { recursive: true });
  const workDir = mkdtempSync(join(tmpdir(), "ps-transcript-"));

  try {
    const audio = await prepareAudio(opts.input, workDir);
    const size = statSync(audio).size;
    const duration = await probeDuration(audio);

    let chunks: Chunk[];
    if (size > SAFE_LIMIT) {
      console.error(`> ${mb(size)} over the 25 MB cap — splitting into ${opts.chunkSeconds}s chunks`);
      chunks = await splitAudio(audio, workDir, opts.chunkSeconds);
      console.error(`> ${chunks.length} chunks`);
    } else {
      chunks = [{ path: audio, offset: 0 }];
    }

    if (opts.dryRun) {
      console.log(
        [
          `input        ${opts.input}`,
          `duration     ${duration.toFixed(1)}s`,
          `upload       ${mb(size)} in ${chunks.length} request(s)`,
          `provider     ${opts.provider}`,
          `stt model    ${opts.model}`,
          `review       ${opts.review ? `on (${opts.chatModel})` : "off"}`,
          `translation  ${wantTranslation ? `${opts.translateMode}${opts.translateMode === "llm" ? ` (${opts.chatModel})` : ""}` : "skipped"}`,
          `outputs      ${outputs.join(", ")}`,
        ].join("\n"),
      );
      return;
    }

    // The llm translation path reuses the transcript, so it is produced whenever
    // it is needed as a source even if the user only asked for English.
    const needSourceCues = wantTranscript || opts.translateMode === "llm";
    let sourceCues: Cue[] = [];
    let terms: Term[] = [];

    if (needSourceCues) {
      sourceCues = await cuesFromChunks("transcriptions", chunks, opts, key);
      if (sourceCues.length === 0) fail("transcription returned no speech");

      if (opts.review) {
        terms = await buildGlossary(sourceCues, opts, key);
        if (terms.length > 0) {
          console.error(
            `> glossary: ${terms.map((t) => `"${t.heard}" -> "${t.correct}"`).join(", ")}`,
          );
        }
        sourceCues = await reviewCues(sourceCues, opts.lang, terms, opts, key);
      }
    }

    if (wantTranscript) {
      writeFileSync(transcriptPath, renderSrt(sourceCues), "utf8");
      console.log(`${transcriptPath}  (${sourceCues.length} cues)`);
    }

    if (wantTranslation) {
      let englishCues: Cue[];
      if (opts.translateMode === "llm") {
        // The source cues are already reviewed, and the translator gets the same
        // glossary, so the English needs no separate review pass.
        englishCues = await translateCues(sourceCues, terms, opts, key);
      } else {
        englishCues = await cuesFromChunks("translations", chunks, opts, key);
        if (opts.review && englishCues.length > 0) {
          englishCues = await reviewCues(englishCues, "English", terms, opts, key);
        }
      }
      if (englishCues.length === 0) fail("translation returned no cues");
      writeFileSync(translationPath, renderSrt(englishCues), "utf8");
      console.log(`${translationPath}  (${englishCues.length} cues)`);
    }
  } finally {
    if (opts.keepTemp) console.error(`> temp kept at ${workDir}`);
    else rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
