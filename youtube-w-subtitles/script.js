// youtube-w-subtitles/script.js — ONE paste. Renders YouTube's ORIGINAL Cantonese caption
// track (not YouTube's translation) in our own overlay, with the tap/hover dictionary
// (tone-coloured jyutping + English) and an optional Gemini English line.
//
// Earlier versions asked YouTube to translate the track (&tlang=en), but its MT on colloquial
// Cantonese is poor. We now drop tlang, keep the 口語 ASR text, and translate with Gemini
// instead — and every word becomes hoverable.
//
// Three YouTube-specific gotchas handled:
//   · captions are behind a signed URL (PoP/`pot`)  -> hook fetch/XHR, reuse the player's own URL
//   · ASR cues OVERLAP the following cue            -> trim to the next start + pick the LATEST cue,
//                                                      otherwise the overlay drifts behind the speech
//   · YouTube enforces Trusted Types                -> popup is built from DOM nodes, never innerHTML
//
// SETUP: set KEY only if you want the English line (https://aistudio.google.com/apikey).
// NEVER commit a real key.
//
// USE: open the video -> console (⌘⌥J / F12) -> paste. CC may be off; it toggles CC on to
// capture the signed URL and back off again so you don't get two sets of subtitles.
(async () => {
  const KEY = 'YOUR_GEMINI_API_KEY';
  const MODEL = 'gemini-flash-lite-latest', BATCH = 50, CONC = 8;
  const DICT_URL = 'https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json', MAX_WORD = 8;

  // 1. hook the network and grab the player's signed timedtext URL
  if (!window.YT_HOOKED) {
    window.YT_HOOKED = true; window.YT_URL = '';
    const of = window.fetch;
    window.fetch = function (...a) { const u = a[0]; if (typeof u === 'string' && u.includes('timedtext')) window.YT_URL = u; return of.apply(this, a); };
    const oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u, ...a) { if (typeof u === 'string' && u.includes('timedtext')) window.YT_URL = u; return oo.call(this, m, u, ...a); };
  }
  const ccBtn = document.querySelector('.ytp-subtitles-button');
  const ccWasOff = ccBtn && ccBtn.getAttribute('aria-pressed') === 'false';
  if (ccWasOff) { ccBtn.click(); console.log('[yt] CC on to capture the signed URL…'); }
  for (let i = 0; i < 40 && !window.YT_URL; i++) await new Promise(r => setTimeout(r, 250));
  if (!window.YT_URL) { alert('No caption URL captured — toggle CC off/on manually, then re-run.'); return; }

  // 2. fetch the ORIGINAL track (no tlang -> no YouTube translation)
  const u = new URL(window.YT_URL); u.searchParams.delete('tlang'); u.searchParams.set('fmt', 'json3');
  const data = await (await fetch(u.toString())).json();
  const cues = [];
  for (const ev of (data.events || [])) {
    if (!ev.segs || ev.aAppend) continue;                   // aAppend = rolling-window duplicate
    const text = ev.segs.map(s => s.utf8).join('').split('\n').join(' ').trim();
    if (text) cues.push({ start: ev.tStartMs, end: ev.tStartMs + (ev.dDurationMs || 2000), text, en: '' });
  }
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start - 1;
  window.__cues = cues;
  console.log(`[yt] ${cues.length} Cantonese cues (original ASR)`);
  if (ccWasOff && ccBtn) ccBtn.click();                     // hide YouTube's own captions again

  // 3. overlay inside the player (so it survives fullscreen)
  const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  const video = document.querySelector('video.html5-main-video');
  document.getElementById('yt-dict-overlay')?.remove(); document.getElementById('yt-dict-pop')?.remove();
  clearInterval(window.__ytTimer);
  const box = document.createElement('div'); box.id = 'yt-dict-overlay';
  box.style.cssText = 'position:absolute;left:50%;bottom:11%;transform:translateX(-50%);z-index:1000;max-width:88%;text-align:center;pointer-events:auto;font-family:"Chiron Hei HK","PingFang HK","Noto Sans HK",system-ui';
  const mk = (c, s) => { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;margin:2px;padding:3px 12px;background:rgba(0,0,0,.72);border-radius:7px;color:' + c + ';font-size:' + s + 'px;text-shadow:0 2px 4px #000'; return d; };
  const zh = mk('#7fd7ff', 27), en = mk('#ffd479', 19);
  const r1 = document.createElement('div'); r1.append(zh); const r2 = document.createElement('div'); r2.append(en);
  box.append(r1, r2); player.appendChild(box);
  const pop = document.createElement('div'); pop.id = 'yt-dict-pop';
  pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:360px;padding:9px 12px;border-radius:8px;background:rgba(17,19,23,.97);color:#e8eaed;font-size:14px;line-height:1.45;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);display:none;text-align:left;font-family:"Chiron Hei HK","PingFang HK","Noto Sans HK",system-ui';
  document.body.appendChild(pop);

  // latest cue at or before now — never a stale overlapping one
  const findCue = ms => {
    let lo = 0, hi = cues.length - 1, best = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m].start <= ms) { best = m; lo = m + 1; } else hi = m - 1; }
    if (best < 0) return null;
    const c = cues[best];
    return ms <= c.end + 400 ? c : null;
  };
  window.__ytTimer = setInterval(() => {
    const c = findCue(video.currentTime * 1000);
    zh.textContent = c ? c.text : ''; en.textContent = c ? (c.en || '') : '';
    r1.style.visibility = c && c.text ? 'visible' : 'hidden';
    r2.style.visibility = c && c.en ? 'visible' : 'hidden';
  }, 100);

  // 4. hover dictionary (shared public canto-dict)
  const isCJK = ch => { if (!ch) return false; const c = ch.codePointAt(0); return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff); };
  const tone = s => ({ '1': '#e15a5a', '2': '#e6a13a', '3': '#3fae4f', '4': '#5a8fe1', '5': '#b06fe0', '6': '#9aa0a6' }[(s || '').trim().slice(-1)] || '#c9ccd1');
  const fwd = (d, t, i) => { const m = Math.min(MAX_WORD, t.length - i); for (let n = m; n >= 1; n--) { const w = t.substr(i, n); if (d[w]) return { word: w, entries: d[w] }; } return null; };
  (async () => {
    let D; try { D = (await (await fetch(DICT_URL)).json()).entries; } catch (e) { return console.warn('[yt] dictionary failed', e); }
    console.log('[yt] dictionary ready — hover a blue word; press r for pinyin.');
    let mode = localStorage.getItem('canto-dict-reading') === 'py' ? 'py' : 'jy', last = null;
    const rd = e => (mode === 'py' ? e.py : e.jy) || e.py || e.jy || '';
    const render = m => {
      while (pop.firstChild) pop.removeChild(pop.firstChild);
      const head = document.createElement('div'); head.textContent = m.word;
      head.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:3px'; pop.appendChild(head);
      for (const e of m.entries.slice(0, 5)) {
        const row = document.createElement('div'); row.style.margin = '3px 0';
        const r = rd(e);
        if (r) { for (const syl of r.split(' ')) { if (!syl) continue; const b = document.createElement('b'); b.textContent = syl + ' '; b.style.color = tone(syl); row.appendChild(b); } }
        else { const b = document.createElement('b'); b.textContent = '· '; row.appendChild(b); }
        const d = document.createElement('span'); d.textContent = e.d.slice(0, 4).join('; '); d.style.color = '#c9ccd1';
        row.appendChild(d); pop.appendChild(row);
      }
      const foot = document.createElement('div');
      foot.textContent = (mode === 'py' ? 'pinyin' : 'jyutping') + ' · press r';
      foot.style.cssText = 'margin-top:5px;font-size:11px;color:#7b8087';
      pop.appendChild(foot); pop.style.display = 'block';
    };
    const place = (x, y) => { const w = pop.offsetWidth, h = pop.offsetHeight; let nx = x + 14, ny = y + 14; if (nx + w > innerWidth) nx = x - w - 14; if (ny + h > innerHeight) ny = y - h - 14; pop.style.left = Math.max(4, nx) + 'px'; pop.style.top = Math.max(4, ny) + 'px'; };
    const hide = () => { pop.style.display = 'none'; last = null; };
    const caret = (x, y) => { if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; } if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; } return null; };
    box.addEventListener('mousemove', e => { const c = caret(e.clientX, e.clientY); if (!c || !c.node || c.node.nodeType !== 3) return hide(); const t = c.node.nodeValue || ''; if (!isCJK(t.charAt(c.off))) return hide(); const m = fwd(D, t, c.off); if (!m) return hide(); if (!last || last.word !== m.word) { last = m; render(m); } place(e.clientX, e.clientY); });
    box.addEventListener('mouseleave', hide);
    document.addEventListener('keydown', e => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey && e.target.tagName !== 'INPUT') { mode = mode === 'py' ? 'jy' : 'py'; localStorage.setItem('canto-dict-reading', mode); if (last) render(last); } });
  })();

  // 5. English line via Gemini (reads far better than YouTube's MT on 口語)
  if (KEY === 'YOUR_GEMINI_API_KEY') { console.log('[yt] no KEY — 口語 + dictionary only.'); return; }
  const tr = async texts => { const pr = 'Translate each Hong Kong colloquial-Cantonese subtitle to natural English (auto-transcribed; may have ASR errors — infer meaning). Return ONLY a JSON array of {"i":int,"en":string} for every input.\n\n' + JSON.stringify(texts.map((t, i) => ({ i, zh: t }))); for (let a = 0; a < 2; a++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } }) }); const j = await r.json(); const arr = JSON.parse(j.candidates[0].content.parts[0].text); const o = texts.map(() => ''); arr.forEach(x => { if (x.i >= 0 && x.i < o.length) o[x.i] = x.en; }); return o; } catch (e) { if (a) return texts.map(() => ''); } } };
  const st = []; for (let i = 0; i < cues.length; i += BATCH) st.push(i);
  for (let k = 0; k < st.length; k += CONC) await Promise.all(st.slice(k, k + CONC).map(async s => { const e = await tr(cues.slice(s, s + BATCH).map(c => c.text)); e.forEach((t, j) => cues[s + j].en = t); }));
  console.log('[yt] English ready.');
})();
