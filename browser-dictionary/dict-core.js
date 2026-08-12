// browser-dictionary — the hover-dictionary engine. Loaded as a plain content script (no modules), so it
// hangs one object, `BrowserDict`, off globalThis; content.js drives it. Also exports for the Node test.
//
// Ported from hkanime-w-cantocaption/dict.js (segmentation + popup) plus the two fixes the web
// tools never got: tone marks (mobile-audio Pinyin.kt) and readingFor (mobile-audio Dict.kt).
(function () {
  'use strict';

  const DICT_URL = 'https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json';
  const MAX_WORD = 8;                                   // longest word to try (chars)

  // ---------------------------------- pure helpers ----------------------------------

  function isCJK(ch) {
    if (!ch) return false;
    const c = ch.codePointAt(0);
    return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0x20000 && c <= 0x2ffff);
  }

  function toneColor(syllable) {                        // colour by trailing tone digit
    const m = { '1': '#e15a5a', '2': '#e6a13a', '3': '#3fae4f', '4': '#5a8fe1', '5': '#b06fe0', '6': '#9aa0a6' };
    return m[(syllable || '').trim().slice(-1)] || '#c9ccd1';
  }

  function fwdMatch(dict, text, i) {                    // forward-maximal-match at index i
    const max = Math.min(MAX_WORD, text.length - i);
    for (let n = max; n >= 1; n--) {
      const w = text.substr(i, n);
      if (dict[w]) return { word: w, entries: dict[w] };
    }
    return null;
  }

  // Tone marks. Jyutping is deliberately left as digits — that IS its standard notation; it has no
  // diacritic convention, and Cantonese's six tones don't map onto the four pinyin marks.
  const MARKS = {
    a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ',
    A: 'ĀÁǍÀ', E: 'ĒÉĚÈ', I: 'ĪÍǏÌ', O: 'ŌÓǑÒ', U: 'ŪÚǓÙ', 'Ü': 'ǕǗǙǛ',
  };

  // Where the mark goes: 'a' wins, else 'o'/'e', else the last of i/u/ü (so "iu"->u, "ui"->i).
  function vowelIndex(s) {
    const l = s.toLowerCase();
    let i = l.indexOf('a'); if (i >= 0) return i;
    i = l.indexOf('o'); if (i >= 0) return i;
    i = l.indexOf('e'); if (i >= 0) return i;
    let last = -1;
    for (let k = 0; k < l.length; k++) if (l[k] === 'i' || l[k] === 'u' || l[k] === 'ü') last = k;
    return last >= 0 ? last : -1;
  }

  /** "hao3" -> "hǎo", "lu:4" -> "lǜ", "de5" -> "de". Anything unexpected passes through. */
  function accent(syllable) {
    let s = (syllable || '').trim();
    if (!s) return s;
    s = s.split('u:').join('ü').split('U:').join('Ü');   // CC-CEDICT writes ü as u:
    const last = s.charAt(s.length - 1);
    if (last < '0' || last > '9') return s;
    const t = +last;
    s = s.slice(0, -1);
    if (t < 1 || t > 4) return s;                        // 5 / 0 = neutral, no mark
    const i = vowelIndex(s);
    if (i < 0) return s;
    const row = MARKS[s.charAt(i)];
    if (!row) return s;
    return s.slice(0, i) + row.charAt(t - 1) + s.slice(i + 1);
  }

  function accentAll(reading) {
    return (reading || '').split(' ').filter(Boolean).map(accent).join(' ');
  }

  /**
   * About 14% of headwords carry pinyin but NO jyutping (曱甴, 佛珠 …). Blindly falling back to `py`
   * printed the MANDARIN reading tone-coloured and indistinguishable from jyutping. So: use the
   * word's own reading, else compose it per character (佛 fat6 + 珠 zyu1 -> "fat6 zyu1"), else fall
   * back to the other language flagged, so the popup can say which it is.
   */
  function compose(dict, word, want) {
    const out = [];
    for (const ch of word) {
      const e = dict[ch] && dict[ch][0];
      const v = e && (e[want] || '').trim();
      if (!v) return '';
      out.push(v.split(' ')[0]);                         // one character = one syllable
    }
    return out.join(' ');
  }

  /** -> { text, isPinyin, composed, wrongLang }. `mode` is 'jy' or 'py'. */
  function readingFor(dict, word, entry, mode) {
    const want = mode === 'py' ? 'py' : 'jy';
    const other = want === 'py' ? 'jy' : 'py';
    const own = ((entry && entry[want]) || '').trim();
    if (own) return { text: own, isPinyin: want === 'py', composed: false, wrongLang: false };
    const c = compose(dict, word, want);
    if (c) return { text: c, isPinyin: want === 'py', composed: true, wrongLang: false };
    return { text: ((entry && entry[other]) || '').trim(), isPinyin: other === 'py', composed: false, wrongLang: true };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isCJK, toneColor, fwdMatch, accent, accentAll, readingFor, MAX_WORD };
    return;
  }
  if (typeof document === 'undefined') return;

  // ---------------------------------- browser ----------------------------------

  let dictPromise = null;                                // one fetch per frame, on first CJK hover
  function loadDict() {
    if (!dictPromise) {
      dictPromise = fetch(DICT_URL)
        .then(r => r.json())
        .then(j => j.entries)
        .catch(e => { dictPromise = null; console.warn('[browser-dictionary] dictionary failed', e); return null; });
    }
    return dictPromise;
  }

  const FONT = '"Chiron Hei HK","PingFang HK","Noto Sans HK","Microsoft JhengHei",sans-serif';

  /**
   * Bind the hover dictionary to a document. Safe to call on any document, including the inner
   * frame of a VSCode webview after it has been document.write()n.
   *
   * opts.getMode() -> 'jy' | 'py'    opts.setMode(m)     (both optional; defaults to jyutping)
   * opts.isEnabled() -> boolean                          (optional; defaults to always on)
   */
  function attach(doc, opts) {
    if (!doc || doc.__browserDict) return;
    doc.__browserDict = true;
    const o = opts || {};
    const getMode = o.getMode || (() => 'jy');
    const setMode = o.setMode || (() => {});
    const isEnabled = o.isEnabled || (() => true);

    let pop = null, last = null, dict = null;

    function ensurePop() {
      if (pop && pop.isConnected) return pop;
      pop = doc.createElement('div');
      pop.id = "bd-pop";
      pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:360px;padding:9px 12px;' +
        'border-radius:8px;background:rgba(17,19,23,.97);color:#e8eaed;font-size:14px;line-height:1.45;' +
        'pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);' +
        'display:none;text-align:left;font-family:' + FONT;
      (doc.body || doc.documentElement).appendChild(pop);
      return pop;
    }

    // Built from DOM nodes rather than innerHTML: sites with a Trusted Types policy (YouTube, and
    // VSCode webviews) refuse innerHTML assignment outright and the popup silently dies.
    function render(m) {
      const p = ensurePop();
      const mode = getMode();
      while (p.firstChild) p.removeChild(p.firstChild);

      const head = doc.createElement('div');
      head.textContent = m.word;
      head.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:3px';
      p.appendChild(head);

      for (const e of m.entries.slice(0, 5)) {
        const row = doc.createElement('div');
        row.style.margin = '3px 0';
        const r = readingFor(dict, m.word, e, mode);
        for (const syl of (r.text || '').split(' ')) {
          if (!syl) continue;
          const b = doc.createElement('b');
          b.textContent = (r.isPinyin ? accent(syl) : syl) + ' ';
          b.style.color = toneColor(syl);
          row.appendChild(b);
        }
        if (r.wrongLang || r.composed) {
          const note = doc.createElement('span');
          note.textContent = r.wrongLang
            ? (r.isPinyin ? '(pinyin — no jyutping) ' : '(jyutping — no pinyin) ')
            : '(per character) ';
          note.style.color = '#7b8087';
          row.appendChild(note);
        }
        const d = doc.createElement('span');
        d.textContent = e.d.slice(0, 4).join('; ');
        d.style.color = '#c9ccd1';
        row.appendChild(d);
        p.appendChild(row);
      }

      const foot = doc.createElement('div');
      foot.textContent = (mode === 'py' ? 'pinyin' : 'jyutping') + ' · press r to switch';
      foot.style.cssText = 'margin-top:5px;font-size:11px;color:#7b8087';
      p.appendChild(foot);
      p.style.display = 'block';
    }

    function place(x, y) {
      const p = ensurePop();
      const w = p.offsetWidth, h = p.offsetHeight, pad = 14;
      const vw = (doc.defaultView || window).innerWidth, vh = (doc.defaultView || window).innerHeight;
      let nx = x + pad, ny = y + pad;
      if (nx + w > vw) nx = x - w - pad;
      if (ny + h > vh) ny = y - h - pad;
      p.style.left = Math.max(4, nx) + 'px';
      p.style.top = Math.max(4, ny) + 'px';
    }

    function hide() { if (pop) pop.style.display = 'none'; last = null; }

    function caret(x, y) {                               // Chrome vs Firefox
      if (doc.caretRangeFromPoint) { const r = doc.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; }
      if (doc.caretPositionFromPoint) { const p = doc.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; }
      return null;
    }

    doc.addEventListener('mousemove', ev => {
      if (!isEnabled()) return hide();
      const c = caret(ev.clientX, ev.clientY);
      if (!c || !c.node || c.node.nodeType !== 3) return hide();
      const text = c.node.nodeValue || '';
      if (!isCJK(text.charAt(c.off))) return hide();
      if (!dict) {                                       // first CJK hover in this frame
        loadDict().then(d => { if (d) dict = d; });
        return;
      }
      const m = fwdMatch(dict, text, c.off);
      if (!m) return hide();
      if (!last || last.word !== m.word) { last = m; render(m); }
      place(ev.clientX, ev.clientY);
    }, true);

    doc.addEventListener('mouseleave', hide, true);

    doc.addEventListener('keydown', ev => {
      if (!isEnabled()) return;
      if (ev.key !== 'r' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      // never steal `r` from somewhere the user is typing — this runs on every page, all day
      const t = ev.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
      setMode(getMode() === 'py' ? 'jy' : 'py');
      if (last) render(last);
    }, true);
  }

  globalThis.BrowserDict = { attach, isCJK, toneColor, fwdMatch, accent, accentAll, readingFor, MAX_WORD, DICT_URL };
})();
