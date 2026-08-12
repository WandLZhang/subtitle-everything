# browser-dictionary

A Chrome extension: hover any Chinese word on any page and get **jyutping** (or tone-marked pinyin)
plus the English definition. Install once per Chrome profile and it is on everywhere, permanently —
no pasting, no bookmarklet.

This is the Zhongwen replacement. Zhongwen is Mandarin-pinyin only, is still Manifest V2, and does
not work inside VSCode webviews (see [Why Zhongwen dies in VSCode](#why-zhongwen-dies-in-vscode)).

Part of **[subtitle-everything](../README.md)**. It reads the same public `canto-dict` blob as the
four other surfaces, so a rebuild of [`build_dict.py`](../hkanime-w-cantocaption/build_dict.py)
updates all five at once.

## Install (once, per Chrome profile)

Chrome runs on your Mac; this repo lives on the workstation. So clone it locally first.

1. On the **Mac**: `git clone https://github.com/WandLZhang/subtitle-everything.git`
   (already cloned → `git pull`). Put it somewhere permanent — **if you move or delete the folder,
   the extension breaks**, because Chrome loads it from disk on every startup.
2. `chrome://extensions` → turn on **Developer mode** (top right).
3. **Load unpacked** → select the `browser-dictionary/` folder.
4. Pin it: puzzle-piece icon in the toolbar → pin **browser-dictionary**.
5. **Disable Zhongwen**, or every ordinary page gets two popups fighting each other.

That survives quits, restarts, and Chrome updates. It does **not** sync to another machine — repeat
the steps there, or see [Making it sync](#making-it-sync).

## Use

| | |
|---|---|
| **Hover** a Chinese word | popup with reading + up to 5 definitions |
| **`r`** | switch jyutping ⇄ pinyin (ignored while you are typing in a field) |
| **Toolbar button** | turn the whole thing off / on; `off` badge when disabled |

Readings are coloured by tone. Jyutping keeps its **digits** — that is jyutping's standard notation,
it has no diacritic convention, and Cantonese's six tones do not map onto the four pinyin marks.
Pinyin gets real marks: `ni3 hao3` renders as `nǐ hǎo`.

The dictionary (143k headwords, traditional and simplified both keyed) is fetched from public GCS on
your first Chinese hover in a frame, never on page load, and is HTTP-cached for 24h.

### When a word has no jyutping

About 14% of headwords carry pinyin but no jyutping. The popup never passes a Mandarin reading off as
Cantonese. It tries, in order:

1. the word's own jyutping;
2. **composed per character** — 佛 `fat6` + 珠 `zyu1` → `fat6 zyu1`, marked `(per character)`;
3. the pinyin, marked **`(pinyin — no jyutping)`** and rendered with tone marks so it reads as pinyin.

This was the 曱甴 bug: it used to print `yue1 zha2` tone-coloured and call it jyutping. Ported from
`mobile-audio`'s [`Dict.kt`](../mobile-audio/app/src/main/java/com/k2fsa/sherpa/onnx/Dict.kt), which
hit it first.

## Why Zhongwen dies in VSCode

Worth recording, because nothing about it is guessable and it costs an hour to rediscover.

A Cloud Workstation serves code-oss over HTTPS, so the IDE is a normal Chrome tab and Zhongwen's
`<all_urls>` + `all_frames: true` content script does reach it. The problem is how VSCode builds a
webview, in `out/vs/workbench/contrib/webview/browser/pre/index.html`:

```js
// We should just be able to use srcdoc, but I wasn't
// seeing the service worker applying properly.
// Fake load an empty on the correct origin and then write real html into it
newFrame.src = `./fake.html?${fakeUrlParams}`;
...
contentDocument.open();
contentDocument.write(newDocument);   // <- every listener on this document dies here
contentDocument.close();
```

Chrome injects content scripts into `fake.html` when it loads. `document.open()` then unregisters
every event listener on that Document, and Chrome does **not** re-inject, because no new navigation
committed. So Zhongwen attaches and is wiped microseconds later. Every webview is affected: the
Claude Code panel, markdown preview, notebook renderers.

`content.js` works around it from the outside. The webview **host** frame is never rewritten, and the
inner frame is same-origin (`./fake.html`, and the sandbox keeps `allow-same-origin`), so the host
frame can reach `iframe.contentDocument` and attach *after* the write. A 500ms poll, not a
MutationObserver — it re-attaches after every rewrite, including the ones VSCode does when a panel
reloads, with no lifecycle reasoning to get wrong.

## What it cannot do

**The integrated terminal.** code-oss loads `@xterm/addon-webgl`, so glyphs are painted to a canvas.
There are no text nodes to hover and no DOM dictionary can ever read it. Only screen OCR would, which
is a different tool. Everything else in the IDE — editor, Claude Code panel, previews, settings UI —
works.

## Making it sync

Load-unpacked is per-machine and depends on the folder staying put. For an install that syncs across
Chrome profiles and auto-updates, publish it to the Chrome Web Store as **Unlisted** (one-time $5
developer fee): zip the folder, upload, set visibility to Unlisted, install from your own link.
Unlisted means it does not appear in search and only someone with the link can install it.

## Files

| File | |
|---|---|
| `manifest.json` | MV3. `<all_urls>`, `all_frames`, plus `storage.googleapis.com` for the dictionary |
| `dict-core.js` | the engine — segmentation, tone marks, reading fallback, popup. Also a Node module |
| `content.js` | per-frame wiring + the VSCode webview bridge |
| `background.js` | the toolbar on/off button |
| `dict-core.test.js` | `node dict-core.test.js` |

`dict-core.js` builds the popup from DOM nodes rather than `innerHTML`, because pages with a Trusted
Types policy — YouTube, and VSCode webviews — reject `innerHTML` outright and the popup dies silently.

## Credit

Dictionary data is CC-BY-SA: **CC-CEDICT** (MDBG) and **CC-Canto** (© Pleco Software). Built and
published by [`build_dict.py`](../hkanime-w-cantocaption/build_dict.py).
