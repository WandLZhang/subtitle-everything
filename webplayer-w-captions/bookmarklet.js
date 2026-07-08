// webplayer-overlay — paste into the DevTools console on a video page (or save the
// javascript: form as a bookmarklet). Prompts for an external .srt URL (e.g. a
// CantoCaptions raw .srt), translates each cue on-device (Chrome Translator API),
// and overlays 口語 (top) + English (bottom) on the page's <video>.
//
// Timing off (community srt vs this cut)?  ->  window.SUB_OFFSET = -30   (seconds)
// No on-device Translator? -> shows 口語 only; replace `tr` with a keyed LLM call.
(async () => {
  const SRT = prompt('External .srt URL to overlay:');
  if (!SRT) return;
  const toMs = ts => { ts = ts.trim().replace(',', '.'); const p = ts.split(':'), sp = (p[2] || '0').split('.');
    return ((+p[0] * 60 + +p[1]) * 60 + +sp[0]) * 1000 + +((sp[1] || '0').padEnd(3, '0').slice(0, 3)); };
  const parse = t => { t = t.split('\r').join(''); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); const cs = [];
    for (const b of t.split('\n\n')) { const ls = b.split('\n'); let ti = ls.findIndex(l => l.indexOf(' --> ') > -1);
      if (ti < 0) continue; const tc = ls[ti].split(' --> '); const s = toMs(tc[0]), e = toMs((tc[1] || '').split(' ')[0]);
      const body = ls.slice(ti + 1).join('\n').trim(); if (body && e > s) cs.push({ start: s, end: e, text: body, en: '' }); }
    return cs; };
  const cues = parse(await (await fetch(SRT)).text());
  console.log('[overlay] parsed', cues.length, 'cues');

  let tr = null;
  if ('Translator' in self) { try {
    if ((await Translator.availability({ sourceLanguage: 'zh-Hant', targetLanguage: 'en' })) !== 'unavailable') {
      const t = await Translator.create({ sourceLanguage: 'zh-Hant', targetLanguage: 'en' }); tr = x => t.translate(x); }
  } catch (e) { console.warn('[overlay] Translator err', e); } }
  if (tr) { console.log('[overlay] translating on-device…'); for (const c of cues) { try { c.en = await tr(c.text); } catch (e) {} } console.log('[overlay] ✅ translated'); }
  else console.warn('[overlay] ❌ on-device Translator unavailable — 口語 only');

  const v = document.querySelector('video'); if (!v) { alert('no <video> found — start playback first'); return; }
  document.getElementById('wp-overlay')?.remove();
  const box = document.createElement('div'); box.id = 'wp-overlay';
  box.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:2147483647;max-width:86%;text-align:center;pointer-events:none;font-family:system-ui';
  const mk = (c, s) => { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;margin:2px;padding:2px 10px;background:rgba(0,0,0,.6);border-radius:6px;color:' + c + ';font-size:' + s + 'px;text-shadow:0 2px 4px #000'; return d; };
  const zh = mk('#7fd7ff', 26), en = mk('#ffd479', 20);
  const w1 = document.createElement('div'); w1.append(zh); const w2 = document.createElement('div'); w2.append(en); box.append(w1, w2); document.body.append(box);
  const find = ms => { for (const c of cues) if (c.start <= ms && ms <= c.end) return c; return null; };
  v.addEventListener('timeupdate', () => { const c = find((v.currentTime + (window.SUB_OFFSET || 0)) * 1000);
    zh.textContent = c ? c.text : ''; en.textContent = c ? (c.en || '') : '';
    w1.style.visibility = c && c.text ? 'visible' : 'hidden'; w2.style.visibility = c && c.en ? 'visible' : 'hidden'; });
  console.log('[overlay] attached. Timing off? run:  window.SUB_OFFSET = -30');
})();
