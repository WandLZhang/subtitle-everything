/*
 * srt-overlay — load an external .srt, translate each cue to English, and render a
 * bilingual (source + English) overlay on any page's <video>.
 *
 * Translation is pluggable:
 *   - on-device Chrome Translator API (free, no key)  [browser]
 *   - or any async fn (texts[]) => en[]               [LLM, tests, Node]
 *
 * This file is BOTH a browser userscript/bookmarklet AND a Node-importable module:
 * the DOM/overlay code is guarded by `typeof document`, and the pure functions are
 * exported for Node tests. No regex is used for parsing (split-based).
 */
(function () {
  'use strict';

  // ---- pure logic (unit-tested in Node) ---------------------------------- //
  function toMs(ts) {
    ts = String(ts).trim().replace(',', '.');
    const p = ts.split(':');                       // [hh, mm, ss.mmm]
    const h = parseInt(p[0], 10) || 0;
    const m = parseInt(p[1], 10) || 0;
    const sp = (p[2] || '0').split('.');
    const s = parseInt(sp[0], 10) || 0;
    const ms = parseInt((sp[1] || '0').padEnd(3, '0').slice(0, 3), 10) || 0;
    return ((h * 60 + m) * 60 + s) * 1000 + ms;
  }

  function parseSrt(text) {
    text = String(text).split('\r').join('');       // normalize newlines (no regex)
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // strip BOM
    const cues = [];
    for (const block of text.split('\n\n')) {
      const lines = block.split('\n');
      let ti = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf(' --> ') !== -1) { ti = i; break; }
      }
      if (ti === -1) continue;
      const tc = lines[ti].split(' --> ');
      const start = toMs(tc[0]);
      const end = toMs((tc[1] || '').split(' ')[0]);   // drop trailing position coords
      const body = lines.slice(ti + 1).join('\n').trim();
      if (!body || !(end > start)) continue;
      cues.push({ start, end, text: body, en: '' });
    }
    return cues;
  }

  function cueAtMs(cues, ms) {
    for (const c of cues) if (c.start <= ms && ms <= c.end) return c;
    return null;
  }

  // translate: async (texts[]) => en[] ; batched to keep calls cheap.
  async function translateCues(cues, translate, batch) {
    batch = batch || 40;
    for (let i = 0; i < cues.length; i += batch) {
      const chunk = cues.slice(i, i + batch);
      const en = await translate(chunk.map(c => c.text));
      chunk.forEach((c, j) => { c.en = (en && en[j]) || ''; });
    }
    return cues;
  }

  const api = { toMs, parseSrt, cueAtMs, translateCues };

  // ---- Node export ------------------------------------------------------- //
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }

  // ---- Browser overlay (guarded) ----------------------------------------- //
  if (typeof document === 'undefined') return;

  // on-device Chrome Translator API -> translate fn, or null if unavailable
  async function onDeviceTranslator(src, tgt) {
    if (!('Translator' in self)) return null;
    try {
      const avail = await self.Translator.availability({ sourceLanguage: src, targetLanguage: tgt });
      if (avail === 'unavailable') return null;
      const t = await self.Translator.create({ sourceLanguage: src, targetLanguage: tgt });
      return (texts) => Promise.all(texts.map(x => t.translate(x)));
    } catch (e) { console.warn('[srt-overlay] Translator API error', e); return null; }
  }

  async function boot(opts) {
    opts = opts || {};
    const srtUrl = opts.srtUrl || prompt('SRT URL to overlay:');
    if (!srtUrl) return;
    const src = opts.src || 'zh-Hant', tgt = opts.tgt || 'en';

    const raw = await (await fetch(srtUrl)).text();
    const cues = parseSrt(raw);
    console.log('[srt-overlay] parsed', cues.length, 'cues');

    const translate = opts.translate || await onDeviceTranslator(src, tgt);
    if (translate) {
      try { await translateCues(cues, translate); console.log('[srt-overlay] translated'); }
      catch (e) { console.warn('[srt-overlay] translate failed; source-only', e); }
    } else {
      console.warn('[srt-overlay] no translator available (Chrome Translator API off?) — source-only');
    }

    const video = document.querySelector('video');
    if (!video) { alert('[srt-overlay] no <video> found on page'); return; }

    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;bottom:9%;transform:translateX(-50%);z-index:2147483647;' +
      'max-width:86%;text-align:center;pointer-events:none;font-family:system-ui,sans-serif';
    document.body.appendChild(box);
    const line = (color, size) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:inline-block;margin:2px auto;padding:2px 10px;background:rgba(0,0,0,.6);' +
        'border-radius:6px;color:' + color + ';font-size:' + size + 'px;text-shadow:0 2px 4px #000';
      return d;
    };
    const zh = line('#7fd7ff', 26), en = line('#ffd479', 20);
    const wrap1 = document.createElement('div'); wrap1.appendChild(zh);
    const wrap2 = document.createElement('div'); wrap2.appendChild(en);
    box.appendChild(wrap1); box.appendChild(wrap2);

    video.addEventListener('timeupdate', () => {
      const c = cueAtMs(cues, video.currentTime * 1000);
      zh.textContent = c ? c.text : '';
      en.textContent = c ? (c.en || '') : '';
      wrap1.style.visibility = c && c.text ? 'visible' : 'hidden';
      wrap2.style.visibility = c && c.en ? 'visible' : 'hidden';
    });
    console.log('[srt-overlay] overlay attached to <video>');
  }

  self.srtOverlay = { boot, parseSrt, cueAtMs, translateCues, onDeviceTranslator };
})();
