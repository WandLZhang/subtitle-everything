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

// Enumerate frames with webNavigation rather than relying on executeScript's allFrames. allFrames
// only reports frames it could actually inject into, so a frame Chrome REFUSES to inject into simply
// vanishes from the results — which once made this read "1 of 1 attached" on a tab full of webviews.
// A frame we cannot reach is the single most useful thing this panel can tell you, so it must be
// impossible for one to go unlisted.
chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
  const tab = tabs[0];
  if (!tab) return set($('tab'), 'no active tab', 'bad');

  let frames;
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
  } catch (e) {
    return set($('tab'), 'cannot enumerate frames — ' + e.message, 'bad');
  }
  if (!frames || !frames.length) return set($('tab'), 'no frames reported', 'bad');

  const rows = await Promise.all(frames.map(async f => {
    try {
      const r = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [f.frameId] }, func: probe,
      });
      return { url: f.url, probe: r && r[0] && r[0].result };
    } catch (e) {
      return { url: f.url, refused: e.message };          // Chrome would not inject here
    }
  }));

  const live = rows.filter(r => r.probe && r.probe.attached).length;
  set($('tab'), `${live} of ${rows.length} frame(s) attached`, live === rows.length ? 'ok' : 'bad');

  const list = $('frames');
  for (const r of rows) {
    const li = document.createElement('li');
    const state = document.createElement('span');
    // Chrome's own wording for a runtime_blocked_hosts match is opaque. Name the cause instead:
    // this is an admin policy, no extension can run here, and no change to this code will help.
    if (r.refused && /ExtensionsSettings policy/i.test(r.refused)) {
      set(state, 'blocked by Chrome admin policy — no extension can run here', 'bad');
    } else if (r.refused) set(state, 'injection refused: ' + r.refused, 'bad');
    else if (!r.probe) set(state, 'no result', 'bad');
    else if (r.probe.attached) set(state, 'attached', 'ok');
    else set(state, r.probe.hasEngine ? 'engine present, not attached' : 'no content script', 'bad');
    li.appendChild(state);
    li.appendChild(document.createTextNode(' — ' + String(r.url).slice(0, 110)));
    list.appendChild(li);
  }
});
