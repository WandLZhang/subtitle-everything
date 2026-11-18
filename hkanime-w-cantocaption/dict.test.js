// Node logic test for dict.js (CJK detection / tone colour / forward-max-match / tone marks /
// syllable split / reading fallback).
// Run: node dict.test.js
const assert = require('assert');
const { isCJK, toneColor, fwdMatch, accent, syllables, readingFor } = require('./dict.js');

// isCJK
assert.strictEqual(isCJK('喜'), true, '喜 is CJK');
assert.strictEqual(isCJK('係'), true, '係 is CJK');
assert.strictEqual(isCJK('a'), false, 'latin not CJK');
assert.strictEqual(isCJK('3'), false, 'digit not CJK');
assert.strictEqual(isCJK(' '), false, 'space not CJK');
assert.strictEqual(isCJK(''), false, 'empty not CJK');

// toneColor (by trailing tone digit; jyutping 1-6, pinyin 1-5)
assert.strictEqual(toneColor('fun1'), '#e15a5a', 'tone 1');
assert.strictEqual(toneColor('zo2'), '#e6a13a', 'tone 2');
assert.strictEqual(toneColor('hai6'), '#9aa0a6', 'tone 6');
assert.strictEqual(toneColor('xi3'), '#3fae4f', 'pinyin tone 3');
assert.strictEqual(toneColor('lo'), '#c9ccd1', 'no digit -> default');

// forward-maximal-match (longest hit wins)
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

// accent: pinyin tone marks. Inputs are readings from the live canto-dict blob.
assert.strictEqual(accent('jian4'), 'jiàn', '間');
assert.strictEqual(accent('die2'), 'dié', '諜');
assert.strictEqual(accent('Fo2'), 'Fó', 'capitalised 佛 keeps its case');
assert.strictEqual(accent('lu:4'), 'lǜ', 'CC-CEDICT u: -> ü (綠)');
assert.strictEqual(accent('nv3'), 'nǚ', 'CC-Canto v -> ü (女)');
assert.strictEqual(accent('V'), 'V', 'a bare V stays a V');
assert.strictEqual(accent('n2'), 'ń', 'syllabic nasal 唔');
assert.strictEqual(accent('11'), '11', 'number keeps its digits (雙11)');
assert.strictEqual(accent('de5'), 'de', 'neutral tone: no mark, no digit');
assert.strictEqual(accent('xx5'), 'xx', 'CC-CEDICT unknown-reading marker');
// accent() is pinyin-only; render() calls it only when readingFor() reports isPinyin (tested below).

// syllables: split at spaces and after each tone digit
assert.deepStrictEqual(syllables('yi1ju4 da3,'), ['yi1', 'ju4', 'da3', ','], 'glued syllables and punctuation');
assert.deepStrictEqual(syllables('gaan3 dip6'), ['gaan3', 'dip6'], 'jyutping passes through');

// readingFor: own -> per character -> other language, flagged. Entries are copied from the blob.
const blob = {
  '間諜': [{ py: 'jian4 die2', jy: 'gaan3 dip6', d: ['spy'] }],
  '佛珠': [{ py: 'fo2 zhu1', jy: '', d: ['Buddhist prayer beads'] }],
  '佛': [{ py: 'Fo2', jy: 'fat6', d: ['Buddha'] }],
  '珠': [{ py: 'zhu1', jy: 'zyu1', d: ['bead'] }],
  '綠': [{ py: 'lu4', jy: '', d: ['used in names'] }, { py: 'lu:4', jy: '', d: ['green'] }],
};
let r = readingFor(blob, '間諜', blob['間諜'][0], 'jy');
assert.deepStrictEqual([r.text, r.isPinyin, r.composed, r.wrongLang], ['gaan3 dip6', false, false, false], 'own jyutping');
r = readingFor(blob, '間諜', blob['間諜'][0], 'py');
assert.deepStrictEqual([r.text, r.isPinyin], ['jian4 die2', true], 'own pinyin');
r = readingFor(blob, '佛珠', blob['佛珠'][0], 'jy');
assert.deepStrictEqual([r.text, r.composed, r.wrongLang], ['fat6 zyu1', true, false], 'jyutping built per character');
r = readingFor(blob, '綠', blob['綠'][1], 'jy');
assert.deepStrictEqual([r.text, r.isPinyin, r.wrongLang], ['lu:4', true, true], 'no jyutping anywhere: pinyin, flagged');
assert.strictEqual(syllables(r.text).map(x => r.isPinyin ? accent(x) : x).join(' '), 'lǜ', 'and it renders with a tone mark');

console.log('PASS — isCJK / toneColor / fwdMatch / accent / syllables / readingFor all OK');
