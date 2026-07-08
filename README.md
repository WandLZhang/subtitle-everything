# canto-subs

Reproducible pipeline to generate **colloquial written-Cantonese (口語 / 粵文)** and
**English** subtitle tracks for a Cantonese film, from its video URL, on a GCP L4 GPU.

It orchestrates two community tools rather than reinventing them:

| Stage | Tool | Output |
|-------|------|--------|
| Speech → 口語 SRT | [rookes/cantocaptions-ai](https://github.com/rookes/cantocaptions-ai) (Qwen3-ASR + mbroformer + pyannote VAD) | `*.srt` (口語) |
| 口語 → English SRT | [rookes/AI-translate-canto-subs](https://github.com/rookes/AI-translate-canto-subs) | `*.en.srt` |
| QA / watch | `player/` (Range-capable server + dual-track HTML5 player) | in-browser A/B |

Why ASR and not OCR: a Hong Kong film's **burned-in subtitles are Standard Written
Chinese (SWC / 書面語)** — transcribing the *audio* is the only way to get true spoken
**口語**. OCR of the burned-in subs (e.g. [leuchthelp/sub-convert](https://github.com/leuchthelp/sub-convert))
yields the SWC reference, useful only for homophone-correction (see *Fidelity* below).

> **Copyright:** this repo is **tooling only**. Generated `.srt`/`.vtt`/`.mp4` are
> derivatives of a copyrighted film and are **gitignored** — they live in a private
> GCS bucket you control. See [`docs/ACCESS.md`](docs/ACCESS.md).

## Prerequisites
- `gcloud` authenticated, a GCP project (a fresh one is fine — `infra/provision.sh` resets the blocking org policies).
- A HuggingFace token with **pyannote/segmentation** terms accepted (for VAD).
- An LLM API key for translation (Gemini / Claude / OpenAI — BYO, per AI-translate-canto-subs).

## Runbook
```bash
# 1. Provision an L4 GPU (Vertex Workbench; draws the pool, no CE GPU quota).
#    Pick a ZONE with free L4 supply — US is often stocked out.
PROJECT=my-proj REGION=asia-southeast1 ZONE=asia-southeast1-b bash infra/provision.sh

# 2. On the VM: transcribe audio -> 口語 SRT
gcloud compute ssh canto-asr --zone=asia-southeast1-b --project=my-proj --tunnel-through-iap
HF_TOKEN=hf_... VIDEO_URL="https://www.youtube.com/watch?v=..." STEM=fensau100 bash pipeline/01_transcribe.sh

# 3. Translate 口語 -> English (BYO key)
GOOGLE_API_KEY=... bash pipeline/02_translate.sh out/fensau100.srt "Break Up 100 (2014 HK romcom)"

# 4. Publish artifacts to the private bucket
BUCKET=gs://my-bucket STEM=fensau100 bash pipeline/03_publish.sh out/fensau100.srt out/fensau100.en.srt

# 5. Watch / QA  — see docs/ACCESS.md

# 6. Tear the GPU down
PROJECT=my-proj ZONE=asia-southeast1-b bash infra/teardown.sh
```

## Capacity
GPU is drawn from the Vertex pool, but Workbench still lands on Compute-Engine
capacity, so a zone can **STOCKOUT**. Check the internal GCE-supply report and pick a
zone whose `g2` / `l4` **free-empty** count is > 0 (as of this build: asia-southeast1-b,
me-central2-c, asia-southeast1-c, northamerica-northeast2). `g2-standard-8` = 1× L4
(plenty); use `g2-standard-96` (full 8-L4 node) only if single-GPU slots are contended.

## Fidelity vs the original SWC
The 口語 track is validated for **timing** (monotonic, no overlaps), **completeness**
(gaps are genuine silence), and **vernacularity** (~25:1 colloquial:SWC characters).
A rigorous **cue-by-cue fidelity check vs the film's SWC is a separate pass**: OCR the
burned-in subs and diff (also feeds cantocaptions-ai's `--reference_subtitle` homophone
correction). Not yet run — see `docs/ACCESS.md` for the plan.

## Layout
```
infra/      provision + teardown of the GPU VM (+ org-policy / network setup)
pipeline/   01 transcribe · 02 translate · 03 publish
player/      Range-capable server + dual-track HTML5 player
docs/        ACCESS.md — pull artifacts from GCS + play commands
config/      characters.yaml — name map for translation accuracy
```
