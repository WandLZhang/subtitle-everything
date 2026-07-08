# Canto hover dictionary — design (simple)

**Date:** 2026-07-08
**Component:** `webplayer-w-captions/` — two new files, no changes to anything else
**Status:** approved design, pre-implementation

## Summary

A Zhongwen-style **hover popup** for the webplayer overlay. After you run the overlay bookmarklet,
you paste `dict.js`; then hovering a Chinese word in the 口語 cue pops a small box with its
**English definition**, **reading**, and **tone colors**, with a `r`-key toggle between
**jyutping** (default) and **pinyin**. Hover-only. Webplayer only.

**Kept deliberately simple:**
- **No overlay changes.** `dict.js` reads the hovered character with `caretRangeFromPoint` on the
  existing overlay text — so nothing about `overlay.js`/`bookmarklet*.js` changes, and it doesn't
  matter that the overlay rewrites its text every tick (there are no spans to clobber).
- **No IndexedDB.** The dict JSON is fetched from a GCS object that sends `Cache-Control` — the
  browser's HTTP cache makes re-runs instant. One `fetch`.
- **No shared folder / no multi-modality wiring.** Both files live in `webplayer-w-captions/`.

## Data — `build_dict.py` (offline, run once)

Merges three CC-BY-SA sources into one JSON. (The Cantonese *readings* file has **no** glosses —
verified — so CC-CEDICT supplies English defs.)

| Source | Gives | From |
|---|---|---|
| **CC-CEDICT** `cedict_ts.u8` | English defs + pinyin (~120k) | `mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz` |
| **cccedict-canto-readings.txt** | jyutping for those entries (readings only) | `amadeusine/cc-canto-data@a687e46` |
| **cccanto-webdist.txt** | ~25k HK-colloquial entries *with* defs + jyutping | same repo/commit |

- Parse with string ops (split on space/`[]`/`{}`/`/`), **no regex** (like `overlay.js`).
- Merge key `(trad, simp, normPinyin)` where `normPinyin` = pinyin lowercased, spaces removed
  (readings file has both `[fa1 bu4]` and `[fa1bu4]`). Attach jyutping; add cccanto colloquial
  entries. Index `headword → [entry,…]` under **both** trad and simp (array = homographs).
- Output `canto-dict.min.json` (sorted keys, deterministic): `{version, _license, entries:{ "喜歡":[{"t","s","py","jy","d":[…]}] }}`. ≈12 MB min, ~4 MB gzip.
- Upload to a public, CORS-enabled GCS object (separate from the film bucket); script prints:
  create bucket · set CORS (`origin:*`, GET) · `allUsers:objectViewer` · `cp … --content-encoding=gzip --content-type=application/json --cache-control="public,max-age=86400"`.
  Default URL `https://storage.googleapis.com/wz-canto-dict/canto-dict.min.json` (a `const` in `dict.js`).

## Runtime — `dict.js` (paste after the overlay bookmarklet)

1. `const dict = await (await fetch(DICT_URL)).json()` → build `Map` (HTTP-cached; instant on re-run).
2. Add a `mousemove` listener on `#wp-overlay`. Per move: `caretRangeFromPoint(x,y)` (fallback
   `caretPositionFromPoint`) → text node + offset. If the char at offset is **CJK**
   (`0x3400–0x9FFF` etc., via char-code test — not regex), run **forward-maximal-match**
   `for n = min(8, len−offset) … 1`, first `text[offset:offset+n]` in the `Map` wins.
3. Show a dark popup near the cursor: matched word (HK font), reading (jyutping default; pinyin on
   toggle) **tone-colored**, then the English defs; homographs listed. Non-CJK / no match / mouse
   leaves `#wp-overlay` → hide (small grace delay). English line is Latin → naturally ignored.
4. Key `r` toggles jyut ⇄ pinyin (persist in `localStorage`), re-renders the open popup.
5. Tone = trailing digit of each space-split syllable. Palette: `1`#c00 `2`#e67e00 `3`#0a0 `4`#00c `5`#8a2be2 `6`#666 none#999 (pinyin 1–5, jyutping 1–6).
- Config consts: `DICT_URL`, `MAX_WORD=8`. Pure helpers (`forwardMaxMatch`, `isCJK`, `toneColor`,
  `parseDict`) exported behind `typeof module` for the Node test.

## Fonts

Popup `font-family: "Chiron Hei HK","PingFang HK","Noto Sans HK","Microsoft JhengHei",sans-serif`
— correct HK glyphs, zero download.

## Testing

`dict.test.js` (Node, no deps, `overlay.test.js` style) over a tiny fixture: `forwardMaxMatch`
(longest wins / no-hit null / end boundary), `isCJK`, `toneColor`, `parseDict`. Then live on
`hkanime.com/play/銀魂/8x0` with the CantoCaptions srt: hover 係/唔/佢/嘅 → jyutping + def, toggle to
pinyin, check HK glyphs.

## Files (all in `webplayer-w-captions/`)

- `build_dict.py` — offline merge → `canto-dict.min.json(.gz)` + prints GCS publish commands.
- `dict.js` — the bookmarklet (fetch · hover via caretRangeFromPoint · popup · toggle · tones).
- `dict.test.js` — Node tests for the pure helpers.
- README section — one-time build/publish, then "run overlay, paste `dict.js`, hover, press `r`";
  plus a CC-BY-SA credit line (CC-CEDICT; CC-Canto © Pleco Software).

## Notes / risks

- First load ≈ 4 MB gzip, then HTTP-cached. `caretRangeFromPoint` is native in Chrome (user's browser).
- Greedy longest-match, no context — same as Zhongwen. HK glyphs depend on an OS CJK font (degrades).
- Published JSON is a derivative aggregate → carries CC-BY-SA attribution (`_license` + README).
- `mdbg` is a build-time-only dependency; runtime hits only the GCS object.
