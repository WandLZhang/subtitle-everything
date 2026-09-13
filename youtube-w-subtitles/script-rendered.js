// youtube-w-subtitles — RENDERED-CAPTION variant. Reads the captions YouTube is already drawing
// on screen instead of fetching a caption track, and makes every word hoverable.
//
// Use this when script.js / script-mandarin.js report no caption URL. PURCHASED and rented titles
// (Crunchyroll and friends sell episodes through YouTube) don't list `captionTracks` in the page
// source, and some never request `/api/timedtext` at all — the track arrives inside the media
// stream. There is nothing for a network hook to catch. The player still draws the text, so that
// is what this reads.
//
// Trade-off against script.js: no lookahead. Only the line on screen exists, so the English line
// is translated live, one cue at a time, instead of the whole episode up front. Results are cached
// per line, so a repeat costs nothing.
//
// SETUP: turn Subtitles/CC ON and pick the Chinese track — this reads whatever is displayed.
// Set READING to 'py' for a Mandarin show, 'jy' for Cantonese. Set KEY for the English line.
// NEVER commit a real key.
(async () => {
  const KEY = 'YOUR_GEMINI_API_KEY';
  const READING = 'py';                     // 'py' = pinyin with tone marks, 'jy' = jyutping
  const LANG = 'Mandarin Chinese';          // used only in the translation prompt
  const MODEL = 'gemini-flash-lite-latest';
  const DICT_URL = 'https://storage.googleapis.com/wz-canto-dict/canto-dict.min.json', MAX_WORD = 8;
  const CAP = '.ytp-caption-segment';

  const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  if (!player) { alert('No YouTube player found.'); return; }
  if (!document.querySelector(CAP)) {
    alert('No captions on screen.\nTurn Subtitles/CC on, pick the Chinese track, wait for a line to appear, then re-run.');
    return;
  }

  let D;
  try { D = (await (await fetch(DICT_URL)).json()).entries; }
  catch (e) { alert('Dictionary failed to load: ' + e.message); return; }
  console.log('[yt] dictionary ready —', Object.keys(D).length, 'headwords. Hover a caption word; press r to switch reading.');

  document.getElementById('yt-dict-pop')?.remove(); document.getElementById('yt-dict-en')?.remove();
  const pop = document.createElement('div'); pop.id = 'yt-dict-pop';
  pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:360px;padding:9px 12px;border-radius:8px;background:rgba(17,19,23,.97);color:#e8eaed;font-size:14px;line-height:1.45;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);display:none;text-align:left;font-family:"PingFang SC","Chiron Hei HK","Noto Sans SC",system-ui';
  document.body.appendChild(pop);
  const enLine = document.createElement('div'); enLine.id = 'yt-dict-en';
  enLine.style.cssText = 'position:absolute;left:50%;bottom:6%;transform:translateX(-50%);z-index:60;max-width:86%;padding:3px 12px;border-radius:7px;background:rgba(0,0,0,.78);color:#ffd479;font-size:19px;text-align:center;pointer-events:none;text-shadow:0 2px 4px #000;display:none;font-family:system-ui';
  player.appendChild(enLine);

  // pinyin tone marks: ni3 hao3 -> nǐ hǎo
  const MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
  const vowelIdx = s => { const l = s.toLowerCase(); let i = l.indexOf('a'); if (i >= 0) return i; i = l.indexOf('o'); if (i >= 0) return i; i = l.indexOf('e'); if (i >= 0) return i; let last = -1; for (let k = 0; k < l.length; k++) if ('iuü'.includes(l[k])) last = k; return last; };
  const accent = sy => { let s = sy.trim(); if (!s) return s; s = s.split('u:').join('ü').split('U:').join('Ü'); const last = s[s.length - 1]; if (last < '0' || last > '9') return s; const t = +last; s = s.slice(0, -1); if (t < 1 || t > 4) return s; const i = vowelIdx(s); if (i < 0) return s; const m = MARKS[s[i].toLowerCase()]; if (!m) return s; const ch = m[t - 1]; return s.slice(0, i) + (s[i] === s[i].toUpperCase() && s[i] !== s[i].toLowerCase() ? ch.toUpperCase() : ch) + s.slice(i + 1); };
  const isCJK = ch => { if (!ch) return false; const c = ch.codePointAt(0); return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff); };
  const tone = s => ({ '1': '#e15a5a', '2': '#e6a13a', '3': '#3fae4f', '4': '#5a8fe1', '5': '#b06fe0', '6': '#9aa0a6' }[(s || '').trim().slice(-1)] || '#c9ccd1');
  const fwd = (t, i) => { const m = Math.min(MAX_WORD, t.length - i); for (let n = m; n >= 1; n--) { const w = t.substr(i, n); if (D[w]) return { word: w, entries: D[w] }; } return null; };

  let mode = READING === 'jy' ? 'jy' : 'py', last = null;
  const compose = (word, key) => { const out = []; for (const ch of word) { const ce = D[ch]; const v = ce && ce[0] && (ce[0][key] || '').trim(); if (!v) return ''; out.push(v.split(' ')[0]); } return out.join(' '); };
  const readingFor = (word, e) => {
    const want = mode, other = mode === 'py' ? 'jy' : 'py';
    const own = (e[want] || '').trim(); if (own) return { rd: own, isPy: mode === 'py' };
    const c = compose(word, want); if (c) return { rd: c, isPy: mode === 'py' };
    return { rd: (e[other] || '').trim(), isPy: mode !== 'py', alt: true };
  };
  // DOM nodes, never innerHTML: YouTube enforces Trusted Types and rejects innerHTML outright.
  const render = m => {
    while (pop.firstChild) pop.removeChild(pop.firstChild);
    const head = document.createElement('div'); head.textContent = m.word;
    head.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:3px'; pop.appendChild(head);
    for (const e of m.entries.slice(0, 5)) {
      const row = document.createElement('div'); row.style.margin = '3px 0';
      const r = readingFor(m.word, e);
      for (const syl of (r.rd || '').split(' ')) { if (!syl) continue; const b = document.createElement('b'); b.textContent = (r.isPy ? accent(syl) : syl) + ' '; b.style.color = tone(syl); row.appendChild(b); }
      if (r.alt) { const w = document.createElement('span'); w.textContent = r.isPy ? '(pinyin — no jyutping) ' : '(jyutping — no pinyin) '; w.style.color = '#7b8087'; row.appendChild(w); }
      const d = document.createElement('span'); d.textContent = e.d.slice(0, 4).join('; '); d.style.color = '#c9ccd1'; row.appendChild(d);
      pop.appendChild(row);
    }
    const foot = document.createElement('div'); foot.textContent = (mode === 'py' ? 'pinyin' : 'jyutping') + ' · press r';
    foot.style.cssText = 'margin-top:5px;font-size:11px;color:#7b8087'; pop.appendChild(foot);
    pop.style.display = 'block';
  };
  const place = (x, y) => { const w = pop.offsetWidth, h = pop.offsetHeight; let nx = x + 14, ny = y + 14; if (nx + w > innerWidth) nx = x - w - 14; if (ny + h > innerHeight) ny = y - h - 14; pop.style.left = Math.max(4, nx) + 'px'; pop.style.top = Math.max(4, ny) + 'px'; };
  const hide = () => { pop.style.display = 'none'; last = null; };
  const caret = (x, y) => { if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; } if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; } return null; };
  // caret() gives an INSERTION POINT between characters, so hovering the right half of a character
  // returns the offset AFTER it and we looked up its neighbour. Pick the character whose own box
  // contains the cursor.
  const hitChar = (node, off, x) => { const len = (node.nodeValue || '').length, r = document.createRange(); for (const i of [off - 1, off]) { if (i < 0 || i >= len) continue; r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getBoundingClientRect(); if (x >= b.left && x <= b.right) return i; } return Math.min(off, len - 1); };

  // The caption elements are destroyed and rebuilt on every cue, so listen on document and test
  // the target. Nothing to re-bind, and it survives the player replacing its whole caption tree.
  const armed = new WeakSet();
  const arm = () => { for (const el of document.querySelectorAll('.ytp-caption-window-container, .caption-window, ' + CAP)) { if (!armed.has(el)) { el.style.pointerEvents = 'auto'; armed.add(el); } } };
  arm();
  document.addEventListener('mousemove', e => {
    const seg = e.target && e.target.closest && e.target.closest(CAP);
    if (!seg) return hide();
    const c = caret(e.clientX, e.clientY);
    if (!c || !c.node || c.node.nodeType !== 3) return hide();
    const t = c.node.nodeValue || '';
    const i = hitChar(c.node, c.off, e.clientX);
    if (!isCJK(t.charAt(i))) return hide();
    const m = fwd(t, i);
    if (!m) return hide();
    if (!last || last.word !== m.word) { last = m; render(m); }
    place(e.clientX, e.clientY);
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey && e.target.tagName !== 'INPUT') { mode = mode === 'py' ? 'jy' : 'py'; localStorage.setItem('yt-rendered-reading', mode); if (last) render(last); } });

  // ---- live English line ----
  const cache = new Map();
  const translate = async zh => {
    if (cache.has(zh)) return cache.get(zh);
    const pr = `Translate this ${LANG} subtitle line to natural English. Reply with the translation only, no quotes.\n\n${zh}`;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 256 } }),
      });
      const j = await r.json();
      const en = (j.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      cache.set(zh, en);
      return en;
    } catch (e) { return ''; }
  };

  const currentText = () => [...document.querySelectorAll(CAP)].map(s => s.textContent).join(' ').split('\n').join(' ').trim();
  let shown = '', seq = 0;
  clearInterval(window.__ytRenderTimer);
  window.__ytRenderTimer = setInterval(async () => {
    arm();
    const zh = currentText();
    if (zh === shown) return;
    shown = zh;
    if (!zh) { enLine.style.display = 'none'; return; }
    if (KEY === 'YOUR_GEMINI_API_KEY') return;
    const mine = ++seq;
    const en = await translate(zh);
    if (mine !== seq) return;                       // a newer line already won
    enLine.textContent = en;
    enLine.style.display = en ? 'block' : 'none';
  }, 250);

  console.log('[yt] reading rendered captions.' + (KEY === 'YOUR_GEMINI_API_KEY' ? ' No KEY — dictionary only.' : ' English line on.'));
})();
