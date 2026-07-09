# mobile-audio

Live **Cantonese captions for any audio playing on your Android phone** — podcasts, hkanime in
a browser, YouTube — captured from the phone's **internal audio** (not the mic), transcribed
**on-device** (SenseVoice), shown in a floating overlay with a **tap-a-word dictionary**
(jyutping/pinyin + English) and an **optional Gemini English line**.

Part of **[subtitle-everything](../README.md)**. Android's built-in Live Caption has no
Cantonese; Live Transcribe is mic-only. This fills that gap.

## Install (no Android Studio needed)
1. On the phone, download **`app-debug.apk`** from the repo's
   [Releases](https://github.com/WandLZhang/subtitle-everything/releases) (tag `mobile-audio-latest`).
2. Open it; allow "install unknown apps" if prompted.
3. Launch **Subtitle Everything**, grant **microphone** + **notifications**, and **Display over
   other apps** when asked.
4. Tap **Start captions** → accept the **screen/audio capture** prompt (that's how Android exposes
   internal audio). First run downloads the model (~230 MB — use Wi-Fi).
5. Play a podcast / hkanime. Captions float on top. **Drag** by the top handle; **tap a word** for
   its reading + meaning. Toggle **Jyutping/Pinyin** and the **English line** (needs a key) in the app.

Requires Android 10+ (arm64); built for the Pixel 7a (Android 16).

## How it works
`MediaProjection` + `AudioPlaybackCapture` → 16 kHz PCM → **Silero VAD** segments utterances →
**SenseVoice** (sherpa-onnx, on-device) → **OpenCC** to HK-traditional → overlay. Dictionary is the
same public GCS blob as the webplayer tool. English (optional) is **Gemini flash-lite**.

## Settings
- **Gemini API key** — enables the English line ([AI Studio key](https://aistudio.google.com/apikey)); stored locally, never leaves the device except to Google.
- **Show English translation** — on/off.
- **Reading** — Jyutping (default) or Pinyin.

## Build from source
```bash
cd mobile-audio
bash scripts/fetch-libs.sh          # downloads sherpa-onnx arm64 .so into app/src/main/jniLibs
./gradlew :app:assembleDebug        # -> app/build/outputs/apk/debug/app-debug.apk
```
Needs JDK 17 + Android SDK (platform 34, build-tools 34). CI (`.github/workflows/android.yml`)
does this on every push and publishes the APK to the `mobile-audio-latest` release.

## Known limitations (v0.1)
- **Capture is per-app**: works for podcast apps, browsers (hkanime), YouTube; DRM-protected apps
  (some music services) opt out of capture → silence.
- SenseVoice is **non-streaming**: captions appear per utterance (~1–2 s behind), not word-by-word.
- OpenCC `s2t` handles most chars; a few HK-specific colloquial glyphs may differ.
- Tap-dictionary needs the caption word to match a dict entry (post-OpenCC); rare misses possible.
- Untested edge cases (rotation, long sessions) — this is a first end-to-end build.
