// Node logic test for overlay.js (parse / timing / translate). Run: node overlay.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseSrt, toMs, cueAtMs, translateCues } = require('./overlay.js');

const srt = fs.readFileSync(path.join(__dirname, 'sample.srt'), 'utf8');
const cues = parseSrt(srt);

// parse
assert.strictEqual(cues.length, 3, 'should parse 3 cues');
assert.strictEqual(cues[0].start, 1000);
assert.strictEqual(cues[0].end, 3000);
assert.ok(cues[0].text.includes('你好'), 'cue 1 text');

// timecodes
assert.strictEqual(toMs('00:00:03,500'), 3500);
assert.strictEqual(toMs('01:02:03,004'), ((1 * 60 + 2) * 60 + 3) * 1000 + 4);

// timing lookup
assert.ok(cueAtMs(cues, 2000) && cueAtMs(cues, 2000).text.includes('你好'), 'cue at 2.0s');
assert.strictEqual(cueAtMs(cues, 3200), null, 'gap between cues -> null');
assert.ok(cueAtMs(cues, 7000) && cueAtMs(cues, 7000).text.includes('天氣'), 'cue at 7.0s');

// translate (pluggable stub; batched)
(async () => {
  let calls = 0;
  const stub = async (texts) => { calls++; return texts.map(t => 'EN:' + t.length); };
  await translateCues(cues, stub, 2);               // batch=2 -> 2 calls for 3 cues
  assert.ok(cues.every(c => c.en && c.en.startsWith('EN:')), 'all cues translated');
  assert.strictEqual(calls, 2, 'batching: 3 cues / batch 2 = 2 calls');
  console.log('PASS — parse(3) / timecodes / timing / translate(batched) all OK');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
