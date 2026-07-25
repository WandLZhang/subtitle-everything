# disneyplus-w-cantocaption

Overlay a **CantoCaptions 口語 SRT** on a **Disney+** episode, with a hover dictionary
(tone-coloured jyutping + English) and an optional Gemini English line — 100% client-side,
paste into the DevTools console. Built for **Bluey (Cantonese dub)**.

Part of **[subtitle-everything](../README.md)**. Sibling of
[`hkanime-w-cantocaption/`](../hkanime-w-cantocaption/) — same idea, but Disney+ needs extra
handling (below), so it gets its own script.

## Use
1. Play the episode on Disney+ (let it run past the intro).
2. Open [`bluey.js`](bluey.js), set **`EPISODE`** to match the CantoCaptions filename
   (e.g. `S02E35 The Quiet Game`), optionally set **`KEY`**, and copy the whole file.
3. Console (**⌘⌥J** / F12) → paste → Return. You should see `[wp] NNN cues · video time now …`.
4. **Align** — see below. Then click **✓ done** to hide the sync bar and clock.
5. Hover a blue word for its meaning + jyutping; press **`r`** to switch to pinyin.
   The yellow line is the English translation (needs `KEY`).

## Aligning (the only fiddly part)
Disney+ and the community SRT don't share a zero point, and **the offset differs per episode**:
most Bluey S2 SRTs pad the theme song and start their first cue at **18.0 s**, but some don't
(E03 starts at 29.9 s; E06/E07 at 0.5 s). The script starts at `START_OFFSET = 9.5`, which is
right for the common case (measured on S02E35).

**Exact fix, one command:** the instant the *first* line is spoken, run
```js
wpSync()          // or wpSync(3) while cue 3 is being spoken
```
It measures the difference and sets the offset. Alternatively use the on-screen bar:
**text before voice → click −**, **text after voice → click +**.

## Why Disney+ needs its own script
| Obstacle | Handling |
|---|---|
| Several decoy `<video>` elements (`duration=NaN`, time stuck at 0) | scores all videos incl. shadow DOM, locks to the live one (`window.__wpVideo`) |
| Fullscreen API renders **only** that element's subtree | overlay is mounted *inside* `document.fullscreenElement`, re-checked every 100 ms |
| Player swallows keystrokes | on-screen sync buttons instead of hotkeys |
| Custom caption renderer (no `video.textTracks`) | auto-align via the player's own subtitles isn't possible → `wpSync()` |
| Per-episode timing | `START_OFFSET` + `wpSync()` |

## Notes
- **Never commit a real API key** — the file ships `YOUR_GEMINI_API_KEY`.
- Only the Cantonese line responds to hover (English is filtered out by Unicode range).
- Dictionary is the shared public `canto-dict` blob; builder lives in
  [`../hkanime-w-cantocaption/build_dict.py`](../hkanime-w-cantocaption/build_dict.py).
- Other shows: change `BASE`/`SRT` to that series' CantoCaptions path.
