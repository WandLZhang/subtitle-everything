# subtitle-everything

Reproducible tools to caption & translate **anything** — from film files to live audio playing on
your phone — in colloquial Cantonese (口語), Mandarin, Japanese, and English.

| Modality | Folder | Approach |
|----------|--------|----------|
| Video with **no usable subtitles** | [`no-subtitles/`](no-subtitles/) | transcribe the audio (ASR) → colloquial Cantonese (口語) + English |
| YouTube with **existing subtitles** | [`youtube-w-subtitles/`](youtube-w-subtitles/) | bypass player attestation (POT) → intercept signed session URLs → translate & render on-the-fly |
| Web player + an **external 口語 srt** | [`webplayer-w-captions/`](webplayer-w-captions/) | overlay a CantoCaptions/community `.srt` + hover-dictionary + live English on any web player |
| **Live audio on your phone** (any app) | [`mobile-audio/`](mobile-audio/) | capture the phone's internal audio → **on-device** ASR (SenseVoice) → **streaming** floating overlay in **Cantonese / Mandarin / Japanese**: tap-a-word dictionary (jyutping · pinyin · kana + defs), optional Gemini English line, last-2-line history, session transcript |

## 📱 Android app
Download the latest APK and install over any older build (no uninstall needed):
- **GCS:** `https://storage.googleapis.com/wz-qwen-test-canto-dict/mobile-audio/app-debug.apk`
- **GitHub:** [releases/mobile-audio-latest](https://github.com/WandLZhang/subtitle-everything/releases/tag/mobile-audio-latest)

Details, permissions, and build-from-source in [`mobile-audio/`](mobile-audio/).

## Shared dictionaries
Public, CORS-open GCS blobs (CC-BY-SA), built by [`webplayer-w-captions/build_dict.py`](webplayer-w-captions/build_dict.py) / [`build_dict_ja.py`](webplayer-w-captions/build_dict_ja.py) and used by **both** the web overlay and the app:
- **`canto-dict`** — CC-CEDICT + CC-Canto, both traditional & simplified keyed (Cantonese jyutping + Mandarin pinyin + English).
- **`ja-dict`** — JMdict (Japanese kana reading + English).

**Watchlist:** [watchlist.md](watchlist.md) — Cantonese-dub anime catalog (hkanime, 461 titles) + watch picks, as 口語 listening source material.
