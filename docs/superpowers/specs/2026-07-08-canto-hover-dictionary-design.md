# Canto hover dictionary — design

**Date:** 2026-07-08
**Component:** new top-level `hover-dictionary/` (shared), consumed by all three modalities
**Status:** approved design, pre-implementation

## Summary

A Zhongwen-style **hover popup dictionary**, built once as a **shared component** and reused by
each modality "in its own pop-up way." Hovering a character/word in a displayed Chinese cue pops
a box with the word's **English definition**, its **reading**, and **tone colors** — with a live
toggle between **Cantonese jyutping** (default) and **Mandarin pinyin**. 100% client-side
(console / bookmarklet, no browser extension).

It is an amalgam of the user's two current extensions — the **hover-def popup** of *Zhongwen* and
the **jyutping** of *Inject Jyutping* — minus always-on ruby (out of scope).

The dictionary **data** and the reusable **engine** live in a new top-level folder
`hover-dictionary/` (a peer of `no-subtitles/`, `youtube-w-subtitles/`, `webplayer-w-captions/`).
Each modality wires the engine to its own Chinese-cue element.

## Goals / non-goals

**Goals**
- Reusable engine: hover any word in a Chinese cue → popup (word, reading, English defs, tone colors).
- Toggle jyutping ⇄ pinyin (persisted), affecting the popup reading.
- Full-coverage dictionary (standard + HK-colloquial), fetched once and cached client-side.
- One data build + one engine, consumed by all three modalities through a tiny, uniform interface.
- Reproducible from source data; the repo working tree stays clean (no dict data committed).

**Non-goals (YAGNI)**
- No always-on ruby over the cue (user chose hover-only).
- No sentence translation (the overlays already do that).
- No word-lists / anki-export / editing (Zhongwen extras) — just look-up.
- No POS/context segmentation — greedy longest-match, exactly like Zhongwen.

## Architecture

Two shared artifacts + three thin integrations, decoupled by one interface (the **cue-line contract**).

```
hover-dictionary/            # shared, new top-level folder
  build_dict.py              # offline: merge 3 CC-BY-SA sources -> canto-dict.min.json -> GCS
  dict-core.js              # reusable ES-module engine (load/cache · segment · popup · toggle · tones)
  dict-core.test.js        # Node tests for the pure logic
  ATTRIBUTION.md            # CC-BY-SA credits
  README.md                # build/publish + how each modality attaches

data  ->  public GCS object (canto-dict.min.json)          # the dictionary itself
code  ->  dict-core.js served via jsDelivr (repo) for bookmarklet import(); imported locally for tests
```

**Data flow:** `build_dict.py` (offline) → `canto-dict.min.json` on GCS. At runtime a modality
loads `dict-core.js`, which fetches the JSON once (then IndexedDB cache) and attaches hover
popups to the Chinese-cue element the modality passes it.

## Data pipeline — `build_dict.py` (offline, run once / on refresh)

Merges **three** CC-BY-SA sources. (The Cantonese *readings* file carries **no** glosses —
verified — so CC-CEDICT is required for English definitions.)

| Source | Gives | Fetched at build time from |
|---|---|---|
| **CC-CEDICT** `cedict_ts.u8` | English defs + Mandarin pinyin (~120k) | `https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz` |
| **cccedict-canto-readings.txt** | jyutping for those entries (readings only) | `raw.githubusercontent.com/amadeusine/cc-canto-data/a687e469f6d5ee6873283ad3ec6fc1b35f518465/cccedict-canto-readings.txt` |
| **cccanto-webdist.txt** | ~25k HK-**colloquial** entries *with* defs + jyutping | same repo/commit, `cccanto-webdist.txt` |

**Line formats** (space/`[]`/`{}`/`/` delimited — parsed with string ops, **no regex**, like `overlay.js`):
- CC-CEDICT: `繁 简 [pin1 yin1] /def1/def2/`
- readings:  `繁 简 [pin1 yin1] {jyut1 ping4}`   ← no defs
- cccanto:   `繁 简 [pin1 yin1] {jyut1 ping4} /def1/def2/`

**Merge**
1. Parse CC-CEDICT → `{trad, simp, pinyin, defs[]}`.
2. Key by `(trad, simp, normPinyin)` — `normPinyin` = pinyin lowercased, spaces removed (the
   readings file stores both `[fa1 bu4]` and `[fa1bu4]`).
3. Attach jyutping from the readings file on matching key.
4. Add cccanto entries (own defs + jyutping); flag `colloquial:true`.
5. Index `headword → [entry,…]`, keyed by **both** traditional and simplified headword (cues are
   traditional HK; index both so either resolves). Array handles homographs (行 hang4 / hong4).

**Output** `canto-dict.min.json` (sorted keys → deterministic):
```json
{ "version":"2026-07-08", "_license":"CC-BY-SA 3.0 — CC-CEDICT + CC-Canto (Pleco); see ATTRIBUTION.md",
  "entries": { "喜歡":[{"t":"喜歡","s":"喜欢","py":"xi3 huan5","jy":"hei2 fun1","d":["to like","to be fond of"]}] } }
```
≈12 MB minified, **~4 MB gzipped**. Script gzips it and prints the GCS publish commands.

## Hosting

**Data — public GCS object (CORS-enabled), separate from the private film bucket.**
- `gs://wz-canto-dict/canto-dict.min.json` → `https://storage.googleapis.com/wz-canto-dict/canto-dict.min.json`
- One-time setup (emitted by `build_dict.py`):
  - `gcloud storage buckets create gs://wz-canto-dict --location=us --uniform-bucket-level-access`
  - CORS `cors.json` = `[{"origin":["*"],"method":["GET"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]`; `gcloud storage buckets update gs://wz-canto-dict --cors-file=cors.json`
  - public read: `gcloud storage buckets add-iam-policy-binding gs://wz-canto-dict --member=allUsers --role=roles/storage.objectViewer`
  - upload: `gcloud storage cp canto-dict.min.json.gz gs://wz-canto-dict/canto-dict.min.json --content-encoding=gzip --content-type=application/json --cache-control="public,max-age=86400"`
- Public, CC-BY-SA data — no auth, safe to expose. The URL is a default `const` in `dict-core.js`.

**Code — `dict-core.js` via jsDelivr (repo, CORS-open)** so each modality's bookmarklet can
`import()` it: `https://cdn.jsdelivr.net/gh/WandLZhang/video-subtitles@<tag>/hover-dictionary/dict-core.js`
(pin a tag/commit for reproducibility). Node tests import the local file directly. Fallback if a
site's CSP blocks dynamic `import()`: paste `dict-core.js` inline, then the attach snippet.

## Shared engine — `dict-core.js`

An ES module; pure helpers are also exported for Node tests (guarded like `overlay.js`). No deps.

**Public API**
- `init({ url = DICT_URL } = {})` → `Promise` — fetch (once) or load from IndexedDB, build the `Map`.
- `attach(target, opts?)` → `detach()` — `target` = selector or `Element` holding the current
  Chinese cue; wires the hover popup and observes cue changes. Returns a detach handle.
- `setReading('jyut' | 'pinyin')` — persisted in `localStorage`; re-renders any open popup.
- `lookup(word)` → `entries | null` — exposed for reuse/tests.

**Internals**
1. **Load & cache.** IndexedDB `canto-dict`; if the stored blob's `version` matches, use it, else
   `fetch(url)` → parse → store. First run ≈ one 4 MB fetch; every run after is instant.
2. **Segment.** On the attached element, a `MutationObserver` re-renders the cue as one
   `<span data-i=N>` per character **once per cue** (relies on the cue-line contract below). On
   `mouseover` span *i*: **forward-maximal-match** `for n = min(MAX_WORD, len−i) … 1`, first
   `cue[i:i+n]` in the `Map` wins; highlight those `n` chars.
3. **Popup.** Dark box by the cursor: matched word (HK font, large); per entry the **reading**
   (jyutping default; pinyin when toggled), tone-colored syllable-by-syllable, then English defs.
   Homographs listed. Hides on `mouseout` (grace delay).
4. **Toggle.** Key `r` flips jyut ⇄ pinyin (localStorage), re-renders.
5. **Tone colors.** Syllables split on spaces; tone = trailing digit. Palette (6-tone,
   Zhongwen-like): `1`=#c00 `2`=#e67e00 `3`=#0a0 `4`=#00c `5`=#8a2be2 `6`=#666 none=#999. Pinyin
   uses 1–5, jyutping 1–6.

**Config consts:** `DICT_URL`, `CACHE_DB='canto-dict'`, `MAX_WORD=8`.

## The cue-line contract (what each modality must expose)

`attach()` needs one thing: **an element whose `textContent` is the current Chinese cue, updated
only when the cue changes.** So each modality:
- renders its Chinese cue into a stably-identified element, and
- applies a **write-on-change guard**: track the last cue; skip identical writes. (Overlays today
  set `textContent` every `timeupdate` ~4×/sec, which would wipe the per-char spans and thrash the
  DOM. The guard fixes both.)

## Per-modality integration

Same three-line pattern everywhere: `import dict-core → init() → attach(zhElement)`. Reference
implementation is **webplayer-w-captions** (built first); the others follow identically.

- **webplayer-w-captions** (first). Overlay variants (`overlay.js`, `bookmarklet.js`,
  `bookmarklet-llm.js`) get `id="wp-zh"`/`id="wp-en"` + the write-on-change guard. A small
  `dict.js` bookmarklet: `import(coreUrl).then(m=>m.init()).then(()=>m.attach('#wp-zh'))`.
- **youtube-w-subtitles**. `script.js` renders the source **Chinese** caption line into
  `#yt-cue-zh` with the guard (its "own pop-up way" — hover the Chinese while the translated line
  shows below), then attaches the engine.
- **no-subtitles**. The local `player/` renders the 口語 cue into an id'd element with the guard,
  then attaches the engine — hover-lookup during A/B QA.

## Fonts

Popup CSS `font-family: "Chiron Hei HK","PingFang HK","Noto Sans HK","Microsoft JhengHei",sans-serif`
— correct HK glyph forms, zero download (user chose the system stack).

## Testing

`dict-core.test.js` (Node, no deps — `overlay.test.js` style) over a tiny inline fixture:
- `parseCedictLine` / `parseReadingLine` / `parseCantoLine`
- `normPinyin` + merge (jyutping attaches; colloquial-only added; homographs kept)
- `forwardMaxMatch` (longest hit wins; no-hit → null; end-of-string boundary)
- `toneColor` (digit → color; neutral/none)

Then live on `https://www.hkanime.com/play/銀魂/8x0` with the CantoCaptions srt (webplayer path):
hover 係/唔/佢/嘅 → jyutping + defs, toggle to pinyin, verify HK glyphs.

## Files

**New — `hover-dictionary/`**
- `build_dict.py` — offline merge → `canto-dict.min.json(.gz)` + prints GCS publish commands.
- `dict-core.js` — reusable engine (load/cache · segment · popup · toggle · tones).
- `dict-core.test.js` — Node tests for the pure core.
- `ATTRIBUTION.md` — CC-BY-SA credits (CC-CEDICT; CC-Canto © Pleco Software).
- `README.md` — build/publish, the cue-line contract, how each modality attaches.

**Edited**
- `webplayer-w-captions/`: `overlay.js`, `bookmarklet.js`, `bookmarklet-llm.js` (ids + guard);
  new `dict.js` (attach snippet). *(youtube-w-subtitles + no-subtitles integrations follow, same pattern.)*
- root `README.md` — add the `hover-dictionary/` row/section.

## Build order

1. `hover-dictionary/`: `build_dict.py` → publish JSON to GCS → `dict-core.js` + tests.
2. webplayer-w-captions integration (ids + guard + `dict.js`) → live verify.
3. youtube-w-subtitles + no-subtitles integrations (same `attach()` pattern).

## Risks / notes

- **First-load fetch** ≈ 4 MB gzip, one-time; IndexedDB-cached after. Acceptable.
- **Greedy longest-match** has no context — identical to Zhongwen; acceptable.
- **HK glyphs** depend on an OS HK CJK font; the stack degrades gracefully.
- **CSP**: some sites block dynamic `import()`; fallback is pasting `dict-core.js` inline.
- **License:** the published JSON is a derivative aggregate → carries CC-BY-SA + attribution
  (`_license` field + `ATTRIBUTION.md`). Engine/build code is under the repo's own terms.
- **mdbg** is a *build-time* dependency only; runtime depends solely on the GCS object.
