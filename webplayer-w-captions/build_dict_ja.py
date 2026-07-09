#!/usr/bin/env python3
"""Build the Japanese hover-dictionary blob from jmdict-simplified (JMdict, English glosses).

Output: ja-dict.min.json
  { "version", "_license", "entries": { "<headword>": [ {"r": kana, "d": [glosses]} ] } }
Indexed under every kanji AND kana headword, so forward-maximal-match hits either script.
Upload to the same public GCS bucket the app reads.

Usage: python build_dict_ja.py <jmdict-eng-*.json> [out_path]
"""
import json
import sys


def build(src_json, out_path):
    data = json.load(open(src_json, encoding="utf-8"))
    words = data.get("words", [])
    entries = {}
    for w in words:
        kana = w.get("kana", [])
        reading = kana[0]["text"] if kana else ""
        defs = []
        for sense in w.get("sense", []):
            for g in sense.get("gloss", []):
                t = g.get("text")
                if t:
                    defs.append(t)
        defs = defs[:5]
        if not defs:
            continue
        rec = {"r": reading, "d": defs}
        heads = [k["text"] for k in w.get("kanji", [])] + [k["text"] for k in kana]
        for hw in set(heads):
            if not hw:
                continue
            lst = entries.setdefault(hw, [])
            if rec not in lst:
                lst.append(rec)
    out = {
        "version": data.get("version", ""),
        "_license": "JMdict (EDRDG) CC-BY-SA 4.0, via scriptin/jmdict-simplified",
        "entries": entries,
    }
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"words {len(words)}  headwords {len(entries)}  {len(text.encode('utf-8'))/1e6:.1f} MB")
    print(f"wrote {out_path}")
    print("Publish:")
    print(f"  gzip -kf {out_path} && gcloud storage cp {out_path}.gz "
          "gs://wz-qwen-test-canto-dict/ja-dict.min.json "
          "--content-encoding=gzip --content-type=application/json --cache-control='public,max-age=86400'")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "ja-dict.min.json")
