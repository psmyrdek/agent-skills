---
name: ps-to-lead
description: "Convert a URL into a short Polish newsletter lead (tytuł + 3-4 zdania) in Przemek's established style. Invoke when the user runs /ps-to-lead, or asks to turn a link/article into a newsletter lead, lead do newslettera, krótki wstęp do linku, or newsletter blurb. Excludes: full article writing, translations, social media posts, and English-language copy."
allowed-tools: WebFetch, Read, WebSearch
---

# /ps-to-lead — URL → newsletter lead

Turns any URL into **one** short Polish newsletter lead matching the reference style below.

## Input

The user passes a URL (sometimes with an extra hint about the angle they want). If no URL is present, ask for one — do not invent content.

## Step 1: Fetch

Use `WebFetch` on the URL with a prompt like:
> Extract the full substance of this article: what was built/measured/announced, by whom, the concrete architecture or method, all hard numbers and results, and any claim that contradicts conventional wisdom.

If the fetch fails (paywall, JS-only page, 403):
1. Try `WebSearch` for the title/topic to recover the substance from coverage elsewhere.
2. If that also fails, tell the user plainly and ask them to paste the content. **Never fabricate details or numbers.**

## Step 2: Analyse methodically

Work through these four in order, and **show this analysis to the user** before the final lead (it's the part they iterate on):

**A. Kluczowy punkt (1 sentence)** — what the piece is actually about, stripped of framing.

**B. Trzy haki (3 bullets)** — three candidate angles, each a genuinely interesting/surprising element: a counterintuitive result, a specific architectural choice, a striking number, a reversal of expectations. Rank them.

**C. Outcome** — the hard result: numbers, percentages, throughput, cost delta, benchmark scores. Quote them exactly as the source states them. If there are no numbers, say so — the lead will lean harder on the mechanism instead.

**D. Wybór** — which hook wins and why (one line).

## Step 3: Write the lead

Format, exactly:

```
Tytuł leada - Pierwsze zdanie ramujące. Drugie zdanie z mechaniką. Trzecie zdanie z liczbami. Zdanie-puenta.
```

### Structure rules

**Tytuł**
- Short noun phrase, 3–7 words. No ending punctuation.
- Two proven patterns:
  - appositive — `Real-SWE, benchmark bliżej codzienności IT`
  - actor + action — `Devin wypuszcza własny harness na frontier AI`, `Raport Cursora o fabrykach software'u`
- Separated from the body by a spaced hyphen: ` - `.

**Treść: 3–4 zdania, 50–75 słów.** One paragraph. The arc:
1. **Rama / napięcie** — what the field assumes, or what the actor is attempting. Often sets up the twist by stating the conventional belief first ("Większość benchmarków sugeruje, że…", "Cursor eksperymentuje z czymś, co jeszcze niedawno brzmiało jak science fiction").
2. **Mechanika** — how it concretely works: who built it, on what, with what architecture. Be specific (prywatne, produkcyjne codebase'y; planner/worker split; lider + sidekick).
3. **Liczby** — at least one hard number, always. Hedge magnitudes with `około` / `nawet o` when the source does.
4. **Puenta** — the non-obvious takeaway. Flag it when it lands well: `Wynik?`, `Co ciekawe, przełomem nie było…`.

Sentences 3 and 4 may merge when the number *is* the punchline (`Wynik? Wszyscy agenci poniżej 40%!`).

### Voice rules

- **Polish**, professional-conversational, **present tense**, **active voice**.
- **Organization is the subject**: "Specific Labs zbudowało…", "Cursor eksperymentuje…", "Cognition Labs…". Never "autorzy artykułu" or "w artykule czytamy".
- **No first person**, no "my", no CTA, no "kliknij/sprawdź/przeczytaj", no emoji, no hashtags, no link text.
- **Reader address only in sentence 1.** A direct second-person question is allowed as the framing sentence when it names the reader's actual problem: "Korzystasz z techniki LLM-as-a-Judge, ale nie wiesz, na ile zaufać wynikom?". Never in sentences 2-4, and never as a CTA. If sentence 1 is a question, the puenta must be declarative - two question marks in one lead break the rhythm.
- **Hedge unverified claims**: `zdaje się`, `potrafi`, `około`, `nawet o`, `w benchmarkach`.
- **Keep English tech terms**, inflected Polish-style with an apostrophe: `codebase'ach`, `software'u`, `harness`, `worker`, `planner`, `frontier`. Don't translate them into clumsy Polish.
- **Zero hype**: no "rewolucja", "przełom", "game changer", "niesamowite" — unless explicitly negating them ("przełomem nie było stworzenie jednego superagenta, lecz…").
- Use typographic apostrophes (`'`) and Polish quotation marks (`„…"`) as in the references.

### Anti-slop rules (z `no-ai-slop`)

A lead is short copy, so these are hard constraints, not preferences:

- **Zero em dashes.** In short copy use none. Commas, periods, or a colon before a list do the job.
- **No binary contrasts.** "To nie X, to Y", "Pytanie nie brzmi X, lecz Y", "Nie tylko X, ale Y". State Y directly.
- **No faux-insight setups.** "Czego większość nie zauważa", "O czym nikt nie mówi", "Tego wszyscy nie doceniają". Cut the setup, let the claim stand alone.
- **No colon reveals.** A noun phrase, colon, then a dramatic lowercase reveal ("Szczegół, który decyduje: osobny agent ocenia wynik"). Write it as a plain sentence. Colons are fine for lists and enumerations, as in the reference leads.
- **No importance puffery.** "Kamień milowy", "przełomowy moment", "umacnia pozycję", "odgrywa kluczową rolę". State the fact and let the number speak.
- **No superficial `-ing` analysis.** Polish equivalents: "pokazując tym samym…", "podkreślając zaangażowanie…", "co odzwierciedla trend…". Replace with the concrete consequence.
- **No weasel attribution.** "Eksperci twierdzą", "badania pokazują", "wiele źródeł sugeruje". Name the organization or cut the claim. Never invent a source.
- **No fake-profound kicker.** The puenta is a concrete takeaway, never an aphorism or metaphorical mic-drop. If the ending feels cute, end on the hardest fact instead.
- **No synonym cycling.** If `agent` is the right word, repeat it. Don't rotate to "asystent", "narzędzie", "system" for variety.
- **No dramatic fragmentation.** "I to wszystko." / "Tyle." / stacked one-word sentences.
- **Verbs do the work.** "podjął decyzję" → "zdecydował", "ma możliwość" → "potrafi", "służy jako" → "jest".
- **Protect the specific fact.** Never smooth a number into generic significance: "znacząco poprawia trafność" → "podnosi trafność z 0,82 do 0,91".
- **Banned words** (and their Polish cousins): rewolucja, przełom, game changer, kamień milowy, transformacja, potęga, wykorzystać potencjał, wzmocnić, usprawnić, solidny, wielowymiarowy, w dzisiejszym świecie, w erze AI, warto zauważyć, na koniec dnia, jeśli chodzi o.
- **Empty adverbs** to cut unless they carry real emphasis: dosłownie, po prostu, naprawdę, zasadniczo, co ważne, nieuchronnie.

**One sanctioned exception:** the `Wynik?` / `Co ciekawe,` puenta marker. `no-ai-slop` treats self-answered question pairs as a rhetorical setup, but it is an established part of this newsletter's voice (see the reference leads). Use it at most once per lead, and only when the number *is* the punchline.

### The reader-knowledge rule

Write for a reader with **solid general knowledge, not expertise in the source's niche**. They follow AI/dev news, they don't read the papers.

- **Sentence 1 must be understandable without the article.** No term whose meaning is the thing the article explains. Wrong: "Ewaluacja LLM-as-a-judge zakłada, że każdy sędzia myli się niezależnie." Right: "Korzystasz z techniki LLM-as-a-Judge, ale nie wiesz, na ile zaufać wynikom?"
- **Name the technique, don't presuppose its internals.** The reader may know *that* LLM-as-a-Judge exists; they do not know what the field assumes about error independence. That assumption is the payload, so state it plainly in sentence 2 instead of leaning on it in sentence 1.
- **Jargon budget: technical terms land in sentences 2-3**, after the frame has bought the reader in. Sentence 1 carries at most one, and only a term they would recognize from a newsletter headline.
- **Method names are not explanations.** "model Isinga", "expectation-maximization", "Ising-based aggregation" mean nothing to this reader. Describe what the method *does* ("uczy się, którzy sędziowie mylą się razem") and drop the label, unless the label itself is the hook.
- **The test:** would someone who has heard of the topic but never used it get the first sentence on one read? If not, rewrite it.

### The selection rule

A lead is **not a summary**. Pick the single most surprising delta between what the reader already believes and what the source shows, then organise all four sentences around it. Everything that doesn't serve that delta gets cut.

## Step 4: Output

Print the analysis (A–D) compactly, then the finished lead in a copyable block. **One lead only** — the user iterates from there.

---

## Reference leads (style ground truth)

> **Real-SWE, benchmark bliżej codzienności IT** - Większość benchmarków programistycznych sugeruje, że modele coraz szybciej zbliżają się do poziomu samodzielnego software engineera. Real-SWE pokazuje jednak znacznie bardziej realistyczny obraz postępu. Specific Labs zbudowało benchmark na prywatnych, produkcyjnych codebase'ach prawdziwych firm, gdzie zadania wymagają rozumienia biznesu, architektury, infrastruktury i wzorców enterprise. Wynik? Wszyscy agenci poniżej 40%!

> **Raport Cursora o fabrykach software'u** - Cursor eksperymentuje z czymś, co jeszcze niedawno brzmiało jak science fiction: codebase'em rozwijanym niemal bez udziału człowieka. Ich system uruchamia setki agentów równolegle, osiągając w szczycie około 1000 commitów na godzinę i działając przez tydzień bez ręcznej interwencji zespołu. Co ciekawe, przełomem nie było stworzenie jednego „superagenta", lecz odpowiednie rozdzielenie ról pomiędzy plannerów i workerów.

> **Devin wypuszcza własny harness na frontier AI** - Nowy harness Fusion od Cognition Labs zdaje się panować nad Astrą i Fable. Uruchamia on równolegle dwóch agentów: droższy model frontier pełni rolę lidera odpowiedzialnego za planowanie i review, a tańszy „sidekick" eksploruje kod, implementuje zmiany i uruchamia testy. W benchmarkach takie połączenie potrafi obniżyć koszt wykonania zadania nawet o około 40%, przy zachowaniu zbliżonej jakości do pracy samego modelu frontier.
