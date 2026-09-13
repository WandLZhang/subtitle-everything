// youtube-w-subtitles — RENDERED-CAPTION variant. Reads the captions YouTube is already drawing,
// mirrors them into our own overlay, and makes every word hoverable.
//
// Use this when script.js / script-mandarin.js report no caption URL. PURCHASED and rented titles
// (Crunchyroll and friends sell episodes through YouTube) don't list `captionTracks` in the page
// source, and some never request `/api/timedtext` at all — the track arrives inside the media
// stream. There is nothing for a network hook to catch. The player still draws the text, so that
// is what this reads.
//
// It mirrors rather than hovering YouTube's own caption elements, because pointing at those wakes
// the control bar, which pushes the captions up from under the cursor. Our copy sits still.
// YouTube's captions are then hidden so there is only one line on screen; `ytNative(true)` puts
// them back.
//
// The English line comes from whichever of these is available, best first:
//   1. YouTube's OWN English track. A human wrote it and the timings come with it, so it appears
//      WITH the Chinese instead of behind it, and it costs nothing. The script can only use it if
//      the player fetches captions over /api/timedtext. Switch Subtitles/CC to English once with
//      the script running, then back to Chinese, and it gets caught.
//   2. Gemini, one line at a time. Always works, but it cannot start until the Chinese line is on
//      screen, so the English lands a few hundred ms late. Lines are cached, so a repeat is free.
//
// SETUP: turn Subtitles/CC ON and pick the Chinese track. Set READING to 'py' for a Mandarin show
// or 'jy' for Cantonese. Set KEY for the Gemini fallback. NEVER commit a real key.
(async () => {
  const KEY = 'YOUR_GEMINI_API_KEY';
  const READING = 'py';                     // 'py' = pinyin with tone marks, 'jy' = jyutping
  const LANG = 'Mandarin Chinese';          // used only in the translation prompt
  const MODEL = 'gemini-flash-lite-latest';
  const DICT_URL = 'https://storage.googleapis.com/wz-canto-dict/canto-dict.min.json', MAX_WORD = 8;
  const CAP = '.ytp-caption-segment';

  const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  const video = document.querySelector('video');
  if (!player || !video) { alert('No YouTube player found.'); return; }
  if (!document.querySelector(CAP)) {
    alert('No captions on screen.\nTurn Subtitles/CC on, pick the Chinese track, wait for a line to appear, then re-run.');
    return;
  }

  // Remember every caption URL the player requests, keyed by language. Installed once and left in
  // place, so switching tracks later still registers. YT_TRACKS is created outside the guard —
  // an older script in this tab may have set YT_HOOKED without it, which left this empty forever.
  window.YT_TRACKS = window.YT_TRACKS || {};
  if (!window.YT_HOOKED) {
    window.YT_HOOKED = true;
    const note = u => { try { const l = new URL(u, location.href).searchParams.get('lang'); if (l) window.YT_TRACKS[l] = u; } catch (e) {} };
    const of = window.fetch;
    window.fetch = function (...a) { const u = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url); if (typeof u === 'string' && u.includes('timedtext')) note(u); return of.apply(this, a); };
    const oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u, ...a) { if (typeof u === 'string' && u.includes('timedtext')) note(u); return oo.call(this, m, u, ...a); };
  }
  for (const e of performance.getEntriesByType('resource')) if (e.name.includes('timedtext')) { try { const l = new URL(e.name).searchParams.get('lang'); if (l) window.YT_TRACKS[l] = e.name; } catch (x) {} }

  let D;
  try { D = (await (await fetch(DICT_URL)).json()).entries; }
  catch (e) { alert('Dictionary failed to load: ' + e.message); return; }
  console.log('[yt] dictionary ready —', Object.keys(D).length, 'headwords.');

  // ---- our overlay, mounted in the player so it survives fullscreen ----
  document.getElementById('yt-dict-pop')?.remove(); document.getElementById('yt-mirror')?.remove();
  const box = document.createElement('div'); box.id = 'yt-mirror';
  box.style.cssText = 'position:absolute;left:50%;bottom:13%;transform:translateX(-50%);z-index:60;max-width:90%;text-align:center;pointer-events:auto;font-family:"PingFang SC","Chiron Hei HK","Noto Sans SC",system-ui';
  const mk = (c, s) => { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;margin:2px;padding:3px 13px;background:rgba(0,0,0,.8);border-radius:7px;color:' + c + ';font-size:' + s + 'px;text-shadow:0 2px 4px #000'; return d; };
  const zh = mk('#7fd7ff', 28), en = mk('#ffd479', 19);
  const r1 = document.createElement('div'); r1.append(zh);
  const r2 = document.createElement('div'); r2.append(en);
  box.append(r1, r2); player.appendChild(box);
  const pop = document.createElement('div'); pop.id = 'yt-dict-pop';
  pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:360px;padding:9px 12px;border-radius:8px;background:rgba(17,19,23,.97);color:#e8eaed;font-size:14px;line-height:1.45;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);display:none;text-align:left;font-family:"PingFang SC","Chiron Hei HK","Noto Sans SC",system-ui';
  document.body.appendChild(pop);

  // Hide YouTube's own captions with opacity, not display — the player must keep writing text into
  // them, because that text is what we read.
  window.ytNative = (show = false) => { for (const el of document.querySelectorAll('.ytp-caption-window-container')) { el.style.opacity = show ? '1' : '0'; el.style.pointerEvents = 'none'; } };
  ytNative(false);

  // ---- English track, if the player ever fetched one ----
  const parseJson3 = data => {
    const out = [];
    for (const ev of (data.events || [])) {
      if (!ev.segs || ev.aAppend) continue;
      const t = ev.segs.map(s => s.utf8).join('').split('\n').join(' ').trim();
      if (t) out.push({ start: ev.tStartMs, end: ev.tStartMs + (ev.dDurationMs || 2000), text: t });
    }
    out.sort((a, b) => a.start - b.start);
    for (let i = 0; i < out.length - 1; i++) if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start - 1;
    return out;
  };
  let enCues = [], borrowing = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const seenEnglish = () => Object.entries(window.YT_TRACKS).find(([l]) => l.toLowerCase().startsWith('en'));
  const opt = (k, v) => { try { return v === undefined ? player.getOption('captions', k) : player.setOption('captions', k, v); } catch (e) { return null; } };

  const fetchEnglish = async () => {
    const hit = seenEnglish();
    if (!hit) return 0;
    const u = new URL(hit[1]); u.searchParams.delete('tlang'); u.searchParams.set('fmt', 'json3');
    try {
      enCues = parseJson3(await (await fetch(u.toString())).json());
      console.log(`[yt] English track "${hit[0]}" loaded — ${enCues.length} cues, in sync, Gemini off.`);
    } catch (e) { console.warn('[yt] English track fetch failed', e); }
    return enCues.length;
  };

  // Borrow the English track: flip the player to it just long enough for it to be requested, then
  // put the Chinese one back. Beats making you do it by hand, and the player API knows the exact
  // track objects. The mirror pauses meanwhile so the English never lands in the Chinese line.
  window.ytGrabEnglish = async () => {
    if (await fetchEnglish()) return enCues.length;
    const list = opt('tracklist') || [];
    console.log('[yt] player tracks:', list.map(t => t.languageCode || t.vss_id).join(', ') || '(none)');
    const enT = list.find(t => (t.languageCode || '').toLowerCase().startsWith('en'));
    const cur = opt('track');
    if (!enT || !cur) { console.warn('[yt] player API gave no track list — captions are not served over timedtext here. Staying on Gemini.'); return 0; }
    borrowing = true;
    try {
      opt('track', enT);
      for (let i = 0; i < 30 && !seenEnglish(); i++) await sleep(150);
    } finally {
      opt('track', cur);
      await sleep(300);
      borrowing = false;
    }
    if (!seenEnglish()) { console.warn('[yt] switched to English but no timedtext request followed — this title streams its captions. Staying on Gemini.'); return 0; }
    return await fetchEnglish();
  };
  await window.ytGrabEnglish();
  const enAt = ms => { let lo = 0, hi = enCues.length - 1, best = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (enCues[m].start <= ms) { best = m; lo = m + 1; } else hi = m - 1; } if (best < 0) return ''; const c = enCues[best]; return ms <= c.end + 400 ? c.text : ''; };

  // ---- readings ----
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
  box.addEventListener('mousemove', e => {
    const c = caret(e.clientX, e.clientY);
    if (!c || !c.node || c.node.nodeType !== 3) return hide();
    const t = c.node.nodeValue || '';
    const i = hitChar(c.node, c.off, e.clientX);
    if (!isCJK(t.charAt(i))) return hide();
    const m = fwd(t, i);
    if (!m) return hide();
    if (!last || last.word !== m.word) { last = m; render(m); }
    place(e.clientX, e.clientY);
  });
  box.addEventListener('mouseleave', hide);
  document.addEventListener('keydown', e => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey && e.target.tagName !== 'INPUT') { mode = mode === 'py' ? 'jy' : 'py'; if (last) render(last); } });

  // ---- Gemini fallback, one line at a time ----
  const cache = new Map();
  const translate = async text => {
    if (cache.has(text)) return cache.get(text);
    const pr = `Translate this ${LANG} subtitle line to natural English. Reply with the translation only, no quotes.\n\n${text}`;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 256 } }),
      });
      const j = await r.json();
      const out = (j.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      cache.set(text, out);
      return out;
    } catch (e) { return ''; }
  };

  const nativeText = () => [...document.querySelectorAll(CAP)].map(s => s.textContent).join(' ').split('\n').join(' ').trim();
  let shownZh = '', seq = 0;
  clearInterval(window.__ytRenderTimer);
  window.__ytRenderTimer = setInterval(async () => {
    ytNative(false);
    if (borrowing) return;                        // English is on screen right now; don't mirror it
    const text = nativeText();
    if (text !== shownZh) {
      shownZh = text;
      zh.textContent = text;
      r1.style.visibility = text ? 'visible' : 'hidden';
      if (!enCues.length) {                       // Gemini path: fire on each new line
        if (!text || KEY === 'YOUR_GEMINI_API_KEY') { en.textContent = ''; }
        else {
          const mine = ++seq;
          translate(text).then(out => { if (mine === seq) en.textContent = out; });
        }
      }
    }
    if (enCues.length) en.textContent = enAt(video.currentTime * 1000);
    r2.style.visibility = en.textContent ? 'visible' : 'hidden';
  }, 120);

  console.log('[yt] mirroring captions into our overlay. YouTube\'s own line is hidden — ytNative(true) restores it.');
  console.log('[yt] English source:', enCues.length ? 'YouTube track (in sync)' : (KEY === 'YOUR_GEMINI_API_KEY' ? 'none' : 'Gemini (lags a beat) — switch CC to English then back, and run ytGrabEnglish()'));
})();
