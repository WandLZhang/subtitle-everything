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
  if (!msg || msg.type !== 'bd-lookup') return;
  dict()
    .then(d => sendResponse(BrowserDict.lookupIn(d, msg.text)))
    .catch(err => {
      console.warn('[browser-dictionary] dictionary unavailable:', err);
      sendResponse({ error: String(err) });
    });
  return true;                                             // keep the channel open for the async reply
});

// ---- toolbar button ----
// Click to turn the hover popup on or off everywhere, the way Zhongwen's button works. The state
// lives in chrome.storage.local; content.js watches it, so a toggle takes effect in every open tab
// immediately, with no reload.
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

chrome.action.onClicked.addListener(async () => {
  const on = !(await current());
  await chrome.storage.local.set({ [ON_KEY]: on });
  await paint(on);
});

chrome.runtime.onStartup.addListener(async () => paint(await current()));
chrome.runtime.onInstalled.addListener(async () => paint(await current()));
