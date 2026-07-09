#!/usr/bin/env python3
"""Build the Canto hover-dictionary blob for dict.js.

Merges three CC-BY-SA sources into one lookup JSON:
  - CC-CEDICT           -> English defs + Mandarin pinyin  (mdbg canonical)
  - cccedict-canto-readings.txt -> jyutping for those entries (readings only)
  - cccanto-webdist.txt -> ~25k HK-colloquial entries WITH defs + jyutping

Output: canto-dict.min.json
  { "version", "_license", "entries": { "<headword>": [ {t,s,py,jy,d:[...]}, ... ] } }
Indexed under BOTH the traditional and simplified headword (cues are traditional HK).

Parsing is split/index-based (no regex), matching overlay.js. Runtime never touches these
sources — it fetches the built JSON (hosted via jsDelivr on a small public data repo).

Usage:  python3 build_dict.py [out_path]     # default ./canto-dict.min.json
"""
import gzip
import io
import json
import sys
import urllib.request

VERSION = "2026-07-08"
LICENSE = "CC-BY-SA 3.0 — CC-CEDICT (MDBG) + CC-Canto (c) Pleco Software. See the video-subtitles README."

# Canonical jyutping for core Cantonese-specific characters that CC-CEDICT/CC-Canto
# sometimes leave reading-less. Applied fill-if-empty only (never overrides source data),
# and only to single-character, unambiguous readings.
CANTO_SUPPLEMENT = {
    "係": "hai6", "喺": "hai2", "嘅": "ge3", "嗰": "go2", "啲": "di1", "咗": "zo2",
    "緊": "gan2", "咁": "gam3", "噉": "gam2", "唔": "m4", "佢": "keoi5", "哋": "dei6",
    "冇": "mou5", "嘢": "je5", "嚟": "lei4", "睇": "tai2", "攞": "lo2", "俾": "bei2",
    "畀": "bei2", "喇": "laa3", "咩": "me1", "乜": "mat1", "晒": "saai3", "吓": "haa5",
    "郁": "juk1", "瞓": "fan3", "搵": "wan2", "揾": "wan2", "諗": "nam2", "靚": "leng3",
    "錫": "sek3", "嘈": "cou4", "嘛": "maa3", "喎": "wo3", "吖": "aa1", "嗌": "aai3",
    "攰": "gui6", "掂": "dim6", "嬲": "nau1", "嘞": "laak3", "屙": "o1", "拎": "ning1",
}

CEDICT_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz"
_CANTO = "https://raw.githubusercontent.com/amadeusine/cc-canto-data/a687e469f6d5ee6873283ad3ec6fc1b35f518465"
READINGS_URL = _CANTO + "/cccedict-canto-readings.txt"
CCCANTO_URL = _CANTO + "/cccanto-webdist.txt"


def _fetch(url):
    print(f"  fetching {url.split('/')[-1]} ...", flush=True)
    with urllib.request.urlopen(url) as r:
        data = r.read()
    if url.endswith(".gz"):
        data = gzip.decompress(data)
    return data.decode("utf-8")


def _split_head(line):
    """'繁 简 [pin] {jyut}? /defs/?' -> (trad, simp, pinyin, jyut|None, defs[])."""
    trad, rest = line.split(" ", 1)
    simp, rest = rest.split(" ", 1)          # rest starts at '['
    lb, rb = rest.index("["), rest.index("]")
    pinyin = rest[lb + 1:rb].strip()
    jyut = None
    lc = rest.find("{")
    if lc != -1:
        rc = rest.index("}", lc)
        jyut = rest[lc + 1:rc].strip()
    defs = []
    sl = rest.find("/")
    if sl != -1:
        defs = [d for d in rest[sl:].split("/") if d.strip()]
    return trad, simp, pinyin, jyut, defs


def _norm_py(p):
    return p.replace(" ", "").lower()


def build():
    cedict = _fetch(CEDICT_URL)
    readings = _fetch(READINGS_URL)
    cccanto = _fetch(CCCANTO_URL)

    # key (trad, simp, normPinyin) -> entry dict
    merged = {}

    def key(t, s, py):
        return (t, s, _norm_py(py))

    n_cedict = 0
    for line in cedict.splitlines():
        if not line or line.startswith("#"):
            continue
        t, s, py, _jy, defs = _split_head(line)
        if not defs:
            continue
        merged[key(t, s, py)] = {"t": t, "s": s, "py": py, "jy": "", "d": defs}
        n_cedict += 1

    n_read = 0
    for line in readings.splitlines():
        if not line or line.startswith("#"):
            continue
        t, s, py, jy, _defs = _split_head(line)
        if not jy:
            continue
        e = merged.get(key(t, s, py))
        if e and not e["jy"]:
            e["jy"] = jy
            n_read += 1

    n_canto = 0
    for line in cccanto.splitlines():
        if not line or line.startswith("#"):
            continue
        t, s, py, jy, defs = _split_head(line)
        k = key(t, s, py)
        e = merged.get(k)
        if e:                                 # enrich an existing CEDICT entry
            if jy and not e["jy"]:
                e["jy"] = jy
            for d in defs:
                if d not in e["d"]:
                    e["d"].append(d)
        elif defs:                            # colloquial-only entry
            merged[k] = {"t": t, "s": s, "py": py, "jy": jy or "", "d": defs}
            n_canto += 1

    # fallback: fill entries missing jyutping from the unique reading of the same
    # headword (fixes common particles like 係/嘅 whose CEDICT pinyin didn't match a
    # readings row). Only when unambiguous, so true homographs (行 hang4/hong4) stay blank.
    jy_by_head = {}
    for e in merged.values():
        if e["jy"]:
            jy_by_head.setdefault(e["t"], set()).add(e["jy"])
    n_fill = 0
    for e in merged.values():
        if not e["jy"]:
            c = jy_by_head.get(e["t"])
            if c and len(c) == 1:
                e["jy"] = next(iter(c))
                n_fill += 1
    # supplement core Cantonese chars still missing a reading
    n_supp = 0
    for e in merged.values():
        if not e["jy"] and len(e["t"]) == 1 and e["t"] in CANTO_SUPPLEMENT:
            e["jy"] = CANTO_SUPPLEMENT[e["t"]]
            n_supp += 1
    print(f"  + jyutping back-filled : {n_fill} (unique) + {n_supp} (supplement)")

    # index by BOTH traditional and simplified headword, so lookups hit whether the ASR
    # output is trad (Cantonese, post-OpenCC) or simplified (Mandarin, raw). Minimal
    # records ({py,jy,d}); the headword key already is the word, so t/s are dropped.
    entries = {}
    for e in merged.values():
        rec = {"py": e["py"], "jy": e["jy"], "d": e["d"]}
        for hw in {e["t"], e["s"]}:
            lst = entries.setdefault(hw, [])
            if rec not in lst:
                lst.append(rec)

    out = {"version": VERSION, "_license": LICENSE, "entries": entries}

    with_jy = sum(1 for e in merged.values() if e["jy"])
    print(f"  CC-CEDICT entries      : {n_cedict}")
    print(f"  + jyutping attached    : {n_read}")
    print(f"  + colloquial-only added: {n_canto}")
    print(f"  total entries          : {len(merged)}  ({with_jy} with jyutping)")
    print(f"  headwords indexed      : {len(entries)}")
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "canto-dict.min.json"
    data = build()
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    mb = len(text.encode("utf-8")) / 1e6
    print(f"\nwrote {out_path}  ({mb:.1f} MB)")
    print("\nPublish to the public GCS object dict.js reads (gzipped, CORS-open, cached):")
    print(f"  gzip -kf {out_path}")
    print(f"  gcloud storage cp {out_path}.gz gs://wz-qwen-test-canto-dict/canto-dict.min.json \\")
    print("      --content-encoding=gzip --content-type=application/json --cache-control='public,max-age=86400'")
    print("  # one-time bucket setup (public + CORS) is documented in webplayer-w-captions/README.md")
    print("  # dict.js DICT_URL = https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json")


if __name__ == "__main__":
    main()
