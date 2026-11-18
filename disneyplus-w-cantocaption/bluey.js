// disneyplus-w-cantocaption — ONE paste. Overlays a CantoCaptions 口語 .srt on a Disney+
// episode, with a tap/hover dictionary (jyutping + English) and an optional Gemini English line.
//
// Disney+ is a hostile host compared with a plain web player, so this build handles:
//   · <video> hidden in shadow DOM, and several decoy <video> elements  -> picks the live one, locks to it
//   · Fullscreen API: only the fullscreen element's subtree renders     -> mounts the overlay INSIDE it
//   · the player swallowing keystrokes                                  -> on-screen sync buttons, no hotkeys
//   · subtitle timing that differs per episode                          -> wpSync(n) one-command calibration
//
// SETUP: set EPISODE below; set KEY only if you want the English line
// (mint at https://aistudio.google.com/apikey). NEVER commit a real key.
//
// USE: play the episode -> open the console (⌘⌥J / F12) -> paste this -> align (see README).
(async () => {
  const EPISODE = 'S02E35 The Quiet Game';        // <- must match the CantoCaptions filename
  const KEY = 'YOUR_GEMINI_API_KEY';              // optional English line; leave as-is for 口語 + dictionary
  const START_OFFSET = 9.5;                       // typical for Bluey S2; correct it with wpSync()

  const BASE = 'https://raw.githubusercontent.com/notHulK11/CantoCaptions/main/Subtitles/Series/Dubbed%20(AI-generated)/Bluey/S2/';
  const SRT = BASE + encodeURIComponent(`[AI GEN V2]Bluey - ${EPISODE}.yue.cht.srt`);
  const MODEL = 'gemini-flash-lite-latest', BATCH = 50, CONC = 8;
  const DICT_URL = 'https://storage.googleapis.com/wz-canto-dict/canto-dict.min.json', MAX_WORD = 8;

  const toMs = t => { t = t.trim().replace(',', '.'); const p = t.split(':'), s = (p[2] || '0').split('.'); return ((+p[0] * 60 + +p[1]) * 60 + +s[0]) * 1000 + +((s[1] || '0').padEnd(3, '0').slice(0, 3)); };
  const parse = x => { x = x.split('\r').join(''); if (x.charCodeAt(0) === 0xFEFF) x = x.slice(1); const c = []; for (const b of x.split('\n\n')) { const l = b.split('\n'); let i = l.findIndex(z => z.indexOf(' --> ') > -1); if (i < 0) continue; const tc = l[i].split(' --> '), s = toMs(tc[0]), e = toMs((tc[1] || '').split(' ')[0]), t = l.slice(i + 1).join('\n').trim(); if (t && e > s) c.push({ start: s, end: e, text: t, en: '' }); } return c; };
  let cues; try { cues = parse(await (await fetch(SRT)).text()); } catch (e) { alert('Could not load the .srt — check EPISODE matches the CantoCaptions filename.'); return; }
  window.__cues = cues;

  // pick the genuinely-playing <video> once, then lock to it (decoys have duration NaN / time 0)
  const allVideos = () => { const out = [], seen = new Set(); const walk = r => { for (const el of r.querySelectorAll('*')) { if (el.tagName === 'VIDEO') out.push(el); if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot); } } }; walk(document); return out; };
  window.__wpVideo = allVideos().slice().sort((a, b) => (b.currentTime > 0) - (a.currentTime > 0) || ((b.duration || 0) - (a.duration || 0)))[0];
  if (!window.__wpVideo) { alert('No <video> found — start playback first.'); return; }
  console.log(`[wp] ${cues.length} cues · video time now ${window.__wpVideo.currentTime.toFixed(1)}s`);

  document.getElementById('wp-overlay')?.remove(); document.getElementById('wp-pop')?.remove();
  const box = document.createElement('div'); box.id = 'wp-overlay';
  box.style.cssText = 'position:fixed;left:50%;bottom:10%;transform:translateX(-50%);z-index:2147483647;max-width:86%;text-align:center;pointer-events:auto;font-family:"Chiron Hei HK","PingFang HK","Noto Sans HK",system-ui';
  const mk = (c, s) => { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;margin:2px;padding:2px 10px;background:rgba(0,0,0,.6);border-radius:6px;color:' + c + ';font-size:' + s + 'px;text-shadow:0 2px 4px #000'; return d; };
  const zh = mk('#7fd7ff', 28), en = mk('#ffd479', 20), dbg = mk('#8a8f98', 12);
  const w1 = document.createElement('div'); w1.append(zh); const w2 = document.createElement('div'); w2.append(en); const w3 = document.createElement('div'); w3.append(dbg);
  box.append(w1, w2, w3);
  const pop = document.createElement('div'); pop.id = 'wp-pop';
  pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:340px;padding:8px 11px;border-radius:8px;background:rgba(17,19,23,.96);color:#e8eaed;font-size:14px;line-height:1.45;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);display:none;text-align:left;font-family:"Chiron Hei HK","PingFang HK","Noto Sans HK",system-ui';
  // in fullscreen only that element's subtree renders, so mount inside it and follow changes
  const mount = () => { const host = document.fullscreenElement || document.webkitFullscreenElement || document.body; if (box.parentNode !== host) host.appendChild(box); if (pop.parentNode !== host) host.appendChild(pop); };
  mount(); document.addEventListener('fullscreenchange', mount); document.addEventListener('webkitfullscreenchange', mount);

  window.SUB_OFFSET = START_OFFSET; window.SUB_DEBUG = true;
  const find = ms => { for (const c of cues) if (c.start <= ms && ms <= c.end) return c; return null; };
  clearInterval(window.__wpTimer);
  window.__wpTimer = setInterval(() => {
    mount(); const v = window.__wpVideo; if (!v) return;
    const t = v.currentTime + window.SUB_OFFSET, c = find(t * 1000);
    zh.textContent = c ? c.text : ''; en.textContent = c ? (c.en || '') : '';
    w1.style.visibility = c && c.text ? 'visible' : 'hidden';
    w2.style.visibility = c && c.en ? 'visible' : 'hidden';
    dbg.textContent = window.SUB_DEBUG ? `t=${t.toFixed(1)}  offset=${window.SUB_OFFSET}  ${c ? 'CUE' : '—'}` : '';
    w3.style.visibility = window.SUB_DEBUG ? 'visible' : 'hidden';
  }, 100);

  // exact calibration: run wpSync(n) the instant cue n is spoken (default: the first cue)
  window.wpSync = (n = 1) => { window.SUB_OFFSET = +(cues[Math.max(0, n - 1)].start / 1000 - window.__wpVideo.currentTime).toFixed(2); console.log('[wp] SUB_OFFSET =', window.SUB_OFFSET); return window.SUB_OFFSET; };

  // on-screen sync bar (Disney+ intercepts hotkeys, so buttons only)
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:8px;display:inline-flex;gap:6px;align-items:center;pointer-events:auto;background:rgba(0,0,0,.78);padding:7px 11px;border-radius:9px;font-family:system-ui;font-size:13px;color:#e8eaed';
  const lbl = document.createElement('span'); const upd = () => lbl.textContent = `offset ${window.SUB_OFFSET.toFixed(1)}s`;
  const mkb = (label, d) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'cursor:pointer;border:1px solid #5a5f68;background:#22252b;color:#e8eaed;border-radius:6px;padding:5px 10px;font-size:14px'; b.onmousedown = ev => { ev.preventDefault(); ev.stopPropagation(); }; b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); window.SUB_OFFSET = +(window.SUB_OFFSET + d).toFixed(2); upd(); }; return b; };
  const h1 = document.createElement('span'); h1.textContent = 'text before voice ←'; h1.style.color = '#9aa0a6';
  const h2 = document.createElement('span'); h2.textContent = '→ text after voice'; h2.style.color = '#9aa0a6';
  const done = document.createElement('button'); done.textContent = '✓ done';
  done.style.cssText = 'cursor:pointer;border:1px solid #3fae4f;background:#1e3d24;color:#c8f0cf;border-radius:6px;padding:5px 10px;margin-left:8px;font-size:13px';
  done.onmousedown = ev => { ev.preventDefault(); ev.stopPropagation(); };
  done.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); window.SUB_DEBUG = false; bar.remove(); };
  bar.append(h1, mkb('−5', -5), mkb('−0.5', -0.5), lbl, mkb('+0.5', 0.5), mkb('+5', 5), h2, done); upd(); box.append(bar);

  // hover dictionary (same public canto-dict as the other tools)
  const isCJK = ch => { if (!ch) return false; const c = ch.codePointAt(0); return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff); };
  const tone = s => ({ '1': '#e15a5a', '2': '#e6a13a', '3': '#3fae4f', '4': '#5a8fe1', '5': '#b06fe0', '6': '#9aa0a6' }[(s || '').trim().slice(-1)] || '#c9ccd1');
  const fwd = (d, t, i) => { const m = Math.min(MAX_WORD, t.length - i); for (let n = m; n >= 1; n--) { const w = t.substr(i, n); if (d[w]) return { word: w, entries: d[w] }; } return null; };
  (async () => {
    let D; try { D = (await (await fetch(DICT_URL)).json()).entries; } catch (e) { return console.warn('[wp] dictionary failed', e); }
    console.log('[wp] dictionary ready — hover a blue word; press r for pinyin.');
    let mode = localStorage.getItem('canto-dict-reading') === 'py' ? 'py' : 'jy', last = null;
    // Pinyin shows tone marks (jiàn dié) instead of digits (jian4 die2). Jyutping keeps its digits,
    // which are its standard notation. The colour still comes from the digit. Same logic as
    // browser-dictionary/dict-core.js, which carries the tests.
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
    // About 14% of headwords have pinyin and no jyutping, and the old fallback printed that Mandarin
    // under the "jyutping" label. Use the word's own reading, else build it per character, else show
    // the other language and say which it is.
    const compose = (word, want) => { const out = []; for (const ch of word) { const e = D[ch] && D[ch][0], v = e && (e[want] || '').trim(); if (!v) return ''; out.push(syllables(v)[0]); } return out.join(' '); };
    const readingFor = (word, e) => { const want = mode === 'py' ? 'py' : 'jy', other = want === 'py' ? 'jy' : 'py'; const own = (e[want] || '').trim(); if (own) return { text: own, isPinyin: want === 'py' }; const c = compose(word, want); if (c) return { text: c, isPinyin: want === 'py', composed: true }; return { text: (e[other] || '').trim(), isPinyin: other === 'py', wrongLang: true }; };
    const render = m => { while (pop.firstChild) pop.removeChild(pop.firstChild); const head = document.createElement('div'); head.textContent = m.word; head.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:3px'; pop.appendChild(head); for (const e of m.entries.slice(0, 5)) { const row = document.createElement('div'); row.style.margin = '3px 0'; const r = readingFor(m.word, e); if (r.text) { for (const syl of syllables(r.text)) { const b = document.createElement('b'); b.textContent = (r.isPinyin ? accent(syl) : syl) + ' '; b.style.color = tone(syl); row.appendChild(b); } } else { const b = document.createElement('b'); b.textContent = '· '; row.appendChild(b); } if (r.text && (r.wrongLang || r.composed)) { const n = document.createElement('span'); n.textContent = r.wrongLang ? (r.isPinyin ? '(pinyin, no jyutping) ' : '(jyutping, no pinyin) ') : '(per character) '; n.style.color = '#7b8087'; row.appendChild(n); } const d = document.createElement('span'); d.textContent = e.d.slice(0, 4).join('; '); d.style.color = '#c9ccd1'; row.appendChild(d); pop.appendChild(row); } const foot = document.createElement('div'); foot.textContent = (mode === 'py' ? 'pinyin' : 'jyutping') + ' · press r'; foot.style.cssText = 'margin-top:5px;font-size:11px;color:#7b8087'; pop.appendChild(foot); pop.style.display = 'block'; };
    const place = (x, y) => { const w = pop.offsetWidth, h = pop.offsetHeight; let nx = x + 14, ny = y + 14; if (nx + w > innerWidth) nx = x - w - 14; if (ny + h > innerHeight) ny = y - h - 14; pop.style.left = Math.max(4, nx) + 'px'; pop.style.top = Math.max(4, ny) + 'px'; };
    const hide = () => { pop.style.display = 'none'; last = null; };
    const caret = (x, y) => { if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; } if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; } return null; };
    // caret() gives an INSERTION POINT between characters, so hovering the right half of a
    // character returns the offset AFTER it and we looked up its neighbour. Pick the character
    // whose own box contains the cursor.
    const hitChar = (node, off, x) => { const len = (node.nodeValue || '').length, r = document.createRange(); for (const i of [off - 1, off]) { if (i < 0 || i >= len) continue; r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getBoundingClientRect(); if (x >= b.left && x <= b.right) return i; } return Math.min(off, len - 1); };
    box.addEventListener('mousemove', e => { const c = caret(e.clientX, e.clientY); if (!c || !c.node || c.node.nodeType !== 3) return hide(); const t = c.node.nodeValue || ''; const i = hitChar(c.node, c.off, e.clientX); if (!isCJK(t.charAt(i))) return hide(); const m = fwd(D, t, i); if (!m) return hide(); if (!last || last.word !== m.word) { last = m; render(m); } place(e.clientX, e.clientY); });
    box.addEventListener('mouseleave', hide);
    document.addEventListener('keydown', e => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) { mode = mode === 'py' ? 'jy' : 'py'; localStorage.setItem('canto-dict-reading', mode); if (last) render(last); } });
  })();

  if (KEY === 'YOUR_GEMINI_API_KEY') { console.log('[wp] no KEY — 口語 + dictionary only.'); return; }
  const tr = async texts => { const pr = 'Translate each Hong Kong colloquial-Cantonese subtitle to natural English (auto-transcribed; may have ASR errors — infer meaning). Return ONLY a JSON array of {"i":int,"en":string} for every input.\n\n' + JSON.stringify(texts.map((t, i) => ({ i, zh: t }))); for (let a = 0; a < 2; a++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } }) }); const j = await r.json(); const arr = JSON.parse(j.candidates[0].content.parts[0].text); const o = texts.map(() => ''); arr.forEach(x => { if (x.i >= 0 && x.i < o.length) o[x.i] = x.en; }); return o; } catch (e) { if (a) return texts.map(() => ''); } } };
  const st = []; for (let i = 0; i < cues.length; i += BATCH) st.push(i);
  for (let k = 0; k < st.length; k += CONC) await Promise.all(st.slice(k, k + CONC).map(async s => { const e = await tr(cues.slice(s, s + BATCH).map(c => c.text)); e.forEach((t, j) => cues[s + j].en = t); }));
  console.log('[wp] English ready.');
})();
