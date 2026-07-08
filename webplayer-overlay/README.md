# webplayer-overlay

Overlay an **external 口語 SRT** (e.g. from [CantoCaptions](https://github.com/notHulK11/CantoCaptions))
plus a **live English translation** onto *any* web video player (hkanime, etc.) —
100% client-side, no extension. For videos where a Cantonese caption already exists,
so no ASR/OCR is needed.

**Replaces Substital** for this use: it renders its own overlay (no dependency on an
extension detecting the player), *and* it brings a better source sub + a translation +
a timing nudge.

## Use (console / bookmarklet)
1. Open the video page (e.g. hkanime Gintama EP01) and start playback.
2. Paste `bookmarklet.js` into the DevTools console — or save it as a `javascript:` bookmarklet.
3. Give it an **SRT URL** (e.g. a CantoCaptions raw `.srt`). It parses the srt, translates
   each cue (Chrome on-device Translator by default), and renders **口語 (top) + English
   (bottom)** synced to the player.

## Translation quality (read this)
- **On-device Chrome Translator** (default): free, no key — but *gist-level* and literal.
  It cannot fix errors in the source: garbage-in → garbage-out (e.g. a mis-heard `物探`
  becomes "geographic exploration").
- **LLM (recommended for real use):** replace the `tr` fn with a keyed Gemini/Claude call
  — uses context and repairs source slips. Same overlay.

## Timing
Community srts are often timed to a different release/cut. Nudge live in the console:
`window.SUB_OFFSET = -30` (seconds; +/- until it locks).

## Files
- `overlay.js` — reusable module (parse · timing · translate · render); Node-testable.
- `bookmarklet.js` — paste-and-go console/bookmarklet (prompts for the SRT URL).
- `test.html` + `sample.srt` — local harness. `overlay.test.js` covers the pure logic (`node overlay.test.js`).

## Caveats
- Needs an HTML5 `<video>` on the page (jwplayer/HLS players qualify).
- On-device Translator needs a recent Chrome (~138+) in a secure context (https/localhost).
