// browser-dictionary — toolbar button. Click to turn the hover popup on or off everywhere, the way
// Zhongwen's button works. The state lives in chrome.storage.local; content.js watches it, so a
// toggle takes effect in every open tab immediately, with no reload.
const ON_KEY = 'browser-dict-enabled';

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
  return r[ON_KEY] !== false;                    // default on
}

chrome.action.onClicked.addListener(async () => {
  const on = !(await current());
  await chrome.storage.local.set({ [ON_KEY]: on });
  await paint(on);
});

// The worker is torn down when idle, so repaint whenever it wakes rather than only on install.
chrome.runtime.onStartup.addListener(async () => paint(await current()));
chrome.runtime.onInstalled.addListener(async () => paint(await current()));
