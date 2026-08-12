// End-to-end test for browser-dictionary against a real Chrome with the extension loaded.
//
// Reproduces the VSCode webview structure that broke it, from out/vs/workbench/contrib/webview/
// browser/pre/index.html:
//   · a cross-origin "workbench" page (port 8801) embedding a "webview host" (port 8802)
//   · the host creates an iframe on ./fake.html, then contentDocument.open()/write()s the real
//     content into it, and renames pending-frame -> active-frame
//   · the written document carries default-src 'none' with NO connect-src
const http = require('http');
const path = require('path');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.error('This test drives a real Chrome and needs puppeteer-core, which is not vendored here.\n' +
    '  mkdir -p /tmp/bdtest && cd /tmp/bdtest && npm init -y && npm i puppeteer-core\n' +
    '  NODE_PATH=/tmp/bdtest/node_modules node ' + __filename);
  process.exit(2);
}

const EXT = process.env.BD_EXT || path.resolve(__dirname);
// Any Chrome will do. Override with BD_CHROME=/path/to/chrome (on a Mac that is usually
// '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome').
const CHROME = process.env.BD_CHROME || guessChrome();

function guessChrome() {
  const fs = require('fs'), os = require('os');
  const guesses = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const cache = path.join(os.homedir(), '.cache/puppeteer/chrome');
  if (fs.existsSync(cache)) {
    for (const v of fs.readdirSync(cache).sort().reverse()) {
      guesses.push(path.join(cache, v, 'chrome-linux64/chrome'));
      guesses.push(path.join(cache, v, 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
    }
  }
  const hit = guesses.find(g => fs.existsSync(g));
  if (!hit) throw new Error('No Chrome found. Set BD_CHROME=/path/to/chrome');
  return hit;
}

// The CSP is copied verbatim from the real pre/index.html. No connect-src, so connect-src inherits
// default-src 'none' and every network request from this document is refused.
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; frame-src 'self'; style-src 'unsafe-inline';";

const INNER = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
</head><body style="margin:0;background:#fff">
<div id="target" style="position:absolute;left:40px;top:40px;font-size:32px;font-family:serif">佛珠好靚</div>
</body></html>`;

const HOST = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0">
<script>
  const f = document.createElement('iframe');
  f.setAttribute('id', 'pending-frame');
  f.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-pointer-lock allow-downloads');
  f.style.cssText = 'display:block;margin:0;border:0;position:absolute;inset:0;width:100%;height:100%';
  f.src = './fake.html?id=1';
  f.addEventListener('load', () => {
    // exactly what VSCode does: rewrite the already-loaded document in place
    const d = f.contentDocument;
    d.open();
    d.write(${JSON.stringify(INNER)});
    d.close();
    f.setAttribute('id', 'active-frame');
    window.__wrote = true;
  });
  document.body.appendChild(f);
<\/script>
</body></html>`;

const TOP = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0">
<iframe src="http://127.0.0.1:8802/pre/index.html"
        style="display:block;border:0;position:absolute;inset:0;width:100%;height:100%"
        sandbox="allow-scripts allow-same-origin"></iframe>
</body></html>`;

function serve(port, routes) {
  return new Promise(res => {
    const s = http.createServer((req, rq) => {
      const url = req.url.split('?')[0];
      const body = routes[url];
      if (body === undefined) { rq.writeHead(404); return rq.end('nope'); }
      rq.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rq.end(body);
    });
    s.listen(port, '127.0.0.1', () => res(s));
  });
}

const fail = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail.push(name);
};

(async () => {
  const PLAIN = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0">'
    + '<div id="t" style="position:absolute;left:40px;top:40px;font-size:32px;font-family:serif">曱甴</div>'
    + '</body></html>';
  const a = await serve(8801, { '/': TOP, '/plain': PLAIN });
  const b = await serve(8802, { '/pre/index.html': HOST, '/pre/fake.html': '<!DOCTYPE html><html><body></body></html>' });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    ],
  });

  try {
    // the service worker must come up, or nothing else can work
    const swTarget = await browser.waitForTarget(t => t.type() === 'service_worker', { timeout: 15000 }).catch(() => null);
    check('service worker starts', !!swTarget, swTarget ? swTarget.url().split('/').pop() : 'never appeared');

    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 600 });
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    await page.goto('http://127.0.0.1:8801/', { waitUntil: 'networkidle2' });

    // wait for the host to finish rewriting the inner document
    await new Promise(r => setTimeout(r, 1500));

    const frames = page.frames();
    const inner = frames.find(f => f.url().includes('fake.html'));
    check('inner frame exists', !!inner, inner ? inner.url() : frames.map(f => f.url()).join(' | '));
    if (!inner) throw new Error('no inner frame');

    // the rewrite really happened (this is the document.open() that used to wipe our listeners)
    const wrote = await inner.evaluate(() => document.getElementById('target') !== null).catch(() => false);
    check('document.write replaced the inner document', wrote);

    // give the 500ms bridge poll a few turns to notice the new body
    await new Promise(r => setTimeout(r, 2500));
    // NB: body.__browserDict is set in the extension's ISOLATED world and frame.evaluate runs in the
    // MAIN world, so it is not observable from here. The popup element below is, so that is the
    // assertion that means anything.

    // hover the first character of 佛珠 by dispatching a real mousemove at its own coordinates
    await inner.evaluate(() => {
      const el = document.getElementById('target');
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('mousemove', {
        clientX: Math.round(r.left + 14), clientY: Math.round(r.top + r.height / 2), bubbles: true,
      }));
    });

    // the lookup crosses to the service worker and back
    let popText = '';
    for (let i = 0; i < 40; i++) {
      popText = await inner.evaluate(() => {
        const p = document.getElementById('bd-pop');
        return p && p.style.display !== 'none' ? p.textContent : '';
      }).catch(() => '');
      if (popText) break;
      await new Promise(r => setTimeout(r, 500));
    }

    check('popup appears inside the CSP-restricted frame', !!popText, popText ? '' : 'never rendered');
    check('popup shows the word 佛珠', popText.includes('佛珠'), JSON.stringify(popText.slice(0, 90)));
    check('composed jyutping fat6 zyu1', popText.includes('fat6 zyu1'), JSON.stringify(popText.slice(0, 120)));
    check('composition is labelled', popText.includes('per character'));

    // The popup enumerates frames with webNavigation, not executeScript's allFrames, because
    // allFrames omits frames it could not inject into — which once made the panel report
    // "1 of 1 attached" on a tab full of webviews. Assert the enumeration really sees the nest:
    // top workbench + webview host + the rewritten inner frame.
    if (swTarget) {
      const worker = await swTarget.worker();
      const seen = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        const t = tabs.find(x => x.url && x.url.includes('127.0.0.1:8801'));
        if (!t) return null;
        const frames = await chrome.webNavigation.getAllFrames({ tabId: t.id });
        return frames.map(f => f.url);
      }).catch(e => ({ err: String(e) }));
      const urls = Array.isArray(seen) ? seen : [];
      check('webNavigation enumerates the nested frames', urls.length >= 3,
        urls.length ? urls.map(u => u.replace('http://127.0.0.1', '')).join(' | ') : JSON.stringify(seen));
      check('the rewritten inner frame is enumerated', urls.some(u => u.includes('fake.html')));
    }

    // control: prove the CSP really does refuse a fetch from inside that document, so we know the
    // service-worker proxy is load-bearing and not cargo cult
    const blocked = await inner.evaluate(() =>
      fetch('https://storage.googleapis.com/wz-qwen-test-canto-dict/canto-dict.min.json', { method: 'HEAD' })
        .then(() => 'allowed').catch(e => 'blocked'));
    check('page CSP blocks a direct fetch from that frame', blocked === 'blocked', blocked);

    // and the ordinary case still works. Served over http, not setContent: setContent leaves the
    // page on about:blank, where content scripts do not run, so it would fail for the wrong reason.
    const plain = await browser.newPage();
    await plain.goto('http://127.0.0.1:8801/plain', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));
    await plain.evaluate(() => {
      const el = document.getElementById('t');
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('mousemove', {
        clientX: Math.round(r.left + 14), clientY: Math.round(r.top + r.height / 2), bubbles: true,
      }));
    });
    let plainText = '';
    for (let i = 0; i < 20; i++) {
      plainText = await plain.evaluate(() => {
        const p = document.getElementById('bd-pop');
        return p && p.style.display !== 'none' ? p.textContent : '';
      });
      if (plainText) break;
      await new Promise(r => setTimeout(r, 500));
    }
    check('ordinary page still works', plainText.includes('曱甴'), JSON.stringify(plainText.slice(0, 90)));
    // 曱甴 has no jyutping of its own, so it must NOT silently show its Mandarin reading as if it
    // were Cantonese — that was the original bug. It now composes from the per-character jyutping,
    // so the invariant to hold is: never an unlabelled substitute reading.
    check('曱甴 never shows raw pinyin as if it were jyutping',
      !(plainText.includes('yue1 zha2') && !plainText.includes('pinyin')),
      JSON.stringify(plainText.slice(0, 120)));
    check('substitute reading is labelled',
      plainText.includes('per character') || plainText.includes('pinyin — no jyutping'),
      JSON.stringify(plainText.slice(0, 120)));

    if (consoleErrors.length) console.log('\n  page console errors:\n   ', consoleErrors.slice(0, 6).join('\n    '));
  } finally {
    await browser.close();
    a.close(); b.close();
  }

  console.log(fail.length ? `\nFAILED: ${fail.length} check(s) — ${fail.join(', ')}` : '\nALL CHECKS PASSED');
  process.exit(fail.length ? 1 : 0);
})();
