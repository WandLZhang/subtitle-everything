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
  const DICT_URL = 'https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json', MAX_WORD = 8;

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
    const rd = e => (mode === 'py' ? e.py : e.jy) || e.py || e.jy || '';
    const col = r => r.split(' ').filter(Boolean).map(s => '<span style="color:' + tone(s) + '">' + s + '</span>').join(' ');
    const render = m => { pop.innerHTML = '<div style="font-size:22px;font-weight:700;margin-bottom:2px">' + m.word + '</div>' + m.entries.slice(0, 5).map(e => '<div style="margin:3px 0"><b>' + (rd(e) ? col(rd(e)) : '·') + '</b> <span style="color:#c9ccd1">' + e.d.slice(0, 4).join('; ') + '</span></div>').join('') + '<div style="margin-top:5px;font-size:11px;color:#7b8087">' + (mode === 'py' ? 'pinyin' : 'jyutping') + ' · press r</div>'; pop.style.display = 'block'; };
    const place = (x, y) => { const w = pop.offsetWidth, h = pop.offsetHeight; let nx = x + 14, ny = y + 14; if (nx + w > innerWidth) nx = x - w - 14; if (ny + h > innerHeight) ny = y - h - 14; pop.style.left = Math.max(4, nx) + 'px'; pop.style.top = Math.max(4, ny) + 'px'; };
    const hide = () => { pop.style.display = 'none'; last = null; };
    const caret = (x, y) => { if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; } if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; } return null; };
    box.addEventListener('mousemove', e => { const c = caret(e.clientX, e.clientY); if (!c || !c.node || c.node.nodeType !== 3) return hide(); const t = c.node.nodeValue || ''; if (!isCJK(t.charAt(c.off))) return hide(); const m = fwd(D, t, c.off); if (!m) return hide(); if (!last || last.word !== m.word) { last = m; render(m); } place(e.clientX, e.clientY); });
    box.addEventListener('mouseleave', hide);
    document.addEventListener('keydown', e => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) { mode = mode === 'py' ? 'jy' : 'py'; localStorage.setItem('canto-dict-reading', mode); if (last) render(last); } });
  })();

  if (KEY === 'YOUR_GEMINI_API_KEY') { console.log('[wp] no KEY — 口語 + dictionary only.'); return; }
  const tr = async texts => { const pr = 'Translate each Hong Kong colloquial-Cantonese subtitle to natural English (auto-transcribed; may have ASR errors — infer meaning). Return ONLY a JSON array of {"i":int,"en":string} for every input.\n\n' + JSON.stringify(texts.map((t, i) => ({ i, zh: t }))); for (let a = 0; a < 2; a++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } }) }); const j = await r.json(); const arr = JSON.parse(j.candidates[0].content.parts[0].text); const o = texts.map(() => ''); arr.forEach(x => { if (x.i >= 0 && x.i < o.length) o[x.i] = x.en; }); return o; } catch (e) { if (a) return texts.map(() => ''); } } };
  const st = []; for (let i = 0; i < cues.length; i += BATCH) st.push(i);
  for (let k = 0; k < st.length; k += CONC) await Promise.all(st.slice(k, k + CONC).map(async s => { const e = await tr(cues.slice(s, s + BATCH).map(c => c.text)); e.forEach((t, j) => cues[s + j].en = t); }));
  console.log('[wp] English ready.');
})();
