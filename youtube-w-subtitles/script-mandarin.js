// youtube-w-subtitles — MANDARIN variant. Same capture trick as script.js, two differences:
//   1. It keeps the caption track you picked in the player (script.js strips &tlang to force the
//      original Cantonese; here the track you want IS the selected one, e.g. Chinese (Simplified)).
//   2. Pinyin is the default reading and it renders TONE MARKS (nǐ hǎo), not digits.
//
// Works on PURCHASED / rented titles too (Crunchyroll etc. sold through YouTube). Those don't list
// `captionTracks` in the page source, so nothing can be pre-checked — but the player still fetches
// the track over the network, which is what the fetch/XHR hook catches.
//
// USE: play the video, set Subtitles/CC to the Chinese track, paste this whole file in the console.
// If it says no URL was captured: Subtitles/CC -> Off -> Chinese again, then re-run.
// Set KEY for the English line. NEVER commit a real key.
(async () => {
  const KEY = 'YOUR_GEMINI_API_KEY';
  const MODEL = 'gemini-flash-lite-latest', BATCH = 50, CONC = 8;
  const DICT_URL = 'https://storage.googleapis.com/wz-canto-dict/canto-dict.min.json', MAX_WORD = 8;

  if (!window.YT_HOOKED) {
    window.YT_HOOKED = true; window.YT_URL = '';
    const of = window.fetch;
    window.fetch = function (...a) { const u = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url); if (typeof u === 'string' && u.includes('timedtext')) window.YT_URL = u; return of.apply(this, a); };
    const oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u, ...a) { if (typeof u === 'string' && u.includes('timedtext')) window.YT_URL = u; return oo.call(this, m, u, ...a); };
  }
  performance.getEntriesByType('resource').map(e => e.name).filter(u => u.includes('timedtext')).forEach(u => { window.YT_URL = u; });
  if (!window.YT_URL) {
    const b = document.querySelector('.ytp-subtitles-button');
    if (b) { b.click(); await new Promise(r => setTimeout(r, 600)); b.click(); await new Promise(r => setTimeout(r, 600)); b.click(); }
  }
  for (let i = 0; i < 40 && !window.YT_URL; i++) await new Promise(r => setTimeout(r, 250));
  if (!window.YT_URL) { alert('No caption URL captured.\nIn the player: Subtitles/CC -> Off, then back to Chinese (Simplified). Then re-run.'); return; }

  // keep the track you selected in the player (do NOT strip tlang here)
  const u = new URL(window.YT_URL); u.searchParams.set('fmt', 'json3');
  console.log('[yt] track lang=', u.searchParams.get('lang'), ' tlang=', u.searchParams.get('tlang') || '(none)');
  const data = await (await fetch(u.toString())).json();
  const cues = [];
  for (const ev of (data.events || [])) {
    if (!ev.segs || ev.aAppend) continue;
    const text = ev.segs.map(s => s.utf8).join('').split('\n').join(' ').trim();
    if (text) cues.push({ start: ev.tStartMs, end: ev.tStartMs + (ev.dDurationMs || 2000), text, en: '' });
  }
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start - 1;
  window.__cues = cues;
  console.log(`[yt] ${cues.length} cues`);
  if (!cues.length) { alert('Captured a track but it had no cues — switch subtitle language off/on and re-run.'); return; }

  const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  const video = document.querySelector('video');
  document.getElementById('yt-dict-overlay')?.remove(); document.getElementById('yt-dict-pop')?.remove();
  clearInterval(window.__ytTimer);
  const box = document.createElement('div'); box.id = 'yt-dict-overlay';
  box.style.cssText = 'position:absolute;left:50%;bottom:12%;transform:translateX(-50%);z-index:1000;max-width:88%;text-align:center;pointer-events:auto;font-family:"PingFang SC","Noto Sans SC","Microsoft YaHei",system-ui';
  const mk = (c, s) => { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;margin:2px;padding:3px 12px;background:rgba(0,0,0,.78);border-radius:7px;color:' + c + ';font-size:' + s + 'px;text-shadow:0 2px 4px #000'; return d; };
  const zh = mk('#7fd7ff', 27), en = mk('#ffd479', 19);
  const r1 = document.createElement('div'); r1.append(zh); const r2 = document.createElement('div'); r2.append(en);
  box.append(r1, r2); player.appendChild(box);
  const pop = document.createElement('div'); pop.id = 'yt-dict-pop';
  pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:360px;padding:9px 12px;border-radius:8px;background:rgba(17,19,23,.97);color:#e8eaed;font-size:14px;line-height:1.45;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);display:none;text-align:left';
  document.body.appendChild(pop);

  const findCue = ms => { let lo = 0, hi = cues.length - 1, best = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m].start <= ms) { best = m; lo = m + 1; } else hi = m - 1; } if (best < 0) return null; const c = cues[best]; return ms <= c.end + 400 ? c : null; };
  window.__ytTimer = setInterval(() => {
    const c = findCue(video.currentTime * 1000);
    zh.textContent = c ? c.text : ''; en.textContent = c ? (c.en || '') : '';
    r1.style.visibility = c && c.text ? 'visible' : 'hidden';
    r2.style.visibility = c && c.en ? 'visible' : 'hidden';
  }, 100);

  // Pinyin tone marks: ni3 hao3 -> nǐ hǎo. Jyutping keeps its digits, which are its standard
  // notation. The colour still comes from the digit. Same logic as browser-dictionary/dict-core.js,
  // which carries the tests.
  const MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ', A: 'ĀÁǍÀ', E: 'ĒÉĚÈ', I: 'ĪÍǏÌ', O: 'ŌÓǑÒ', U: 'ŪÚǓÙ', 'Ü': 'ǕǗǙǛ', n: ['n\u0304', 'ń', 'ň', 'ǹ'], m: ['m\u0304', 'ḿ', 'm\u030C', 'm\u0300'], N: ['N\u0304', 'Ń', 'Ň', 'Ǹ'], M: ['M\u0304', 'Ḿ', 'M\u030C', 'M\u0300'] };
  const vowelIndex = s => { const l = s.toLowerCase(); for (const v of 'aoe') { const i = l.indexOf(v); if (i >= 0) return i; } let k = -1; for (let j = 0; j < l.length; j++) if ('iuü'.includes(l[j])) k = j; if (k < 0) { const n = l.indexOf('n'), m = l.indexOf('m'); k = n < 0 ? m : m < 0 ? n : Math.min(n, m); } return k; };
  // CC-CEDICT writes ü as "u:" and CC-Canto often as "v" (nv3, lv4). Convert only inside a toned
  // syllable, so a bare "V" (V領) stays a V. A piece with no letters is a number (雙11) and keeps its
  // digits. Syllabic nasals (唔 n2, 呣 m2) take the mark on the n or m.
  const accent = sy => { const o = (sy || '').trim(), dg = o.charAt(o.length - 1); if (!o || dg < '0' || dg > '9') return o; const s = o.slice(0, -1).split('u:').join('ü').split('U:').join('Ü').split('v').join('ü').split('V').join('Ü'), t = +dg; if (![...s].some(c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === 'ü' || c === 'Ü')) return o; if (t < 1 || t > 4) return s; const i = vowelIndex(s), mk = i < 0 ? null : MARKS[s.charAt(i)]; return mk ? s.slice(0, i) + mk[t - 1] + s.slice(i + 1) : o; };
  // Readings are space-separated, but CC-Canto glues some syllables together (yi1ju4) and leaves
  // punctuation on others (da3,). Cutting after each tone digit gives every syllable its own mark
  // and colour.
  const syllables = rd => { const out = []; for (const tok of (rd || '').split(' ')) { let cur = ''; for (let i = 0; i < tok.length; i++) { cur += tok[i]; const dg = tok[i] >= '0' && tok[i] <= '9', nx = tok[i + 1] >= '0' && tok[i + 1] <= '9'; if (dg && !nx) { out.push(cur); cur = ''; } } if (cur) out.push(cur); } return out; };
  const isCJK = ch => { if (!ch) return false; const c = ch.codePointAt(0); return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff); };
  const tone = s => ({ '1': '#e15a5a', '2': '#e6a13a', '3': '#3fae4f', '4': '#5a8fe1', '5': '#b06fe0', '6': '#9aa0a6' }[(s || '').trim().slice(-1)] || '#c9ccd1');
  const fwd = (d, t, i) => { const m = Math.min(MAX_WORD, t.length - i); for (let n = m; n >= 1; n--) { const w = t.substr(i, n); if (d[w]) return { word: w, entries: d[w] }; } return null; };
  (async () => {
    let D; try { D = (await (await fetch(DICT_URL)).json()).entries; } catch (e) { return console.warn('[yt] dictionary failed', e); }
    console.log('[yt] dictionary ready — hover a word. Press r to switch pinyin/jyutping.');
    let mode = localStorage.getItem('mand-dict-reading') || 'py';       // Mandarin show -> pinyin default
    let last = null;
    const compose = (word, key) => { const out = []; for (const ch of word) { const ce = D[ch]; const v = ce && ce[0] && (ce[0][key] || '').trim(); if (!v) return ''; out.push(syllables(v)[0]); } return out.join(' '); };
    const readingFor = (word, e) => { const want = mode === 'py' ? 'py' : 'jy', other = mode === 'py' ? 'jy' : 'py';
      const own = (e[want] || '').trim(); if (own) return { rd: own, isPy: mode === 'py' };
      const c = compose(word, want); if (c) return { rd: c, isPy: mode === 'py' };
      return { rd: (e[other] || '').trim(), isPy: mode !== 'py', alt: true }; };
    const render = m => {
      while (pop.firstChild) pop.removeChild(pop.firstChild);
      const head = document.createElement('div'); head.textContent = m.word;
      head.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:3px'; pop.appendChild(head);
      for (const e of m.entries.slice(0, 5)) {
        const row = document.createElement('div'); row.style.margin = '3px 0';
        const r = readingFor(m.word, e);
        for (const syl of syllables(r.rd)) { const b = document.createElement('b'); b.textContent = (r.isPy ? accent(syl) : syl) + ' '; b.style.color = tone(syl); row.appendChild(b); }
        if (r.alt) { const w = document.createElement('span'); w.textContent = (r.isPy ? '(pinyin — no jyutping) ' : '(jyutping — no pinyin) '); w.style.color = '#7b8087'; row.appendChild(w); }
        const d2 = document.createElement('span'); d2.textContent = e.d.slice(0, 4).join('; '); d2.style.color = '#c9ccd1'; row.appendChild(d2);
        pop.appendChild(row);
      }
      const foot = document.createElement('div'); foot.textContent = (mode === 'py' ? 'pinyin' : 'jyutping') + ' · press r';
      foot.style.cssText = 'margin-top:5px;font-size:11px;color:#7b8087'; pop.appendChild(foot);
      pop.style.display = 'block';
    };
    const place = (x, y) => { const w = pop.offsetWidth, h = pop.offsetHeight; let nx = x + 14, ny = y + 14; if (nx + w > innerWidth) nx = x - w - 14; if (ny + h > innerHeight) ny = y - h - 14; pop.style.left = Math.max(4, nx) + 'px'; pop.style.top = Math.max(4, ny) + 'px'; };
    const hide = () => { pop.style.display = 'none'; last = null; };
    const caret = (x, y) => { if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; } if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; } return null; };
    // caret() gives an INSERTION POINT between characters, so hovering the right half of a
    // character returns the offset AFTER it and we looked up its neighbour. Pick the character
    // whose own box contains the cursor.
    const hitChar = (node, off, x) => { const len = (node.nodeValue || '').length, r = document.createRange(); for (const i of [off - 1, off]) { if (i < 0 || i >= len) continue; r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getBoundingClientRect(); if (x >= b.left && x <= b.right) return i; } return Math.min(off, len - 1); };
    box.addEventListener('mousemove', e => { const c = caret(e.clientX, e.clientY); if (!c || !c.node || c.node.nodeType !== 3) return hide(); const t = c.node.nodeValue || ''; const i = hitChar(c.node, c.off, e.clientX); if (!isCJK(t.charAt(i))) return hide(); const m = fwd(D, t, i); if (!m) return hide(); if (!last || last.word !== m.word) { last = m; render(m); } place(e.clientX, e.clientY); });
    box.addEventListener('mouseleave', hide);
    document.addEventListener('keydown', e => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey && e.target.tagName !== 'INPUT') { mode = mode === 'py' ? 'jy' : 'py'; localStorage.setItem('mand-dict-reading', mode); if (last) render(last); } });
  })();

  if (!KEY) return;
  const tr = async texts => { const pr = 'Translate each Mandarin Chinese subtitle line to natural English. Return ONLY a JSON array of {"i":int,"en":string} for every input.\n\n' + JSON.stringify(texts.map((t, i) => ({ i, zh: t }))); for (let a = 0; a < 2; a++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } }) }); const j = await r.json(); const arr = JSON.parse(j.candidates[0].content.parts[0].text); const o = texts.map(() => ''); arr.forEach(x => { if (x.i >= 0 && x.i < o.length) o[x.i] = x.en; }); return o; } catch (e) { if (a) return texts.map(() => ''); } } };
  const st = []; for (let i = 0; i < cues.length; i += BATCH) st.push(i); let n = 0;
  for (let k = 0; k < st.length; k += CONC) await Promise.all(st.slice(k, k + CONC).map(async s => { const e = await tr(cues.slice(s, s + BATCH).map(c => c.text)); e.forEach((t, j) => cues[s + j].en = t); n += Math.min(BATCH, cues.length - s); console.log('[yt] translated', n, '/', cues.length); }));
  console.log('[yt] English ready.');
})();
