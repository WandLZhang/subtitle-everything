// browser-dictionary — toolbar popup: the on/off + reading controls, and a self-diagnosis.
//
// The diagnosis exists because every failure mode of this extension is SILENT. A frame the content
// script never reached, a document rewritten out from under it, and a dictionary fetch refused by
// the host page's CSP all look identical from the page: you hover, and nothing happens. This reports
// which of the three it is without anyone opening a console.
const MODE_KEY = 'canto-dict-reading';
const ON_KEY = 'browser-dict-enabled';

const $ = id => document.getElementById(id);
const set = (el, text, cls) => { el.textContent = text; el.className = cls || ''; };

// ---- controls ----
chrome.storage.local.get([MODE_KEY, ON_KEY], r => {
  $('on').checked = r[ON_KEY] !== false;
  const mode = r[MODE_KEY] === 'py' ? 'py' : 'jy';
  $(mode).checked = true;
});

$('on').addEventListener('change', e => chrome.storage.local.set({ [ON_KEY]: e.target.checked }));
for (const id of ['jy', 'py']) {
  $(id).addEventListener('change', e => { if (e.target.checked) chrome.storage.local.set({ [MODE_KEY]: id }); });
}

// ---- is the dictionary reachable from the service worker? ----
chrome.runtime.sendMessage({ type: 'bd-status' }, r => {
  if (chrome.runtime.lastError) return set($('dict'), 'service worker not responding', 'bad');
  if (!r) return set($('dict'), 'no reply from service worker', 'bad');
  if (r.error) return set($('dict'), 'failed — ' + r.error, 'bad');
  set($('dict'), `ready · ${r.count.toLocaleString()} words`, 'ok');
});

// ---- which frames of the current tab is the hover popup actually running in? ----
// Runs in the extension's ISOLATED world, the same world as the content scripts, so it can read the
// marker attach() leaves on the body.
function probe() {
  return {
    url: location.href,
    attached: !!(document.body && document.body.__browserDict),
    hasEngine: typeof BrowserDict !== 'undefined',
  };
}

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs[0];
  if (!tab) return set($('tab'), 'no active tab', 'bad');
  chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: probe }, results => {
    if (chrome.runtime.lastError) return set($('tab'), chrome.runtime.lastError.message, 'bad');
    const frames = (results || []).map(r => r.result).filter(Boolean);
    const live = frames.filter(f => f.attached).length;
    set($('tab'), `${live} of ${frames.length} frame(s) attached`, live ? 'ok' : 'bad');

    const list = $('frames');
    for (const f of frames) {
      const li = document.createElement('li');
      const state = document.createElement('span');
      if (f.attached) set(state, 'attached', 'ok');
      else set(state, f.hasEngine ? 'not attached' : 'no content script', 'bad');
      li.appendChild(state);
      li.appendChild(document.createTextNode(' — ' + f.url.slice(0, 110)));
      list.appendChild(li);
    }
  });
});
