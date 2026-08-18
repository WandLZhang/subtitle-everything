// hkanime-w-cantocaption — ONE paste. Overlays a CantoCaptions 口語 .srt on hkanime, with a
// scrollable phrase strip (click the line you actually hear to sync), a hover dictionary
// (tone-coloured jyutping + English), and an optional Gemini English line.
//
// SETUP: set SHOW + EP below. EP is the hkanime `x` number PLUS ONE (hkanime is 0-indexed:
// /122x51 is episode 52). Set KEY only if you want the English line. NEVER commit a real key.
//
// SYNCING: community srts are timed to their own release (usually a BD), so they won't match a
// stream out of the box. Just CLICK the phrase in the strip that you're hearing right now — the
// offset snaps to it. Click again any time it drifts. ✂ cut here adds a breakpoint when a stream
// removes something mid-episode (see Code Geass below), so each stretch keeps its own offset.
(async () => {
  const SHOW = 'sakura';                 // sakura | codegeass | gintama | hxh | drslump
  const EP = 1;                          // hkanime x-number + 1
  const KEY = 'YOUR_GEMINI_API_KEY';     // optional English line (https://aistudio.google.com/apikey)

  const MODEL = 'gemini-flash-lite-latest', BATCH = 50, CONC = 8;
  const DICT_URL = 'https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json', MAX_WORD = 8;
  const RADIUS = 4;                      // phrases shown either side in the strip

  // ---- show registry -------------------------------------------------------------------
  // Each show returns candidate URLs, tried in order until one exists. Candidates (rather than
  // one formula) absorb the per-show quirks noted in the README: Gintama's paired first file,
  // Dr. Slump's odd E001 suffix, Code Geass's per-season renumbering.
  const RAW = 'https://raw.githubusercontent.com/notHulK11/CantoCaptions/main/Subtitles/Series/Dubbed%20(AI-generated)/';
  const p2 = n => String(n).padStart(2, '0'), p3 = n => String(n).padStart(3, '0'), enc = encodeURIComponent;
  const SHOWS = {
    sakura: {
      title: '百變小櫻 MAGIC 咭 · Cardcaptor Sakura (70 eps)',
      urls: ep => [RAW + 'Cardcaptor%20Sakura%20%5B1%5D%20-%20Original%20(1998)/' + enc(`[AI GEN V3][MiniMTBB] Cardcaptor Sakura.E${p2(ep)}.BD.yue.cht.srt`)],
    },
    codegeass: {
      title: '叛逆的魯魯修 · Code Geass (50 eps, S1+S2)',
      // hkanime cuts the ~92.6s OP, so the offset steps partway in. These segments are a decent
      // starting point for E01; click a phrase to correct per episode.
      segments: [{ at: 0, off: 0 }, { at: 117, off: 92.6 }],
      urls: ep => { const s = ep <= 25 ? 1 : 2, e = ep <= 25 ? ep : ep - 25; return [RAW + `Code%20Geass%20(2006)/S${s}/` + enc(`[AI GEN] [AV1ophobia] Code Geass Lelouch of the Rebellion - S0${s}E${p2(e)} [BD][1080p][AV1][OPUS][Dual Audio].srt`)]; },
    },
    gintama: {
      title: '銀魂 · Gintama (316 eps)',
      urls: ep => { // filenames carry the GLOBAL number in (nnn); seasons start at these globals
        const starts = [1, 50, 100, 151, 202, 253, 266];
        let s = 1; for (let i = 0; i < starts.length; i++) if (ep >= starts[i]) s = i + 1;
        const e = ep - starts[s - 1] + 1, d = RAW + `Gintama%20(2006)/S${s}/`;
        return [d + enc(`[AI GEN] [Judas] Gintama - S${p2(s)}E${p2(e)} (${p3(ep)}).srt`),
                d + enc(`[AI GEN] [Judas] Gintama - S${p2(s)}E${p2(e)}-E${p2(e + 1)} (${p3(ep)}-${p3(ep + 1)}).srt`),
                d + enc(`[AI GEN] [Judas] Gintama - S${p2(s)}E${p2(e - 1)}-E${p2(e)} (${p3(ep - 1)}-${p3(ep)}).srt`)];
      },
    },
    hxh: { title: '全職獵人 · Hunter x Hunter 2011 (148 eps)', urls: ep => [RAW + 'Hunter%20x%20Hunter%20(2011)/' + enc(`[AI GEN] [Judas] Hunter x Hunter (2011) - S01E${p3(ep)}.srt`)] },
    drslump: { title: 'IQ博士 · Dr. Slump (243 eps)', urls: ep => [RAW + 'Dr.%20Slump%20(1981)/' + enc(`[AI GEN] Dr.Slump_1981.DVD.E${p3(ep)}.srt`), RAW + 'Dr.%20Slump%20(1981)/' + enc(`[AI GEN] Dr.Slump_1981.DVD.E${p3(ep)} - AI gen.srt`)] },
  };
  const cfg = SHOWS[SHOW]; if (!cfg) { alert('Unknown SHOW. Options: ' + Object.keys(SHOWS).join(', ')); return; }
  window.SUB_SEGMENTS = (cfg.segments || [{ at: 0, off: 0 }]).map(s => ({ ...s }));

  const toMs = t => { t = t.trim().replace(',', '.'); const p = t.split(':'), s = (p[2] || '0').split('.'); return ((+p[0] * 60 + +p[1]) * 60 + +s[0]) * 1000 + +((s[1] || '0').padEnd(3, '0').slice(0, 3)); };
  const parse = x => { x = x.split('\r').join(''); if (x.charCodeAt(0) === 0xFEFF) x = x.slice(1); const c = []; for (const b of x.split('\n\n')) { const l = b.split('\n'); let i = l.findIndex(z => z.indexOf(' --> ') > -1); if (i < 0) continue; const tc = l[i].split(' --> '), s = toMs(tc[0]), e = toMs((tc[1] || '').split(' ')[0]), t = l.slice(i + 1).join('\n').trim(); if (t && e > s) c.push({ start: s, end: e, text: t, en: '' }); } return c; };

  const v = document.querySelector('video'); if (!v) { alert('start playback first'); return; }
  let raw = null;
  for (const u of cfg.urls(EP)) { try { const r = await fetch(u); if (r.ok) { raw = await r.text(); console.log('[wp]', decodeURIComponent(u.split('/').pop())); break; } } catch (e) {} }
  if (!raw) { alert(`No srt found for ${SHOW} ep ${EP}. Check the episode number (hkanime x-number + 1).`); return; }
  const cues = parse(raw); cues.sort((a, b) => a.start - b.start); window.__cues = cues;
  console.log(`[wp] ${cfg.title} · ep ${EP} · ${cues.length} cues`);

  document.getElementById('wp-overlay')?.remove(); document.getElementById('wp-pop')?.remove();
  const box = document.createElement('div'); box.id = 'wp-overlay';
  box.style.cssText = 'position:fixed;left:50%;bottom:9%;transform:translateX(-50%);z-index:2147483647;width:92%;max-width:1400px;text-align:center;pointer-events:auto;font-family:"Chiron Hei HK","PingFang HK","Noto Sans HK",system-ui';
  const strip = document.createElement('div');
  strip.style.cssText = 'display:flex;gap:10px;align-items:center;overflow-x:auto;scrollbar-width:thin;padding:8px 10px;background:rgba(0,0,0,.62);border-radius:10px;white-space:nowrap';
  const enWrap = document.createElement('div');
  const enLine = document.createElement('div');
  enLine.style.cssText = 'display:inline-block;margin-top:6px;padding:3px 12px;background:rgba(0,0,0,.62);border-radius:7px;color:#ffd479;font-size:19px;text-shadow:0 2px 4px #000';
  enWrap.append(enLine);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:7px;display:inline-flex;gap:6px;align-items:center;background:rgba(0,0,0,.78);padding:6px 10px;border-radius:9px;font-size:13px;color:#e8eaed';
  box.append(strip, enWrap, bar); document.body.append(box);
  const pop = document.createElement('div'); pop.id = 'wp-pop';
  pop.style.cssText = 'position:fixed;z-index:2147483647;max-width:360px;padding:9px 12px;border-radius:8px;background:rgba(17,19,23,.97);color:#e8eaed;font-size:14px;line-height:1.45;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);display:none;text-align:left';
  document.body.append(pop);

  const segFor = t => { const S = window.SUB_SEGMENTS; let s = S[0]; for (const x of S) if (x.at <= t) s = x; return s; };
  const idxAt = ms => { let lo = 0, hi = cues.length - 1, best = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m].start <= ms) { best = m; lo = m + 1; } else hi = m - 1; } return best; };
  const srtTime = () => v.currentTime + segFor(v.currentTime).off;

  let lastIdx = -1, hovering = false;
  const lbl = document.createElement('span');
  function label() { const s = segFor(v.currentTime); lbl.textContent = `off ${s.off.toFixed(1)}s @${Math.round(s.at)}s`; }
  function syncTo(i) { i = Math.max(0, Math.min(cues.length - 1, i)); segFor(v.currentTime).off = +(cues[i].start / 1000 - v.currentTime).toFixed(2); lastIdx = -1; label(); draw(); }
  window.wpSync = n => syncTo(n - 1);
  window.wpCut = () => { const s = segFor(v.currentTime); const seg = { at: +v.currentTime.toFixed(1), off: s.off }; window.SUB_SEGMENTS.push(seg); window.SUB_SEGMENTS.sort((a, b) => a.at - b.at); label(); return seg; };

  function draw() {
    const cur = idxAt(srtTime() * 1000);
    while (strip.firstChild) strip.removeChild(strip.firstChild);
    let centerEl = null;
    for (let i = cur - RADIUS; i <= cur + RADIUS; i++) {
      if (i < 0 || i >= cues.length) continue;
      const d = Math.abs(i - cur), isCur = d === 0;
      const el = document.createElement('span');
      el.textContent = cues[i].text;
      el.style.cssText = 'cursor:pointer;padding:2px 6px;border-radius:6px;transition:opacity .15s;' +
        `font-size:${isCur ? 27 : 18}px;color:${isCur ? '#7fd7ff' : '#9fc4d6'};opacity:${Math.max(0.22, 1 - d * 0.22)};` +
        (isCur ? 'font-weight:600;text-shadow:0 2px 4px #000;' : '');
      el.title = 'click: this is the line I hear now';
      // mousedown, not click: the strip redraws on a timer and a click needs both press and
      // release on the same element, so clicks were being lost mid-rebuild.
      el.onmousedown = ev => { ev.preventDefault(); ev.stopPropagation(); syncTo(i); };
      strip.appendChild(el);
      if (i < cur + RADIUS) { const sep = document.createElement('span'); sep.textContent = '·'; sep.style.cssText = 'color:#4a5158;font-size:14px'; strip.appendChild(sep); }
      if (isCur) centerEl = el;
    }
    if (centerEl) centerEl.scrollIntoView({ inline: 'center', block: 'nearest' });
    const c = cues[cur];
    enLine.textContent = c && c.en ? c.en : '';
    enLine.style.visibility = c && c.en ? 'visible' : 'hidden';
    lastIdx = cur;
  }
  strip.addEventListener('mouseenter', () => { hovering = true; });   // freeze while picking/reading
  strip.addEventListener('mouseleave', () => { hovering = false; });
  clearInterval(window.__wpTimer);
  window.__wpTimer = setInterval(() => { if (hovering) return; const cur = idxAt(srtTime() * 1000); if (cur !== lastIdx) draw(); }, 120);

  const mkb = (t2, fn, style) => { const b = document.createElement('button'); b.textContent = t2; b.style.cssText = (style || 'border:1px solid #5a5f68;background:#22252b;color:#e8eaed') + ';cursor:pointer;border-radius:6px;padding:5px 10px;font-size:14px'; b.onmousedown = e => { e.preventDefault(); e.stopPropagation(); fn(); }; return b; };
  const nudge = d => () => { segFor(v.currentTime).off = +(segFor(v.currentTime).off + d).toFixed(2); label(); draw(); };
  bar.append(mkb('◀ earlier line', () => syncTo(idxAt(srtTime() * 1000) - 1)), mkb('−0.5s', nudge(-0.5)), lbl, mkb('+0.5s', nudge(0.5)),
    mkb('later line ▶', () => syncTo(idxAt(srtTime() * 1000) + 1)),
    mkb('✂ cut here', () => window.wpCut(), 'border:1px solid #b06fe0;background:#2b2233;color:#e3d4f5'),
    mkb('✓ hide bar', () => bar.remove(), 'border:1px solid #3fae4f;background:#1e3d24;color:#c8f0cf'));
  label(); draw();

  // ---- hover dictionary ----
  const isCJK = ch => { if (!ch) return false; const c = ch.codePointAt(0); return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff); };
  const tone = s => ({ '1': '#e15a5a', '2': '#e6a13a', '3': '#3fae4f', '4': '#5a8fe1', '5': '#b06fe0', '6': '#9aa0a6' }[(s || '').trim().slice(-1)] || '#c9ccd1');
  const fwd = (d, t, i) => { const m = Math.min(MAX_WORD, t.length - i); for (let n = m; n >= 1; n--) { const w = t.substr(i, n); if (d[w]) return { word: w, entries: d[w] }; } return null; };
  (async () => {
    let D; try { D = (await (await fetch(DICT_URL)).json()).entries; } catch (e) { return console.warn('[wp] dictionary failed', e); }
    console.log('[wp] dictionary ready — hover any phrase; press r for pinyin.');
    let mode = localStorage.getItem('canto-dict-reading') === 'py' ? 'py' : 'jy', last = null;
    const rd = e => (mode === 'py' ? e.py : e.jy) || e.py || e.jy || '';
    // DOM nodes, not innerHTML: sites with a Trusted Types policy reject innerHTML outright.
    const render = m => {
      while (pop.firstChild) pop.removeChild(pop.firstChild);
      const head = document.createElement('div'); head.textContent = m.word;
      head.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:3px'; pop.appendChild(head);
      for (const e of m.entries.slice(0, 5)) {
        const row = document.createElement('div'); row.style.margin = '3px 0';
        const r = rd(e);
        if (r) { for (const syl of r.split(' ')) { if (!syl) continue; const b = document.createElement('b'); b.textContent = syl + ' '; b.style.color = tone(syl); row.appendChild(b); } }
        else { const b = document.createElement('b'); b.textContent = '· '; row.appendChild(b); }
        const d2 = document.createElement('span'); d2.textContent = e.d.slice(0, 4).join('; '); d2.style.color = '#c9ccd1';
        row.appendChild(d2); pop.appendChild(row);
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
    strip.addEventListener('mousemove', e => { const c = caret(e.clientX, e.clientY); if (!c || !c.node || c.node.nodeType !== 3) return hide(); const t = c.node.nodeValue || ''; const i = hitChar(c.node, c.off, e.clientX); if (!isCJK(t.charAt(i))) return hide(); const m = fwd(D, t, i); if (!m) return hide(); if (!last || last.word !== m.word) { last = m; render(m); } place(e.clientX, e.clientY); });
    strip.addEventListener('mouseleave', hide);
    document.addEventListener('keydown', e => { if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) { mode = mode === 'py' ? 'jy' : 'py'; localStorage.setItem('canto-dict-reading', mode); if (last) render(last); } });
  })();

  // ---- optional English line ----
  if (KEY === 'YOUR_GEMINI_API_KEY') { console.log('[wp] no KEY — 口語 + dictionary only.'); return; }
  const tr = async texts => { const pr = 'Translate each Hong Kong colloquial-Cantonese subtitle to natural English (auto-transcribed; may have ASR errors — infer meaning). Return ONLY a JSON array of {"i":int,"en":string} for every input.\n\n' + JSON.stringify(texts.map((t, i) => ({ i, zh: t }))); for (let a = 0; a < 2; a++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: pr }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } }) }); const j = await r.json(); const arr = JSON.parse(j.candidates[0].content.parts[0].text); const o = texts.map(() => ''); arr.forEach(x => { if (x.i >= 0 && x.i < o.length) o[x.i] = x.en; }); return o; } catch (e) { if (a) return texts.map(() => ''); } } };
  const st = []; for (let i = 0; i < cues.length; i += BATCH) st.push(i); let n = 0;
  for (let k = 0; k < st.length; k += CONC) await Promise.all(st.slice(k, k + CONC).map(async s => { const e = await tr(cues.slice(s, s + BATCH).map(c => c.text)); e.forEach((t, j) => cues[s + j].en = t); n += Math.min(BATCH, cues.length - s); console.log('[wp] translated', n, '/', cues.length); }));
  draw(); console.log('[wp] English ready.');
})();
