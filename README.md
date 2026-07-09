# subtitle-everything

Reproducible tools to caption/translate **anything**, across **modalities** — from film files to
live audio playing on your phone.

| Modality | Folder | Approach |
|----------|--------|----------|
| Video with **no usable subtitles** | [`no-subtitles/`](no-subtitles/) | transcribe the audio (ASR) → colloquial Cantonese (口語) + English |
| YouTube with **existing subtitles** | [`youtube-w-subtitles/`](youtube-w-subtitles/) | bypass player attestation (POT) → intercept signed session URLs → translate & render on-the-fly |
| Web player + an **external 口語 srt** | [`webplayer-w-captions/`](webplayer-w-captions/) | overlay a CantoCaptions/community `.srt` + hover-dictionary + live English on any web player |
| **Live audio on your phone** (any app) | [`mobile-audio/`](mobile-audio/) | capture the phone's internal audio → **on-device** Cantonese ASR (SenseVoice) → floating overlay with **tap-a-word dictionary** (jyutping/pinyin + defs) + optional Gemini English |

**Watchlist:** [watchlist.md](watchlist.md) — Cantonese-dub anime catalog (hkanime, 461 titles) + watch picks, as 口語 listening source material.
