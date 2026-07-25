// Canto hover dictionary — paste in the DevTools console AFTER the overlay bookmarklet
// (bookmarklet.js or bookmarklet-llm.js). Hover a Chinese word in the 口語 cue to pop its
// English definition + reading; press `r` to toggle jyutping (default) <-> pinyin.
//
// Zero changes to the overlay: it reads the hovered character with caretRangeFromPoint on
// the existing text, so it doesn't matter that the overlay rewrites its text each tick.
// The dictionary is a public, gzip'd, CORS-open GCS object (built by build_dict.py).
(function () {
  'use strict';
  const DICT_URL = 'https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json';
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

  if (typeof module !== 'undefined' && module.exports) { module.exports = { isCJK, toneColor, fwdMatch }; return; }
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

    const reading = e => (mode === 'py' ? e.py : e.jy) || e.py || e.jy || '';
    const colourReading = r => r.split(' ').filter(Boolean)
      .map(s => '<span style="color:' + toneColor(s) + '">' + s + '</span>').join(' ');

    function render(m) {
      const rows = m.entries.slice(0, 5).map(e => {
        const rd = reading(e);
        const defs = e.d.slice(0, 4).join('; ');
        return '<div style="margin:3px 0"><span style="font-weight:600">' + (rd ? colourReading(rd) : '·') +
          '</span> <span style="color:#c9ccd1">' + defs + '</span></div>';
      }).join('');
      pop.innerHTML = '<div style="font-size:22px;font-weight:700;margin-bottom:2px">' + m.word + '</div>' + rows +
        '<div style="margin-top:5px;font-size:11px;color:#7b8087">' +
        (mode === 'py' ? 'pinyin' : 'jyutping') + ' · press r to switch</div>';
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

    box.addEventListener('mousemove', e => {
      const c = caret(e.clientX, e.clientY);
      if (!c || !c.node || c.node.nodeType !== 3) return hide();
      const text = c.node.nodeValue || '';
      if (!isCJK(text.charAt(c.off))) return hide();
      const m = fwdMatch(dict, text, c.off);
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
