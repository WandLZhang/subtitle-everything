# subtitle-everything

Reproducible tools to caption & translate **anything** — from film files to live audio playing on
your phone — in colloquial Cantonese (口語), Mandarin, Japanese, and English.

| Modality | Folder | Approach |
|----------|--------|----------|
| Video with **no usable subtitles** | [`no-subtitles/`](no-subtitles/) | transcribe the audio (ASR) → colloquial Cantonese (口語) + English |
| YouTube with **existing subtitles** | [`youtube-w-subtitles/`](youtube-w-subtitles/) | bypass player attestation (POT) → intercept signed session URLs → translate & render on-the-fly |
| **hkanime** + an external 口語 srt | [`hkanime-w-cantocaption/`](hkanime-w-cantocaption/) | overlay a CantoCaptions `.srt` + hover-dictionary + live English on a plain web player (one paste) |
| **Disney+** + an external 口語 srt | [`disneyplus-w-cantocaption/`](disneyplus-w-cantocaption/) | same, hardened for Disney+: decoy `<video>` elements, fullscreen render-tree, swallowed hotkeys, per-episode sync (`wpSync()`) |
| **Live audio on your phone** (any app) | [`mobile-audio/`](mobile-audio/) | capture the phone's internal audio → **on-device** ASR (SenseVoice) → **streaming** floating overlay in **Cantonese / Mandarin / Japanese**: tap-a-word dictionary (jyutping · pinyin · kana + defs), optional Gemini English line, last-2-line history, session transcript |

## Shared dictionaries
Public, CORS-open GCS blobs (CC-BY-SA), built by [`hkanime-w-cantocaption/build_dict.py`](hkanime-w-cantocaption/build_dict.py) / [`build_dict_ja.py`](hkanime-w-cantocaption/build_dict_ja.py) and used by **all** the overlays and the app:
- **`canto-dict`** — CC-CEDICT + CC-Canto, both traditional & simplified keyed (Cantonese jyutping + Mandarin pinyin + English).
- **`ja-dict`** — JMdict (Japanese kana reading + English).

**Watchlist:** [watchlist.md](watchlist.md) — Cantonese-dub anime catalog (hkanime, 461 titles) + watch picks, as 口語 listening source material.
