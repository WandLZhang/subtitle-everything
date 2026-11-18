// Canto hover dictionary — paste in the DevTools console AFTER the overlay bookmarklet
// (bookmarklet.js or bookmarklet-llm.js). Hover a Chinese word in the 口語 cue to pop its
// English definition + reading; press `r` to toggle jyutping (default) <-> pinyin.
//
// Zero changes to the overlay: it reads the hovered character with caretRangeFromPoint on
// the existing text, so it doesn't matter that the overlay rewrites its text each tick.
// The dictionary is a public, gzip'd, CORS-open GCS object (built by build_dict.py).
(function () {
  'use strict';
  const DICT_URL = 'https://storage.googleapis.com/wz-canto-dict/canto-dict.min.json';
  const MAX_WORD = 8;                                   // longest word to try (chars)

  // ---- pure helpers (also exported for the Node test) ----
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

  // Pinyin tone marks and readingFor, the same code as browser-dictionary/dict-core.js. Jyutping
  // keeps its digits. They're its standard notation, and six Cantonese tones don't map onto the four
  // pinyin marks. The nasal rows are arrays because n̄ and the m marks are two code points each.
  const MARKS = {
    a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ',
    A: 'ĀÁǍÀ', E: 'ĒÉĚÈ', I: 'ĪÍǏÌ', O: 'ŌÓǑÒ', U: 'ŪÚǓÙ', 'Ü': 'ǕǗǙǛ',
    n: ['n\u0304', 'ń', 'ň', 'ǹ'], m: ['m\u0304', 'ḿ', 'm\u030C', 'm\u0300'],
    N: ['N\u0304', 'Ń', 'Ň', 'Ǹ'], M: ['M\u0304', 'Ḿ', 'M\u030C', 'M\u0300'],
  };
  // 'a' wins, else 'o'/'e', else the last of i/u/ü. No vowel means a syllabic nasal (唔 n2, 呣 m2).
  function vowelIndex(s) {
    const l = s.toLowerCase();
    for (const v of 'aoe') { const i = l.indexOf(v); if (i >= 0) return i; }
    let last = -1;
    for (let k = 0; k < l.length; k++) if (l[k] === 'i' || l[k] === 'u' || l[k] === 'ü') last = k;
    if (last >= 0) return last;
    const n = l.indexOf('n'), m = l.indexOf('m');
    return n < 0 ? m : m < 0 ? n : Math.min(n, m);
  }
  /** "hao3" -> "hǎo", "lu:4" and "lv4" -> "lǜ", "n2" -> "ń", "de5" -> "de". Anything else passes through. */
  function accent(syllable) {
    const orig = (syllable || '').trim();
    const last = orig.charAt(orig.length - 1);
    if (!orig || last < '0' || last > '9') return orig;   // no tone digit: a letter, a word, punctuation
    // CC-CEDICT writes ü as "u:" and CC-Canto often as "v" (nv3, lv4); a bare "V" (V領) stays a V
    const s = orig.slice(0, -1).split('u:').join('ü').split('U:').join('Ü').split('v').join('ü').split('V').join('Ü');
    const isLetter = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === 'ü' || c === 'Ü';
    if (![...s].some(isLetter)) return orig;              // a number such as 雙11 keeps its digits
    const t = +last;
    if (t < 1 || t > 4) return s;                         // 5 / 0 = neutral, no mark
    const i = vowelIndex(s);
    const row = i < 0 ? null : MARKS[s.charAt(i)];
    if (!row) return orig;
    return s.slice(0, i) + row[t - 1] + s.slice(i + 1);
  }
  // CC-Canto glues some syllables together (yi1ju4) and leaves punctuation on others (da3,), so cut
  // after each tone digit as well as at spaces.
  function syllables(reading) {
    const out = [];
    const isDigit = c => c >= '0' && c <= '9';
    for (const tok of (reading || '').split(' ')) {
      let cur = '';
      for (let i = 0; i < tok.length; i++) {
        cur += tok[i];
        if (isDigit(tok[i]) && !(i + 1 < tok.length && isDigit(tok[i + 1]))) { out.push(cur); cur = ''; }
      }
      if (cur) out.push(cur);
    }
    return out;
  }
  // About 14% of headwords have pinyin and no jyutping, and the old fallback printed that Mandarin
  // under the "jyutping" label. Use the word's own reading, else build it per character, else show
  // the other language and say which it is.
  function compose(dict, word, want) {
    const out = [];
    for (const ch of word) {
      const e = dict[ch] && dict[ch][0];
      const v = e && (e[want] || '').trim();
      if (!v) return '';
      out.push(syllables(v)[0]);                          // one character = one syllable
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

  if (typeof module !== 'undefined' && module.exports) { module.exports = { isCJK, toneColor, fwdMatch, accent, syllables, readingFor }; return; }
  if (typeof document === 'undefined') return;

  // ---------------------------------- browser ----------------------------------
  (async () => {
    const box = document.getElementById('wp-overlay');
    if (!box) { alert('Run the overlay bookmarklet first (no #wp-overlay found).'); return; }

    console.log('[dict] loading dictionary…');
    let dict;
    try { dict = (await (await fetch(DICT_URL)).json()).entries; }
    catch (e) { alert('[dict] failed to load dictionary: ' + e.message); return; }
    console.log('[dict] ready —', Object.keys(dict).length, 'headwords. Hover the 口語 line; press r to toggle jyutping/pinyin.');

    box.style.pointerEvents = 'auto';                   // overlay is pointer-events:none by default
    const RKEY = 'canto-dict-reading';
    let mode = localStorage.getItem(RKEY) === 'py' ? 'py' : 'jy';
    let last = null;                                     // last {word,entries} rendered

    const pop = document.createElement('div');
    pop.id = 'wp-dict';
    pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:340px;padding:8px 11px;border-radius:8px;' +
      'background:rgba(17,19,23,.96);color:#e8eaed;font-size:14px;line-height:1.45;pointer-events:none;' +
      'box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);display:none;' +
      'font-family:"Chiron Hei HK","PingFang HK","Noto Sans HK","Microsoft JhengHei",sans-serif';
    document.body.appendChild(pop);

    // Built from DOM nodes rather than innerHTML: sites with a Trusted Types policy
    // (YouTube, for one) refuse innerHTML assignment outright and the popup silently dies.
    function render(m) {
      while (pop.firstChild) pop.removeChild(pop.firstChild);
      const head = document.createElement('div');
      head.textContent = m.word;
      head.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:3px';
      pop.appendChild(head);
      for (const e of m.entries.slice(0, 5)) {
        const row = document.createElement('div');
        row.style.margin = '3px 0';
        const r = readingFor(dict, m.word, e, mode);
        if (r.text) {
          for (const syl of syllables(r.text)) {
            const s = document.createElement('span');
            s.textContent = (r.isPinyin ? accent(syl) : syl) + ' ';
            s.style.cssText = 'font-weight:600;color:' + toneColor(syl);   // colour from the digit
            row.appendChild(s);
          }
          if (r.wrongLang || r.composed) {
            const n = document.createElement('span');
            n.textContent = r.wrongLang ? (r.isPinyin ? '(pinyin, no jyutping) ' : '(jyutping, no pinyin) ') : '(per character) ';
            n.style.color = '#7b8087';
            row.appendChild(n);
          }
        } else {
          const s = document.createElement('span'); s.textContent = '· '; row.appendChild(s);
        }
        const d = document.createElement('span');
        d.textContent = e.d.slice(0, 4).join('; ');
        d.style.color = '#c9ccd1';
        row.appendChild(d);
        pop.appendChild(row);
      }
      const foot = document.createElement('div');
      foot.textContent = (mode === 'py' ? 'pinyin' : 'jyutping') + ' · press r to switch';
      foot.style.cssText = 'margin-top:5px;font-size:11px;color:#7b8087';
      pop.appendChild(foot);
      pop.style.display = 'block';
    }
    function place(x, y) {
      const w = pop.offsetWidth, h = pop.offsetHeight, pad = 14;
      let nx = x + pad, ny = y + pad;
      if (nx + w > innerWidth) nx = x - w - pad;
      if (ny + h > innerHeight) ny = y - h - pad;
      pop.style.left = Math.max(4, nx) + 'px';
      pop.style.top = Math.max(4, ny) + 'px';
    }
    const hide = () => { pop.style.display = 'none'; last = null; };

    function caret(x, y) {                               // Chrome vs Firefox
      if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; }
      if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; }
      return null;
    }

    // caret() gives an INSERTION POINT between characters, so hovering the right half of a
    // character returns the offset AFTER it and we looked up its neighbour. Pick the character
    // whose own box contains the cursor.
    function hitChar(node, off, x) {
      const len = (node.nodeValue || '').length, r = document.createRange();
      for (const i of [off - 1, off]) {
        if (i < 0 || i >= len) continue;
        r.setStart(node, i); r.setEnd(node, i + 1);
        const b = r.getBoundingClientRect();
        if (x >= b.left && x <= b.right) return i;
      }
      return Math.min(off, len - 1);
    }

    box.addEventListener('mousemove', e => {
      const c = caret(e.clientX, e.clientY);
      if (!c || !c.node || c.node.nodeType !== 3) return hide();
      const text = c.node.nodeValue || '';
      const i = hitChar(c.node, c.off, e.clientX);
      if (!isCJK(text.charAt(i))) return hide();
      const m = fwdMatch(dict, text, i);
      if (!m) return hide();
      if (!last || last.word !== m.word) { last = m; render(m); }
      place(e.clientX, e.clientY);
    });
    box.addEventListener('mouseleave', hide);
    document.addEventListener('keydown', e => {
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        mode = mode === 'py' ? 'jy' : 'py'; localStorage.setItem(RKEY, mode);
        if (last) render(last);
        console.log('[dict] reading:', mode === 'py' ? 'pinyin' : 'jyutping');
      }
    });
  })();
})();
