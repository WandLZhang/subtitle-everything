// browser-dictionary — content script. Binds the engine in dict-core.js to this frame, and, when
// this frame happens to be a VSCode webview host, into the inner frame as well.
//
// WHY THE BRIDGE EXISTS
// VSCode does not build a webview with srcdoc. It loads an empty ./fake.html on the right origin and
// then rewrites it in place (see out/vs/workbench/contrib/webview/browser/pre/index.html):
//
//     newFrame.src = `./fake.html?${fakeUrlParams}`;
//     ...
//     contentDocument.open(); contentDocument.write(newDocument); contentDocument.close();
//
// Chrome injects content scripts into fake.html when it loads. document.open() then unregisters every
// listener on that Document, and Chrome does not re-inject, because no new navigation committed. So
// any extension that only relies on normal injection (Zhongwen included) attaches and is wiped
// microseconds later, and the Claude Code panel / markdown preview / notebook output stay dead.
//
// The host frame is never rewritten, and the inner frame is same-origin (./fake.html, and the sandbox
// keeps allow-same-origin), so from here we can reach iframe.contentDocument and attach AFTER the
// write. A 500ms poll rather than a MutationObserver: it re-attaches after every rewrite, including
// the ones VSCode does when a panel reloads, with no lifecycle reasoning to get wrong.
(function () {
  'use strict';

  const MODE_KEY = 'canto-dict-reading';               // same key the video overlays use
  const ON_KEY = 'browser-dict-enabled';

  let mode = 'jy';                                     // jyutping default
  let enabled = true;

  // Read the stored state, then keep it live: the toolbar button writes to storage, and every frame
  // in every tab picks the change up here rather than needing a reload.
  try {
    chrome.storage.local.get([MODE_KEY, ON_KEY], r => {
      if (r && r[MODE_KEY] === 'py') mode = 'py';
      if (r && r[ON_KEY] === false) enabled = false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[MODE_KEY]) mode = changes[MODE_KEY].newValue === 'py' ? 'py' : 'jy';
      if (changes[ON_KEY]) enabled = changes[ON_KEY].newValue !== false;
    });
  } catch (e) { /* storage unavailable in some sandboxed frames; the defaults are fine */ }

  const opts = {
    getMode: () => mode,
    setMode: m => {
      mode = m;
      try { chrome.storage.local.set({ [MODE_KEY]: m }); } catch (e) {}
    },
    isEnabled: () => enabled,
  };

  BrowserDict.attach(document, opts);                  // ordinary pages, and the Monaco editor

  // ---- VSCode webview bridge ----
  const isWebviewHost = location.pathname.indexOf('/out/vs/workbench/contrib/webview/browser/pre/') !== -1;
  if (!isWebviewHost) return;

  setInterval(() => {
    for (const f of document.querySelectorAll('iframe')) {
      let d;
      try { d = f.contentDocument; } catch (e) { continue; }   // cross-origin, not ours
      if (!d || !d.body || d.__browserDict) continue;
      BrowserDict.attach(d, opts);
    }
  }, 500);
})();
