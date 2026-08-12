// browser-dictionary — service worker. Two jobs: the toolbar on/off button, and serving dictionary
// lookups to the content scripts.
//
// WHY LOOKUPS LIVE HERE
// In MV3 a content script's fetch() is subject to the HOST PAGE's CSP, not the extension's. A VSCode
// webview writes its document with
//
//     Content-Security-Policy: default-src 'none'; script-src ...; frame-src 'self'; style-src 'unsafe-inline';
//
// and with no connect-src, connect-src falls back to default-src 'none' — so every network request
// from that document is refused, including ours. Hovering did nothing and said nothing. A service
// worker has no host page and no page CSP, so the fetch belongs here; host_permissions covers it.
//
// This is also why the whole dictionary is not messaged to the frames: one copy lives here, and each
// hover ships back only the matched word plus the per-character entries needed to compose a reading.
importScripts('dict-core.js');

const ON_KEY = 'browser-dict-enabled';

// ---- dictionary ----
// Memoised for the worker's lifetime. Chrome tears the worker down when idle, so this refetches on
// the next wake; the blob is served with cache-control: public,max-age=86400, so that is cheap.
let dictPromise = null;
function dict() {
  if (!dictPromise) {
    dictPromise = fetch(BrowserDict.DICT_URL)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => j.entries)
      .catch(err => { dictPromise = null; throw err; });   // let the next hover retry
  }
  return dictPromise;
}

// Registered synchronously at the top level: a listener added inside an async callback would miss
// the very event that woke the worker.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'bd-lookup') {
    dict()
      .then(d => sendResponse(BrowserDict.lookupIn(d, msg.text)))
      .catch(err => {
        console.warn('[browser-dictionary] dictionary unavailable:', err);
        sendResponse({ error: String(err) });
      });
    return true;                                           // keep the channel open for the async reply
  }

  // Drives the popup's self-diagnosis. Forces the fetch so a CSP or network failure surfaces as a
  // sentence in the popup instead of as a hover that quietly does nothing.
  if (msg.type === 'bd-status') {
    dict()
      .then(d => sendResponse({ count: Object.keys(d).length }))
      .catch(err => sendResponse({ error: String(err) }));
    return true;
  }
});

// ---- badge ----
// The button opens popup.html, so the toggle lives there; this only mirrors the state onto the icon.
// content.js watches the same storage key, so a toggle takes effect in every open tab with no reload.
async function paint(on) {
  await chrome.action.setBadgeText({ text: on ? '' : 'off' });
  await chrome.action.setBadgeBackgroundColor({ color: '#6b7076' });
  await chrome.action.setTitle({
    title: on ? 'browser-dictionary: on — hover a Chinese word (press r for pinyin)'
              : 'browser-dictionary: off — click to enable',
  });
}

async function current() {
  const r = await chrome.storage.local.get(ON_KEY);
  return r[ON_KEY] !== false;                              // default on
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[ON_KEY]) paint(changes[ON_KEY].newValue !== false);
});

chrome.runtime.onStartup.addListener(async () => paint(await current()));
chrome.runtime.onInstalled.addListener(async () => paint(await current()));
