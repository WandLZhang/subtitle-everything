// youtube-w-subtitles — for titles the plain scripts can't read, including PURCHASED and rented
// ones (Crunchyroll and friends sell episodes through YouTube). Those don't list `captionTracks`
// in the page source, so nothing can be checked up front.
//
// It takes the best path available, in this order:
//   1. FETCH the Chinese track and pre-translate the whole episode with Gemini in batches. Both
//      lines then render together off one cue list — no lag. The track URL is signed, so it can
//      only be reused, never built: the script borrows it through the player.
//   2. MIRROR the captions YouTube draws, translating one line at a time. Always works, but it
//      can't start until the line is on screen, so the English lands a few hundred ms late.
//
// It renders into its own overlay either way. Hovering YouTube's caption elements wakes the
// control bar, which pushes the caption up from under the cursor; our copy sits still. YouTube's
// own line is hidden so only one shows — `ytNative(true)` puts it back.
//
// SETUP: turn Subtitles/CC ON and pick the Chinese track. Set READING to 'py' for a Mandarin show
// or 'jy' for Cantonese. Set KEY for the English line. NEVER commit a real key.
//
// USE_YT_ENGLISH borrows YouTube's own English track instead of translating. It is off because the
// English track does not always correspond to the Chinese one — on Link Click the two are
// unrelated. Turn it on only after checking a few lines against each other.
(async () => {
  const KEY = 'YOUR_GEMINI_API_KEY';
  const READING = 'py';                     // 'py' = pinyin with tone marks, 'jy' = jyutping
  const LANG = 'Mandarin Chinese';          // used only in the translation prompt
  const ZH = 'zh';                          // caption language prefix to fetch
  const USE_YT_ENGLISH = false;
  const MODEL = 'gemini-flash-lite-latest', BATCH = 50, CONC = 8;
  const DICT_URL = 'https://storage.googleapis.com/wz-canto-dict/canto-dict.min.json', MAX_WORD = 8;
  const CAP = '.ytp-caption-segment';

  const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  const video = document.querySelector('video');
  if (!player || !video) { alert('No YouTube player found.'); return; }

  // Remember every caption URL the player requests, keyed by language.
  //
  // Keep the video id. YouTube is a single-page app: moving to the next episode never reloads the
  // page, so both this map and the resource-timing buffer still hold caption URLs from whatever
  // you watched before. Loading one of those puts a completely different episode on screen. Every
  // URL carries `v`, so anything that isn't this video is dropped.
  const VID = new URLSearchParams(location.search).get('v') || '';
  if (window.YT_VID !== VID) { window.YT_TRACKS = {}; window.YT_VID = VID; }
  window.YT_TRACKS = window.YT_TRACKS || {};
  window.__ytNote = u => { try { const q = new URL(u, location.href).searchParams; const l = q.get('lang'); if (l && q.get('v') === VID) window.YT_TRACKS[l] = u; } catch (e) {} };
  if (!window.YT_HOOKED) {
    window.YT_HOOKED = true;
    const of = window.fetch;
    window.fetch = function (...a) { const u = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url); if (typeof u === 'string' && u.includes('timedtext')) window.__ytNote(u); return of.apply(this, a); };
    const oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u, ...a) { if (typeof u === 'string' && u.includes('timedtext')) window.__ytNote(u); return oo.call(this, m, u, ...a); };
  }
  for (const e of performance.getEntriesByType('resource')) if (e.name.includes('timedtext')) window.__ytNote(e.name);

  let D;
  try { D = (await (await fetch(DICT_URL)).json()).entries; }
  catch (e) { alert('Dictionary failed to load: ' + e.message); return; }
  console.log(`[yt] dictionary ready — ${Object.keys(D).length} headwords. video v=${VID}`);

  // ---- our overlay, mounted in the player so it survives fullscreen ----
  document.getElementById('yt-dict-pop')?.remove(); document.getElementById('yt-mirror')?.remove();
  const box = document.createElement('div'); box.id = 'yt-mirror';
  box.style.cssText = 'position:absolute;left:50%;bottom:13%;transform:translateX(-50%);z-index:60;max-width:90%;text-align:center;pointer-events:auto;font-family:"PingFang SC","Chiron Hei HK","Noto Sans SC",system-ui';
  const mk = (c, s) => { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;margin:2px;padding:3px 13px;background:rgba(0,0,0,.8);border-radius:7px;color:' + c + ';font-size:' + s + 'px;text-shadow:0 2px 4px #000'; return d; };
  const zhEl = mk('#7fd7ff', 28), enEl = mk('#ffd479', 19);
  const r1 = document.createElement('div'); r1.append(zhEl);
  const r2 = document.createElement('div'); r2.append(enEl);
  box.append(r1, r2); player.appendChild(box);
  const pop = document.createElement('div'); pop.id = 'yt-dict-pop';
  pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:360px;padding:9px 12px;border-radius:8px;background:rgba(17,19,23,.97);color:#e8eaed;font-size:14px;line-height:1.45;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);display:none;text-align:left;font-family:"PingFang SC","Chiron Hei HK","Noto Sans SC",system-ui';
  document.body.appendChild(pop);

  // opacity, not display — the player must keep writing text into these, because the mirror path
  // reads it.
  window.ytNative = (show = false) => { for (const el of document.querySelectorAll('.ytp-caption-window-container')) { el.style.opacity = show ? '1' : '0'; el.style.pointerEvents = 'none'; } };
  ytNative(false);

  // ---- borrow a signed track URL through the player ----
  let borrowing = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const opt = (k, v) => { try { return v === undefined ? player.getOption('captions', k) : player.setOption('captions', k, v); } catch (e) { return null; } };
  const seen = pre => Object.entries(window.YT_TRACKS).find(([l]) => l.toLowerCase().startsWith(pre));
  const borrow = async pre => {
    if (seen(pre)) return seen(pre);
    const list = opt('tracklist') || [];
    const want = list.find(t => (t.languageCode || '').toLowerCase().startsWith(pre));
    if (!want) { console.warn(`[yt] player lists no "${pre}" track:`, list.map(t => t.languageCode).join(', ') || '(none)'); return null; }
    const cur = opt('track');
    borrowing = true;
    try {
      opt('track', {});                     // off, then on — a re-select forces a fresh request
      await sleep(350);
      opt('track', want);
      for (let i = 0; i < 30 && !seen(pre); i++) await sleep(150);
    } finally {
      opt('track', cur && cur.languageCode ? cur : want);
      await sleep(300);
      borrowing = false;
    }
    return seen(pre);
  };
  const parseJson3 = data => {
    const out = [];
    for (const ev of (data.events || [])) {
      if (!ev.segs || ev.aAppend) continue;  // aAppend = rolling-window duplicate
      const t = ev.segs.map(s => s.utf8).join('').split('\n').join(' ').trim();
      if (t) out.push({ start: ev.tStartMs, end: ev.tStartMs + (ev.dDurationMs || 2000), text: t, en: '' });
    }
    out.sort((a, b) => a.start - b.start);
    for (let i = 0; i < out.length - 1; i++) if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start - 1;
    return out;
  };
  const pull = async hit => {
    const u = new URL(hit[1]); u.searchParams.delete('tlang'); u.searchParams.set('fmt', 'json3');
    try { return parseJson3(await (await fetch(u.toString())).json()); }
    catch (e) { console.warn('[yt] track fetch failed', e); return []; }
  };

  let cues = [];
  const zhHit = await borrow(ZH);
  if (zhHit) { cues = await pull(zhHit); console.log(`[yt] ${ZH} track "${zhHit[0]}" — ${cues.length} cues, preloading.`); }
  if (!cues.length) console.warn('[yt] no fetchable Chinese track — mirroring the rendered captions instead, English will lag a beat.');
  window.__cues = cues;

  const at = ms => { let lo = 0, hi = cues.length - 1, best = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m].start <= ms) { best = m; lo = m + 1; } else hi = m - 1; } if (best < 0) return null; const c = cues[best]; return ms <= c.end + 400 ? c : null; };

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

  // ---- render loop ----
  const nativeText = () => [...document.querySelectorAll(CAP)].map(s => s.textContent).join(' ').split('\n').join(' ').trim();
  const liveCache = new Map();
  let shownZh = '', seq = 0;
  const translateOne = async text => {
    if (liveCache.has(text)) return liveCache.get(text);
    const pr = `Translate this ${LANG} subtitle line to natural English. Reply with the translation only, no quotes.\n\n${text}`;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 256 } }) });
      const j = await r.json();
      const out = (j.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      liveCache.set(text, out);
      return out;
    } catch (e) { return ''; }
  };
  clearInterval(window.__ytRenderTimer);
  window.__ytRenderTimer = setInterval(() => {
    ytNative(false);
    if (borrowing) return;                  // a track swap is on screen; don't mirror it
    if (cues.length) {                      // preloaded: both lines come from one cue
      const c = at(video.currentTime * 1000);
      zhEl.textContent = c ? c.text : '';
      enEl.textContent = c ? (c.en || '') : '';
    } else {                                // mirror: translate the line that just appeared
      const text = nativeText();
      if (text !== shownZh) {
        shownZh = text;
        zhEl.textContent = text;
        if (!text || KEY === 'YOUR_GEMINI_API_KEY') enEl.textContent = '';
        else { const mine = ++seq; translateOne(text).then(out => { if (mine === seq) enEl.textContent = out; }); }
      }
    }
    r1.style.visibility = zhEl.textContent ? 'visible' : 'hidden';
    r2.style.visibility = enEl.textContent ? 'visible' : 'hidden';
  }, 120);
  console.log('[yt] rendering. ytNative(true) restores YouTube\'s own line.');

  // ---- English ----
  if (USE_YT_ENGLISH && cues.length) {
    const enHit = await borrow('en');
    if (enHit) {
      const enCues = await pull(enHit);
      for (const c of cues) {               // nearest English cue by start time
        let lo = 0, hi = enCues.length - 1, best = -1;
        while (lo <= hi) { const m = (lo + hi) >> 1; if (enCues[m].start <= c.start + 300) { best = m; lo = m + 1; } else hi = m - 1; }
        if (best >= 0) c.en = enCues[best].text;
      }
      console.log(`[yt] English from YouTube's own track — ${enCues.length} cues.`);
      return;
    }
  }
  if (KEY === 'YOUR_GEMINI_API_KEY') { console.log('[yt] no KEY — Chinese + dictionary only.'); return; }
  if (!cues.length) { console.log('[yt] English: Gemini, one line at a time.'); return; }

  // Pre-translate the whole episode, batched and parallel. Lines fill in as batches land, so the
  // start of the episode is usable within a couple of seconds.
  const tr = async texts => {
    const pr = `Translate each ${LANG} subtitle line to natural English. Return ONLY a JSON array of {"i":int,"en":string} for every input.\n\n` + JSON.stringify(texts.map((t, i) => ({ i, zh: t })));
    for (let a = 0; a < 2; a++) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } }) });
        const j = await r.json();
        const arr = JSON.parse(j.candidates[0].content.parts[0].text);
        const o = texts.map(() => '');
        arr.forEach(x => { if (x.i >= 0 && x.i < o.length) o[x.i] = x.en; });
        return o;
      } catch (e) { if (a) return texts.map(() => ''); }
    }
  };
  const starts = []; for (let i = 0; i < cues.length; i += BATCH) starts.push(i);
  let done = 0;
  for (let k = 0; k < starts.length; k += CONC) {
    await Promise.all(starts.slice(k, k + CONC).map(async s => {
      const out = await tr(cues.slice(s, s + BATCH).map(c => c.text));
      out.forEach((t, j) => cues[s + j].en = t);
      done += Math.min(BATCH, cues.length - s);
      console.log('[yt] translated', done, '/', cues.length);
    }));
  }
  console.log('[yt] English ready — in sync, whole episode.');
})();
