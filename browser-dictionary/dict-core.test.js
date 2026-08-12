// Node logic test for dict-core.js. Run: node dict-core.test.js
// Covers the three helpers inherited from hkanime-w-cantocaption/dict.js plus the two ported from
// the Android app: tone marks (Pinyin.kt) and the reading fallback chain (Dict.kt).
const assert = require('assert');
const { isCJK, toneColor, fwdMatch, accent, accentAll, readingFor, attach, lookupIn } = require('./dict-core.js');

// ---- isCJK ----
assert.strictEqual(isCJK('喜'), true, '喜 is CJK');
assert.strictEqual(isCJK('係'), true, '係 is CJK');
assert.strictEqual(isCJK('曱'), true, '曱 is CJK');
assert.strictEqual(isCJK('a'), false, 'latin not CJK');
assert.strictEqual(isCJK('3'), false, 'digit not CJK');
assert.strictEqual(isCJK(' '), false, 'space not CJK');
assert.strictEqual(isCJK(''), false, 'empty not CJK');

// ---- toneColor (by trailing tone digit; jyutping 1-6, pinyin 1-5) ----
assert.strictEqual(toneColor('fun1'), '#e15a5a', 'tone 1');
assert.strictEqual(toneColor('zo2'), '#e6a13a', 'tone 2');
assert.strictEqual(toneColor('hai6'), '#9aa0a6', 'tone 6');
assert.strictEqual(toneColor('xi3'), '#3fae4f', 'pinyin tone 3');
assert.strictEqual(toneColor('lo'), '#c9ccd1', 'no digit -> default');

// ---- forward-maximal-match (longest hit wins) ----
const dict = {
  '喜': [{ py: 'xi3', jy: 'hei2', d: ['to like'] }],
  '喜歡': [{ py: 'xi3 huan5', jy: 'hei2 fun1', d: ['to like'] }],
  '係': [{ py: 'xi4', jy: 'hai6', d: ['(Cantonese) to be'] }],
};
assert.strictEqual(fwdMatch(dict, '我喜歡你', 1).word, '喜歡', 'longest match 喜歡 over 喜');
assert.strictEqual(fwdMatch(dict, '我喜歡你', 1).entries[0].jy, 'hei2 fun1', 'returns entries');
assert.strictEqual(fwdMatch(dict, '係', 0).word, '係', 'single-char match at end boundary');
assert.strictEqual(fwdMatch(dict, '我你', 0), null, 'no hit -> null');
assert.strictEqual(fwdMatch(dict, '你喜', 1).word, '喜', 'match at last index');

// ---- accent: tone marks for pinyin ----
assert.strictEqual(accent('ni3'), 'nǐ', 'ni3 -> nǐ');
assert.strictEqual(accent('hao3'), 'hǎo', 'hao3 -> hǎo');
assert.strictEqual(accent('ma1'), 'mā', 'tone 1');
assert.strictEqual(accent('lu:4'), 'lǜ', 'CC-CEDICT u: -> ü');
assert.strictEqual(accent('de5'), 'de', 'neutral tone drops the digit, no mark');
assert.strictEqual(accent('xiu4'), 'xiù', 'iu -> mark on the u');
assert.strictEqual(accent('gui4'), 'guì', 'ui -> mark on the i');
assert.strictEqual(accent('hao'), 'hao', 'already toneless passes through');
assert.strictEqual(accent(''), '', 'empty passes through');
assert.strictEqual(accent('Zhong1'), 'Zhōng', 'capitalised syllable keeps its case');
assert.strictEqual(accentAll('ni3 hao3'), 'nǐ hǎo', 'whole reading');
// accentAll is pinyin-only. Fed jyutping it silently produces nonsense — tone 3 is not ǒ in a
// six-tone system — which is why render() accents only when readingFor() reports isPinyin.
assert.strictEqual(accentAll('zung1 gwok3'), 'zūng gwǒk', 'jyutping through accentAll is garbage, by construction');

// ---- readingFor: own -> composed -> other language, flagged ----
// 1. the word has its own reading in the mode asked for
const d1 = { '喜歡': [{ py: 'xi3 huan5', jy: 'hei2 fun1', d: [] }] };
let r = readingFor(d1, '喜歡', d1['喜歡'][0], 'jy');
assert.deepStrictEqual([r.text, r.composed, r.wrongLang], ['hei2 fun1', false, false], 'own jyutping');
r = readingFor(d1, '喜歡', d1['喜歡'][0], 'py');
assert.deepStrictEqual([r.text, r.isPinyin], ['xi3 huan5', true], 'own pinyin');

// 2. no jyutping on the word, but every character has one -> compose it (佛 fat6 + 珠 zyu1)
const d2 = {
  '佛珠': [{ py: 'fo2 zhu1', jy: '', d: ['prayer beads'] }],
  '佛': [{ py: 'fo2', jy: 'fat6', d: [] }],
  '珠': [{ py: 'zhu1', jy: 'zyu1', d: [] }],
};
r = readingFor(d2, '佛珠', d2['佛珠'][0], 'jy');
assert.deepStrictEqual([r.text, r.composed, r.wrongLang], ['fat6 zyu1', true, false], 'composed per character');

// 3. no jyutping anywhere -> fall back to pinyin, but SAY it is pinyin.
// This is the 曱甴 bug: the popup used to print the Mandarin reading tone-coloured and label it jyutping.
const d3 = { '曱甴': [{ py: 'yue1 zha2', jy: '', d: ['cockroach'] }] };
r = readingFor(d3, '曱甴', d3['曱甴'][0], 'jy');
assert.strictEqual(r.text, 'yue1 zha2', 'falls back to the pinyin');
assert.strictEqual(r.wrongLang, true, '曱甴 fallback is flagged as the wrong language');
assert.strictEqual(r.isPinyin, true, 'and is known to be pinyin, so it renders with tone marks');

// ---- lookupIn: the worker -> frame payload ----
// Must carry enough for readingFor to compose a missing reading on the other side, and no more:
// the whole dictionary is 143k headwords and this crosses a message boundary on every hover.
const dictFull = {
  '佛珠': [{ py: 'fo2 zhu1', jy: '', d: ['prayer beads'] }],
  '佛': [{ py: 'fo2', jy: 'fat6', d: ['Buddha'] }],
  '珠': [{ py: 'zhu1', jy: 'zyu1', d: ['bead'] }],
  '喜': [{ py: 'xi3', jy: 'hei2', d: ['to like'] }],
};
const hit = lookupIn(dictFull, '佛珠係');
assert.strictEqual(hit.word, '佛珠', 'longest match wins at the hover position');
assert.deepStrictEqual(Object.keys(hit.chars).sort(), ['佛', '珠'], 'ships only this word\'s characters');
assert.ok(!hit.chars['喜'], 'does not ship the rest of the dictionary');
// and the composition still works downstream from just that slice
const composed = readingFor(hit.chars, hit.word, hit.entries[0], 'jy');
assert.deepStrictEqual([composed.text, composed.composed], ['fat6 zyu1', true], 'composes from chars alone');
assert.strictEqual(lookupIn(dictFull, '你好'), null, 'no match -> null');

// ---- attach() must survive a document.open()/write(), which is how VSCode fills a webview ----
// The first shipped version guarded on doc.__browserDict. document.open() unregisters every
// listener but REUSES the Document object, so that flag survived the very event it existed to
// detect and the frame was skipped forever. Model both halves of that semantics here.
function fakeDoc() {
  const mkEl = () => ({ style: {}, children: [], isConnected: true, appendChild(c) { this.children.push(c); return c; } });
  const doc = {
    listeners: [],
    body: mkEl(),
    createElement: mkEl,
    addEventListener(type, fn, cap) { this.listeners.push({ type, fn, cap }); },
    removeEventListener(type, fn, cap) { this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn && l.cap === cap)); },
    // document.open() per spec: drop every listener, install a fresh body, same Document object
    rewrite() { this.listeners = []; this.body = mkEl(); },
  };
  return doc;
}

const doc = fakeDoc();
attach(doc, {});
const first = doc.listeners.length;
assert.ok(first >= 3, 'attach binds mousemove / mouseleave / keydown');

attach(doc, {});
assert.strictEqual(doc.listeners.length, first, 'a second attach on the same body is a no-op');

doc.rewrite();                                   // <- VSCode writes the real webview content here
assert.strictEqual(doc.listeners.length, 0, 'the rewrite killed the listeners, as the browser would');

attach(doc, {});
assert.strictEqual(doc.listeners.length, first, 'attach re-arms after a rewrite — this is the bug that shipped');

attach(doc, {});
assert.strictEqual(doc.listeners.length, first, 'and does not stack duplicates on the new body either');

console.log('PASS — isCJK / toneColor / fwdMatch / accent / readingFor / lookupIn / attach re-arm all OK');
