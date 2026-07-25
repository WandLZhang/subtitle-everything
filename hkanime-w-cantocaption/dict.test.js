// Node logic test for dict.js (CJK detection / tone colour / forward-max-match).
// Run: node dict.test.js
const assert = require('assert');
const { isCJK, toneColor, fwdMatch } = require('./dict.js');

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

console.log('PASS — isCJK / toneColor / fwdMatch all OK');
