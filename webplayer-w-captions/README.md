# webplayer-w-captions

Overlay an **external 口語 SRT** (e.g. from [CantoCaptions](https://github.com/notHulK11/CantoCaptions))
onto *any* web video player (hkanime, etc.), with a **Zhongwen-style hover dictionary** and an
**optional AI English line** — 100% client-side, no extension. For videos where a Cantonese
caption already exists, so no ASR/OCR is needed. **Replaces Substital.**

## Use — one paste
1. Start playback on the video page (e.g. hkanime Gintama).
2. Open [`bookmarklet.js`](bookmarklet.js), set the **`SRT`** const (and optionally **`KEY`**), copy the whole file.
3. Paste into the DevTools console — or save it as a `javascript:` bookmarklet.

You get the **口語 line** synced to the video immediately, plus:
- **Hover any word** → a pop-up with its **English definition** and **reading** (tone-coloured);
  press **`r`** to toggle **jyutping** (default) ⇄ **pinyin**.
- If you set **`KEY`**, an **English translation line** fills in underneath as it plays.

Timing off (community srt vs this cut)? In the console: `window.SUB_OFFSET = -30` (seconds).

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
- `bookmarklet.js` — **the one-paste tool** (overlay + hover dictionary + optional English).
- `overlay.js` · `dict.js` — the tested logic modules (`node overlay.test.js`, `node dict.test.js`).
- `build_dict.py` — offline dictionary builder (CC-CEDICT + CC-Canto → GCS).
- `test.html` + `sample.srt` — local harness.

## Caveats
- Needs an HTML5 `<video>` on the page (jwplayer/HLS players qualify).
- HK glyphs use the system CJK stack (`Chiron Hei HK`/`PingFang HK`/`Noto Sans HK`).
- Hover lookup uses `caretRangeFromPoint` (Chrome/Edge/Safari; Firefox falls back automatically).
