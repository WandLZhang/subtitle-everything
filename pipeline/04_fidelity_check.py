#!/usr/bin/env python3
"""Fidelity check: does the 口語 (audio-ASR) track match the film's burned-in
Standard Written Chinese (SWC) subtitles?

The SWC is hardsubbed (pixels), not a stream, so OCR runs on sampled video frames
via a Gemini vision model on Vertex. For each sampled cue we crop the bottom
subtitle band, OCR the SWC, and ask the model to classify our 口語 line against it:
  colloquial_rewrite  expected 書面->口語 (是->係, 他->佢) — faithful
  minor               small wording diff, same meaning — faithful
  deviation           different meaning / likely ASR error — NOT faithful
  no_swc              no SWC visible (music/scene) — excluded from the ratio

Usage:
  GOOGLE_CLOUD_PROJECT=my-proj python pipeline/04_fidelity_check.py \
      --srt output/movie.zh-HK-yue.srt --video output/movie.mp4 --samples 48
"""
import argparse, base64, json, os, subprocess, sys, tempfile
from google import genai
from google.genai import types

MODEL = "gemini-3.1-pro-preview"

def parse_srt(path):
    cues = []
    for blk in open(path, encoding="utf-8").read().split("\n\n"):
        lines = [l for l in blk.splitlines() if l.strip()]
        tc = next((l for l in lines if " --> " in l), None)
        if not tc:
            continue
        a, b = tc.split(" --> ")
        cues.append({"start": a.strip(), "end": b.strip()[:12],
                     "text": "\n".join(lines[lines.index(tc)+1:])})
    return cues

def to_s(ts):
    ts = ts.replace(",", ".")
    hh, mm, rest = ts.split(":")
    return int(hh)*3600 + int(mm)*60 + float(rest)

SCHEMA = {"type": "OBJECT", "properties": {
    "swc": {"type": "STRING"},
    "category": {"type": "STRING",
                 "enum": ["colloquial_rewrite", "minor", "deviation", "no_swc"]}},
    "required": ["swc", "category"]}

PROMPT = ("This is the bottom strip of a Hong Kong film frame with burned-in "
          "Standard Written Chinese (書面語) subtitles. Transcribe that Chinese "
          "subtitle text (traditional; empty if none). Then compare it to our "
          "audio-derived colloquial-Cantonese line below and classify:\n"
          "- colloquial_rewrite: same meaning, just 書面→口語 (是→係, 他→佢, 沒有→冇)\n"
          "- minor: small wording difference, same meaning\n"
          "- deviation: different meaning / likely mishearing\n"
          "- no_swc: no burned-in subtitle visible\n\nOur 口語 line:\n")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--srt", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--project", default=os.environ.get("GOOGLE_CLOUD_PROJECT"))
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--out", default="fidelity_report.json")
    args = ap.parse_args()

    cues = parse_srt(args.srt)
    step = max(1, len(cues) // args.samples)
    sample = cues[::step][:args.samples]
    client = genai.Client(vertexai=True, project=args.project, location="global")

    rows = []
    with tempfile.TemporaryDirectory() as td:
        for n, c in enumerate(sample):
            mid = (to_s(c["start"]) + to_s(c["end"])) / 2
            png = os.path.join(td, f"{n}.png")
            subprocess.run(["ffmpeg", "-copyts", "-ss", f"{mid:.3f}", "-i", args.video,
                            "-vf", "crop=iw:ih*0.24:0:ih*0.76", "-frames:v", "1", "-y", png],
                           capture_output=True)
            if not os.path.exists(png):
                continue
            img = types.Part.from_bytes(data=open(png, "rb").read(), mime_type="image/png")
            try:
                r = client.models.generate_content(
                    model=MODEL, contents=[img, types.Part(text=PROMPT + c["text"])],
                    config=types.GenerateContentConfig(
                        temperature=0.0, response_mime_type="application/json",
                        response_schema=SCHEMA))
                v = json.loads(r.text)
            except Exception as e:  # noqa: BLE001
                print(f"[warn] cue {n} @ {c['start']}: {e}", file=sys.stderr); continue
            rows.append({"start": c["start"], "category": v["category"]})
            print(f"[{n+1}/{len(sample)}] {c['start']} -> {v['category']}", file=sys.stderr)

    cats = {}
    for r in rows:
        cats[r["category"]] = cats.get(r["category"], 0) + 1
    judged = sum(v for k, v in cats.items() if k != "no_swc")
    faithful = cats.get("colloquial_rewrite", 0) + cats.get("minor", 0)
    summary = {"sampled": len(rows), "categories": cats,
               "faithful_of_judged": f"{faithful}/{judged}",
               "fidelity_pct": round(100*faithful/max(judged, 1), 1),
               "deviation_timestamps": [r["start"] for r in rows if r["category"] == "deviation"]}
    json.dump({"summary": summary, "rows": rows}, open(args.out, "w"), ensure_ascii=False, indent=2)
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
