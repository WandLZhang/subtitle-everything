// hkanime-w-cantocaption — ONE paste. Overlays an external 口語 .srt on the page's <video>,
// adds a Zhongwen-style hover dictionary (hover a word -> definition + jyutping; press r for
// pinyin), and — if you set KEY — an English translation line via Gemini.
//
// Edit the two consts below, then paste into the DevTools console (or save as a javascript:
// bookmarklet).
//
// Timing: community srts are timed to their own release (usually a BD), so they rarely line up
// with a streaming cut. Use the on-screen sync bar, or run wpSync(n) the instant cue n is
// spoken to set the offset exactly. Re-run wpSync() any time it drifts (e.g. after an OP that
// one release keeps and the other cuts) — the offset applies from then on.
(async () => {
  const SRT = 'https://raw.githubusercontent.com/notHulK11/CantoCaptions/main/Subtitles/Series/Dubbed%20(AI-generated)/Gintama%20(2006)/S1/%5BAI%20GEN%5D%20%5BJudas%5D%20Gintama%20-%20S01E01-E02%20(001-002).srt'; // <- the .srt to overlay
  const KEY = 'YOUR_GEMINI_API_KEY'; // optional English line (mint at https://aistudio.google.com/apikey); leave as-is for 口語 + dictionary only — no key needed
  const MODEL = 'gemini-flash-lite-latest', BATCH = 50, CONC = 8;
  const DICT_URL = 'https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json', MAX_WORD = 8;

  const toMs = t => { t = t.trim().replace(',', '.'); const p = t.split(':'), s = (p[2] || '0').split('.'); return ((+p[0] * 60 + +p[1]) * 60 + +s[0]) * 1000 + +((s[1] || '0').padEnd(3, '0').slice(0, 3)); };
  const parse = x => { x = x.split('\r').join(''); if (x.charCodeAt(0) === 0xFEFF) x = x.slice(1); const c = []; for (const b of x.split('\n\n')) { const l = b.split('\n'); let i = l.findIndex(z => z.indexOf(' --> ') > -1); if (i < 0) continue; const tc = l[i].split(' --> '), s = toMs(tc[0]), e = toMs((tc[1] || '').split(' ')[0]), t = l.slice(i + 1).join('\n').trim(); if (t && e > s) c.push({ start: s, end: e, text: t, en: '' }); } return c; };

  const v = document.querySelector('video'); if (!v) { alert('start playback first'); return; }
  const cues = parse(await (await fetch(SRT)).text());
  console.log('[wp] parsed', cues.length, 'cues');

  // ---- overlay (口語 shows immediately; English fills in later if KEY set) ----
  document.getElementById('wp-overlay')?.remove();
  const box = document.createElement('div'); box.id = 'wp-overlay';
  box.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:2147483647;max-width:86%;text-align:center;pointer-events:auto;font-family:"Chiron Hei HK","PingFang HK","Noto Sans HK",system-ui';
  const mk = (c, s) => { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;margin:2px;padding:2px 10px;background:rgba(0,0,0,.6);border-radius:6px;color:' + c + ';font-size:' + s + 'px;text-shadow:0 2px 4px #000'; return d; };
  const zh = mk('#7fd7ff', 26), en = mk('#ffd479', 20);
  const w1 = document.createElement('div'); w1.append(zh); const w2 = document.createElement('div'); w2.append(en); box.append(w1, w2); document.body.append(box);
  if (typeof window.SUB_OFFSET !== 'number') window.SUB_OFFSET = 0;
  const find = ms => { for (const c of cues) if (c.start <= ms && ms <= c.end) return c; return null; };
  v.addEventListener('timeupdate', () => { const c = find((v.currentTime + window.SUB_OFFSET) * 1000); zh.textContent = c ? c.text : ''; en.textContent = c ? (c.en || '') : ''; w1.style.visibility = c && c.text ? 'visible' : 'hidden'; w2.style.visibility = c && c.en ? 'visible' : 'hidden'; });

  // ---- sync: exact one-shot calibration, plus a click bar for nudging ----
  // wpSync(n): run it the moment cue n is spoken and the offset is computed from that instant.
  // Re-run any time to re-align (handles a release that cuts an OP the srt's source kept).
  window.wpSync = (n = 1) => { window.SUB_OFFSET = +(cues[Math.max(0, n - 1)].start / 1000 - v.currentTime).toFixed(2); console.log('[wp] SUB_OFFSET =', window.SUB_OFFSET); upd(); return window.SUB_OFFSET; };
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:8px;display:inline-flex;gap:6px;align-items:center;pointer-events:auto;background:rgba(0,0,0,.78);padding:7px 11px;border-radius:9px;font-family:system-ui;font-size:13px;color:#e8eaed';
  const lbl = document.createElement('span'); const upd = () => lbl.textContent = `offset ${window.SUB_OFFSET.toFixed(1)}s`;
  const mkb = (label, d) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'cursor:pointer;border:1px solid #5a5f68;background:#22252b;color:#e8eaed;border-radius:6px;padding:5px 10px;font-size:14px'; b.onmousedown = ev => { ev.preventDefault(); ev.stopPropagation(); }; b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); window.SUB_OFFSET = +(window.SUB_OFFSET + d).toFixed(2); upd(); }; return b; };
  const h1 = document.createElement('span'); h1.textContent = 'text before voice ←'; h1.style.color = '#9aa0a6';
  const h2 = document.createElement('span'); h2.textContent = '→ text after voice'; h2.style.color = '#9aa0a6';
  const hideBtn = document.createElement('button'); hideBtn.textContent = '✓ hide';
  hideBtn.style.cssText = 'cursor:pointer;border:1px solid #3fae4f;background:#1e3d24;color:#c8f0cf;border-radius:6px;padding:5px 10px;margin-left:8px;font-size:13px';
  hideBtn.onmousedown = ev => { ev.preventDefault(); ev.stopPropagation(); };
  hideBtn.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); bar.remove(); };
  bar.append(h1, mkb('−5', -5), mkb('−0.5', -0.5), lbl, mkb('+0.5', 0.5), mkb('+5', 5), h2, hideBtn); upd(); box.append(bar);

  // ---- hover dictionary (reads the hovered char via caretRangeFromPoint; no overlay change) ----
  const isCJK = ch => { if (!ch) return false; const c = ch.codePointAt(0); return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff); };
  const tone = s => ({ '1': '#e15a5a', '2': '#e6a13a', '3': '#3fae4f', '4': '#5a8fe1', '5': '#b06fe0', '6': '#9aa0a6' }[(s || '').trim().slice(-1)] || '#c9ccd1');
  const fwd = (d, t, i) => { const m = Math.min(MAX_WORD, t.length - i); for (let n = m; n >= 1; n--) { const w = t.substr(i, n); if (d[w]) return { word: w, entries: d[w] }; } return null; };
  (async () => {
    let D; try { D = (await (await fetch(DICT_URL)).json()).entries; } catch (e) { return console.warn('[wp] dictionary load failed', e); }
    console.log('[wp] dictionary ready —', Object.keys(D).length, 'headwords. Hover the blue line; press r for pinyin.');
    let mode = localStorage.getItem('canto-dict-reading') === 'py' ? 'py' : 'jy', last = null;
    const pop = document.createElement('div');
    pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:340px;padding:8px 11px;border-radius:8px;background:rgba(17,19,23,.96);color:#e8eaed;font-size:14px;line-height:1.45;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);display:none;text-align:left;font-family:"Chiron Hei HK","PingFang HK","Noto Sans HK",system-ui';
    document.body.append(pop);
    const rd = e => (mode === 'py' ? e.py : e.jy) || e.py || e.jy || '';
    const render = m => { while (pop.firstChild) pop.removeChild(pop.firstChild); const head = document.createElement('div'); head.textContent = m.word; head.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:3px'; pop.appendChild(head); for (const e of m.entries.slice(0, 5)) { const row = document.createElement('div'); row.style.margin = '3px 0'; const r = rd(e); if (r) { for (const syl of r.split(' ')) { if (!syl) continue; const b = document.createElement('b'); b.textContent = syl + ' '; b.style.color = tone(syl); row.appendChild(b); } } else { const b = document.createElement('b'); b.textContent = '· '; row.appendChild(b); } const d = document.createElement('span'); d.textContent = e.d.slice(0, 4).join('; '); d.style.color = '#c9ccd1'; row.appendChild(d); pop.appendChild(row); } const foot = document.createElement('div'); foot.textContent = (mode === 'py' ? 'pinyin' : 'jyutping') + ' · press r'; foot.style.cssText = 'margin-top:5px;font-size:11px;color:#7b8087'; pop.appendChild(foot); pop.style.display = 'block'; };
    const place = (x, y) => { const w = pop.offsetWidth, h = pop.offsetHeight; let nx = x + 14, ny = y + 14; if (nx + w > innerWidth) nx = x - w - 14; if (ny + h > innerHeight) ny = y - h - 14; pop.style.left = Math.max(4, nx) + 'px'; pop.style.top = Math.max(4, ny) + 'px'; };
    const hide = () => { pop.style.display = 'none'; last = null; };
    const caret = (x, y) => { if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, off: r.startOffset }; } if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, off: p.offset }; } return null; };
    box.addEventListener('mousemove', e => { const c = caret(e.clientX, e.clientY); if (!c || !c.node || c.node.nodeType !== 3) return hide(); const t = c.node.nodeValue || ''; if (!isCJK(t.charAt(c.off))) return hide(); const m = fwd(D, t, c.off); if (!m) return hide(); if (!last || last.word !== m.word) { last = m; render(m); } place(e.clientX, e.clientY); });
    box.addEventListener('mouseleave', hide);
    document.addEventListener('keydown', e => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) { mode = mode === 'py' ? 'jy' : 'py'; localStorage.setItem('canto-dict-reading', mode); if (last) render(last); } });
  })();

  // ---- optional English line (only if KEY is set) ----
  if (KEY === 'YOUR_GEMINI_API_KEY') { console.log('[wp] no KEY — 口語 + dictionary only (hover for meaning). Set KEY for an English line.'); return; }
  const tr = async texts => { const pr = 'Translate each Hong Kong colloquial-Cantonese subtitle to natural English (auto-transcribed; may have ASR errors — infer meaning). Return ONLY a JSON array of {"i":int,"en":string} for every input.\n\n' + JSON.stringify(texts.map((t, i) => ({ i, zh: t }))); for (let a = 0; a < 2; a++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } }) }); const j = await r.json(); const arr = JSON.parse(j.candidates[0].content.parts[0].text); const o = texts.map(() => ''); arr.forEach(x => { if (x.i >= 0 && x.i < o.length) o[x.i] = x.en; }); return o; } catch (e) { if (a) { console.warn('[wp] batch skipped', e.message); return texts.map(() => ''); } } } };
  const st = []; for (let i = 0; i < cues.length; i += BATCH) st.push(i); let done = 0;
  for (let k = 0; k < st.length; k += CONC) await Promise.all(st.slice(k, k + CONC).map(async s => { const e = await tr(cues.slice(s, s + BATCH).map(c => c.text)); e.forEach((t, j) => cues[s + j].en = t); done += Math.min(BATCH, cues.length - s); console.log('[wp] translated', done, '/', cues.length); }));
  window.__cues = cues; console.log('[wp] English done.');
})();
