# hkanime-w-cantocaption

Overlay an **external 口語 SRT** (e.g. from [CantoCaptions](https://github.com/notHulK11/CantoCaptions))
onto *any* web video player (hkanime, etc.), with a **Zhongwen-style hover dictionary** and an
**optional AI English line** — 100% client-side, no extension. For videos where a Cantonese
caption already exists, so no ASR/OCR is needed. **Replaces Substital.**

## Use — one paste
1. Start playback on the hkanime episode page.
2. Open [`bookmarklet.js`](bookmarklet.js), set **`SHOW`** and **`EP`** (and optionally **`KEY`**), copy the whole file.
3. Paste into the DevTools console — or save it as a `javascript:` bookmarklet.

> **`EP` is the hkanime `x` number PLUS ONE** — hkanime is 0-indexed, so `/122x51` is episode 52.

You get a **scrollable phrase strip**: earlier lines faded to the left, the current line big in the
centre, later lines faded to the right. Plus:
- **Hover any phrase** (including faded ones) → pop-up with **English definition** + **reading**
  (tone-coloured); press **`r`** to toggle **jyutping** (default) ⇄ **pinyin**.
- If you set **`KEY`**, an **English line** under the strip fills in as it plays.

## Syncing — click the line you hear
Community srts are timed to their own release (usually a BD), so they never match a stream out of
the box. **Click the phrase in the strip that you're hearing right now** and the offset snaps to
it. That's the whole workflow — no arithmetic, no early/late guessing. Also:

| Control | Does |
|---|---|
| click a phrase | make it "now" (primary way to sync) |
| ◀ earlier line / later line ▶ | step one phrase back/forward |
| −0.5s / +0.5s | fine trim |
| ✂ cut here | add a breakpoint — everything after it keeps its own offset |
| ✓ hide bar | hide the controls, keep the strip |

`✂ cut here` exists because some streams remove content **mid-episode**, which makes one flat
offset impossible (see Code Geass below). Console equivalents: `wpSync(n)` while cue *n* is
spoken, `wpCut()`, and `window.SUB_SEGMENTS` holds the breakpoints.

## Shows and their quirks
Set `SHOW` to one of these keys. Each entry builds candidate URLs and takes the first that exists,
which is how the per-show naming mess below is absorbed. All verified against the live corpus.

| `SHOW` | Series | Eps | Quirk |
|---|---|---|---|
| `sakura` | 百變小櫻 MAGIC 咭 · Cardcaptor Sakura | 70 | Folder holds **two** naming sets (140 files); we pin the `[AI GEN V3]` one. Don't match on episode digits alone — `E058` also appears inside CRC hashes like `[C0E058A0]`. |
| `codegeass` | 叛逆的魯魯修 · Code Geass | 50 | hkanime runs S1+S2 as one 1–50 list; CantoCaptions splits them and **renumbers** (ep 26 = S2E01). hkanime also **cuts the ~92.6 s OP**, so the offset steps partway in — hence the default two segments. |
| `gintama` | 銀魂 · Gintama | 316 | Split across S1–S7; filenames carry the **global** number in `(nnn)` with seasons starting at 1/50/100/151/202/253/266. Episodes 1–2 share **one combined file**. |
| `hxh` | 全職獵人 · Hunter × Hunter 2011 | 148 | Clean 3-digit numbering, no seasons. |
| `drslump` | IQ博士 · Dr. Slump | 243 | E001 alone has a trailing ` - AI gen` in its filename. |

Adding a show: copy an entry in the `SHOWS` registry and point it at the folder in
[CantoCaptions](https://github.com/notHulK11/CantoCaptions/tree/main/Subtitles/Series). Check
coverage first — several popular titles have none (see [../watchlist.md](../watchlist.md)).

**Merged cues:** these are AI-generated srts, and some cues bundle several sentences under one
timestamp. The strip can only offer the whole block as one clickable unit, so clicking it syncs to
the block's start, which may be a second or two off the sentence you actually heard.

## Hover dictionary
Reads the hovered character with `caretRangeFromPoint` (so the overlay itself is untouched).
The dictionary is a single public, gzip'd, CORS-open GCS object (~4 MB over the wire,
browser-cached) built by `build_dict.py` from **CC-CEDICT + CC-Canto**. Only the Chinese line
responds — English is filtered out by Unicode range.

## Optional English line (`KEY`)
Set `KEY` to a Gemini key (mint at [AI Studio](https://aistudio.google.com/apikey), or
`gcloud services enable generativelanguage.googleapis.com` + create a key). Defaults to
`gemini-flash-lite-latest` (fastest, ~3.5 s / 50 cues) — swap `MODEL` to `gemini-3.5-flash` for
higher quality. It uses cross-cue context to **repair** ASR slips (`過工`→"high blood sugar",
`物探`→"spies"); batches are parallelized and capped with `maxOutputTokens` so the JSON never
truncates, blank-skipping a bad batch. **Never commit your key** (the file ships a placeholder).

## Rebuild the dictionary (one-time; only to refresh source data)
```bash
python build_dict.py canto-dict.min.json           # merge CC-CEDICT + CC-Canto -> JSON
# one-time public bucket setup (needs storage.publicAccessPrevention + iam.allowedPolicyMemberDomains
# at Google defaults on the project), then upload — commands are also printed by the script:
gcloud storage buckets create gs://wz-qwen-test-canto-dict --location=US --uniform-bucket-level-access
printf '[{"origin":["*"],"method":["GET"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]' > cors.json
gcloud storage buckets update gs://wz-qwen-test-canto-dict --cors-file=cors.json
gcloud storage buckets add-iam-policy-binding gs://wz-qwen-test-canto-dict --member=allUsers --role=roles/storage.objectViewer
gzip -kf canto-dict.min.json && gcloud storage cp canto-dict.min.json.gz \
  gs://wz-qwen-test-canto-dict/canto-dict.min.json \
  --content-encoding=gzip --content-type=application/json --cache-control="public,max-age=86400"
```
> **Dictionary data:** CC-CEDICT and CC-Canto (© Pleco Software), both **CC-BY-SA 3.0**.

## Files
- `bookmarklet.js` — **the one-paste tool** (phrase strip + click-to-sync + hover dictionary + optional English).
- `overlay.js` · `dict.js` — the tested logic modules (`node overlay.test.js`, `node dict.test.js`).
- `build_dict.py` — offline dictionary builder (CC-CEDICT + CC-Canto → GCS).
- `test.html` + `sample.srt` — local harness.

## Caveats
- Needs an HTML5 `<video>` on the page (jwplayer/HLS players qualify).
- HK glyphs use the system CJK stack (`Chiron Hei HK`/`PingFang HK`/`Noto Sans HK`).
- Hover lookup uses `caretRangeFromPoint` (Chrome/Edge/Safari; Firefox falls back automatically).
