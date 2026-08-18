# youtube-w-subtitles

Render a YouTube video's **original Cantonese caption track** in our own overlay — with a
**hover dictionary** (tone-coloured jyutping + English) and an optional **Gemini English line** —
100% client-side, no extension. Works on auto-generated (ASR) and manual tracks alike.

Part of **[subtitle-everything](../README.md)**. Unlike
[`hkanime-w-cantocaption/`](../hkanime-w-cantocaption/) and
[`disneyplus-w-cantocaption/`](../disneyplus-w-cantocaption/), no external `.srt` is needed and
**no timing work is needed** — the cues come from YouTube itself.

## A channel that works well with this

**[Let's Go Eat with Brian](https://www.youtube.com/@LetsGoEatwithBrian)** — Hong Kong food channel,
81.7K subscribers, spoken 粵語. Its caption track is **manual `zh-HK`, not ASR**, which means neither
of the two problems below applies: no mis-heard words, and no overlapping cues to trim. Unscripted
conversation, so the register is closer to how people actually speak than a dubbed track is.

Any channel with a manual `zh-HK` track will behave the same way. To check before you commit to a
series, open a video and look for `"captionTracks"` in the page source — `kind: "asr"` means
auto-generated, and its absence means a human wrote them.

## Use
1. Open the video (CC can be off — the script toggles it on to capture the caption URL, then off again).
2. Open [`script.js`](script.js), optionally set **`KEY`**, copy the whole file.
3. Console (**⌘⌥J** / F12) → paste → Return.
4. Hover any blue word → reading + definition. Press **`r`** → pinyin. Yellow line = English.

## How it works, and the three things that bite

**1 · Captions sit behind a signed URL.** YouTube requires a session `pot` token on
`/api/timedtext`; a hand-built URL returns `200 OK` with an empty body. So the script
monkey-patches `fetch` and `XMLHttpRequest.open`, waits for the player to request its own
caption track, and reuses that fully-signed URL. Dropping `&tlang` from it yields the
**untranslated** original track.

**2 · ASR cues overlap.** Auto-generated tracks emit cues whose `dDurationMs` runs past the next
cue's start (plus rolling-window duplicates flagged `aAppend`). Naively picking the first
matching cue means an old line stays "active" and the overlay **falls progressively behind the
speech** while YouTube's own captions keep up. Fix: drop `aAppend` events, trim each cue to end
where the next begins, and binary-search for the **latest** cue at or before now.

**3 · YouTube enforces Trusted Types.** Any `innerHTML` assignment throws
`This document requires 'TrustedHTML' assignment` and the popup silently dies. The dictionary
popup is therefore built from DOM nodes (`createElement` / `textContent`) only.

## Why not let YouTube translate?
It can (`&tlang=en` isn't part of the signed parameter list, so you can append it freely), and
earlier versions did. But YouTube's MT on **colloquial Cantonese** is weak — hence the switch to
the original 口語 text plus Gemini for the English line, which handles 口語 and ASR slips far better.

## Mandarin: [`script-mandarin.js`](script-mandarin.js)
For Mandarin shows (時光代理人 / Link Click, etc.), use `script-mandarin.js` instead. Two changes:
- It **keeps the track selected in the player** rather than stripping `&tlang`. On a Cantonese
  video the track you want is the original and `tlang` is YouTube's MT; on a licensed Mandarin
  show the Chinese (Simplified) track in the CC menu already *is* the one you want.
- **Pinyin is the default** and renders as tone marks (`nǐ hǎo`), not digits. Press `r` for jyutping.

It also handles **purchased / rented titles** (Crunchyroll and friends sell episodes through
YouTube). Those don't expose `captionTracks` in the page source, so you can't pre-check a video the
way you can a free one — but the player still fetches the track, and the hook catches it. If the
console reports no URL captured, set Subtitles/CC → Off → the Chinese track, then re-run.

## Notes
- **Never commit a real API key** — the file ships `YOUR_GEMINI_API_KEY`.
- Quality is bounded by the source: an auto-generated track on noisy audio will have real errors,
  and no dictionary or LLM can recover a mis-heard word.
- Dictionary is the shared public `canto-dict` blob; builder lives in
  [`../hkanime-w-cantocaption/build_dict.py`](../hkanime-w-cantocaption/build_dict.py).
- Works for any language YouTube captions — but the popup dictionary is Cantonese/Mandarin only.
