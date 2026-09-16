---
name: ps-translate
description: "Translate text between Polish and English, preserving the author's register, structure and formatting. Direction is detected from the input: Polish in, English out; English in, Polish out. Invoke when the user runs /ps-translate, pastes text asking for the other language, or says przetłumacz, przetłumacz na angielski, przetłumacz na polski, translate this, English version, po angielsku, po polsku. Any other source language translates to English unless the user asks for Polish. Excludes: third languages as a target, rewriting or summarising, code translation between programming languages, and localisation of UI strings with placeholders the user has not explained."
allowed-tools: Read, Bash
---

# /ps-translate — Polish ⇄ English translation

Returns **one** translation of the text the user gives you, in the other language. A translation, not an edit: same claims, same structure, same voice.

## Input

Accept the text from whichever of these the user used:

- text after the command or pasted into the message — the common case
- a file path — `Read` it and translate the whole file
- text quoted from earlier in the conversation ("przetłumacz to, co napisałem")

If the message carries no text and no path, ask for it. Never invent source material.

## Direction

Detect it from the input, do not ask:

| Input | Target |
|---|---|
| Polish | English |
| English | Polish |
| Any other language | English |

An explicit instruction always wins — "na polski", "to English", "po angielsku" — including when it contradicts the default (English source, user asks for English back: say it is already English and stop).

**Mixed-language input** takes its direction from the language of the running prose, not from the embedded terms. A Polish paragraph full of English tech terms is Polish, and goes to English. State the detected direction in one short line before the translation (`PL → EN`) only when the input is mixed or genuinely ambiguous; otherwise let the output speak.

## Translate

Work sentence by sentence through the whole input, then read the result once as a standalone text in the target language and fix what reads as translated.

**Fidelity** (both directions)
- Every claim, number, name, date and unit survives exactly. Never round, convert or drop a figure. Never add a fact the source does not state.
- Do not summarise, expand, reorder or "clean up" the argument. A clumsy source stays clumsy in the target language.
- Translate the whole input, including headings, list items, captions, footnotes and text inside tables.
- If a passage is genuinely ambiguous, pick the reading the surrounding context supports and note it below the translation. Do not silently choose.

**Register** (both directions)
- Mirror the source's register: formal stays formal, casual stays casual, blunt stays blunt.
- Preserve emphasis, irony and hedging (`zdaje się` ⇄ `seems to`, `około` ⇄ `roughly`). Dropping a hedge changes the claim.
- Keep the source's person and tense where the target language allows it.
- Polish has a T–V distinction English lacks. Going **PL → EN**, `Pan/Pani` and `ty` both become plain English `you`; carry the formality in word choice instead. Going **EN → PL**, pick the form from the source's register and **use it consistently**: marketing and documentation addressed to a reader take `ty`, correspondence and legal or institutional text take `Pan/Pani`. Never switch mid-text.

**Into English**
- Impersonal Polish forms (`zrobiono`, `należy`, `warto`) become the nearest natural English construction — usually passive or imperative — not a first-person rewrite.
- Technical terms that are English loanwords in the source go back to their plain English form: `codebase'ach` → `codebases`, `wdrożenie` → `deployment`, `zbiór danych` → `dataset`.
- Polish sentences run longer than English ones. Keep the sentence boundaries of the source; only split a sentence when the English is otherwise ungrammatical, never for style.

**Into Polish**
- Use the Polish word whenever a natural one exists: `deployment` → `wdrożenie`, `dataset` → `zbiór danych`, `latency` → `opóźnienie`, `throughput` → `przepustowość`, `distillation` → `destylacja`.
- Keep the English term only where Polish has no natural equivalent, and inflect it Polish-style with an apostrophe: `codebase'ach`, `software'u`, `harness`, `worker`, `planner`.
- Use Polish quotation marks (`„…"`), decimal commas, and Polish number formatting in running prose.
- Watch the false friends: `eventually` ≠ `ewentualnie` (→ `ostatecznie`), `actually` ≠ `aktualnie` (→ `właściwie`), `sympathetic` ≠ `sympatyczny` (→ `współczujący`), `pathetic` ≠ `patetyczny` (→ `żałosny`).
- Polish word order carries emphasis that English marks with stress or cleft sentences. Put the emphasised element where Polish wants it rather than tracking the English order word for word.

**Terminology** (both directions)
- Proper nouns, product names, company names and handles stay verbatim.
- Keep one target term per source term throughout. No synonym cycling for variety.
- Job titles, institutions and legal terms with no clean equivalent: translate literally, then put the original in brackets on first use — `Krajowa Izba Odwoławcza (National Appeals Chamber)`, `Companies House (brytyjski rejestr spółek)`.

**Formatting** (both directions)
- Markdown structure is preserved exactly: heading levels, list markers, numbering, bold/italic spans, blockquotes, table shape.
- Code blocks, inline code, URLs, file paths, placeholders (`{name}`, `%s`) and variable names are copied byte for byte. Translate comments and user-facing strings inside a code block only if the user asks.
- Convert quotation marks and decimal separators to the target language's convention in running prose, never inside code.
- Keep the source's paragraph breaks and line breaks.

## Output

Print the translation in one copyable block, and nothing else before it — no preamble, no "Here is the translation".

After the block, add notes **only if** there is something the user genuinely needs to decide:

- **Ambiguity** — the passage, the reading you chose, the alternative.
- **Untranslatable** — a pun, idiom or culture-bound reference, with what you did instead.
- **Register choice** — going EN → PL, the `ty` / `Pan/Pani` form you picked, when the source gave no clear signal.
- **Suspected source error** — an inconsistent number or broken sentence, quoted, left as-is in the translation.

No notes section when there is nothing to report. Never comment on the quality of the source.

For a translated file, write the result to a sibling file with a target-language suffix before the extension (`notes.md` → `notes.en.md`, `notes.pl.md`) and print the path, unless the user asked for it in the conversation only.

## Copy to clipboard (macOS)

After printing the translation, put it on the clipboard with `pbcopy`. Pipe it through a quoted heredoc so nothing in the text is expanded by the shell:

```bash
cat <<'PS_TRANSLATION_EOF' | pbcopy
<the translation, exactly as printed>
PS_TRANSLATION_EOF
```

Rules:

- **The translation only.** Never the notes section, the direction line, the file path, or any preamble.
- Keep the delimiter quoted (`<<'PS_TRANSLATION_EOF'`). Unquoted, the shell would eat `$`, backticks and backslashes in the text.
- If a line of the translation is exactly the delimiter, pick another one.
- Confirm in one short line: `Copied to clipboard.`
- Not on macOS, or `pbcopy` missing: skip the copy silently and say so in the same one line. Never fail the translation over the clipboard step.
