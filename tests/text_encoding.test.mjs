import {test, describe, before} from 'node:test';
import assert from 'node:assert/strict';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as tf from '@tensorflow/tfjs-core';
// wasm backend: same numerics as in the extension, ~30x faster suite than cpu
import '@tensorflow/tfjs-backend-wasm';
import '@tensorflow/tfjs-backend-cpu';
import {loadModelFromDisk} from '../scripts/model_loader.mjs';
import {normalize, split_to_rows, remove_niqqud, diacritize, diacritize_batch} from '../text_encoding.mjs';

const MAXLEN = 90;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

assert.ok(await tf.setBackend('wasm'), 'wasm backend must initialize — tests must not silently fall back to cpu');
await tf.ready();
assert.equal(tf.getBackend(), 'wasm');

function encode(text) {
    return text.replace(/./gms, normalize);
}

function assertValidRows(rows, text) {
    // Every row must be exactly MAXLEN, otherwise tf.tensor2d gets ragged
    // input and the WebGL backend crashes with "offset is out of bounds".
    for (const row of rows)
        assert.equal(row.length, MAXLEN, `row length ${row.length} !== ${MAXLEN}`);

    // Alignment invariant used by prediction_to_text: the non-padding tokens,
    // in order, must be the input text plus exactly one trailing space.
    // (Each split-consumed delimiter is re-emitted after its word.)
    const nonPadding = rows.flat().filter(t => t > 0);
    assert.equal(nonPadding.length, text.length + 1,
        'non-padding token count must equal text length + 1');
}

describe('split_to_rows', () => {
    test('plain Hebrew sentence', () => {
        const text = encode('הם חלק ממאמצי האגודה הלאומית');
        assertValidRows(split_to_rows(text, MAXLEN), text);
    });

    test('empty string', () => {
        const rows = split_to_rows('', MAXLEN);
        for (const row of rows) assert.equal(row.length, MAXLEN);
    });

    test('single word longer than a row (the Ctrl+A crash)', () => {
        const text = encode('א'.repeat(500));
        assertValidRows(split_to_rows(text, MAXLEN), text);
    });

    test('word lengths around the row boundary', () => {
        for (const n of [1, 88, 89, 90, 91, 179, 180, 181, 269, 270, 271]) {
            const text = encode('ב'.repeat(n));
            assertValidRows(split_to_rows(text, MAXLEN), text);
            const withNeighbours = encode('שלום ' + 'ב'.repeat(n) + ' עולם');
            assertValidRows(split_to_rows(withNeighbours, MAXLEN), withNeighbours);
        }
    });

    test('long word after a partially filled line', () => {
        const text = encode('קצר ' + 'ג'.repeat(250) + ' סוף');
        assertValidRows(split_to_rows(text, MAXLEN), text);
    });

    test('consecutive spaces', () => {
        const text = encode('שלום   עולם');
        assertValidRows(split_to_rows(text, MAXLEN), text);
    });

    test('non-breaking spaces normalize to spaces instead of gluing words', () => {
        const glued = Array(40).fill('שלום').join(' ');
        const text = encode(glued);
        assert.ok(!text.includes('O'), 'nbsp must normalize to a space, not O');
        assertValidRows(split_to_rows(text, MAXLEN), text);
    });

    test('full-page-like blob: URLs, digits, punctuation, foreign chars', () => {
        const blob = [
            'https://www.ynet.co.il/home/0,7340,L-8,00.html'.repeat(4),
            'שורה ראשונה של כתבה בעברית עם פיסוק, מספרים 123 ו"מרכאות".',
            'x'.repeat(300),
            Array(30).fill('מילה').join(' '),
            'עוד\tטקסט\nרגיל\r\nכאן',
        ].join(' ');
        const text = encode(blob);
        assertValidRows(split_to_rows(text, MAXLEN), text);
        // The declared-shape tensor build used by diacritize() must not throw.
        const rows = split_to_rows(text, MAXLEN);
        const t = tf.tensor2d(rows, [rows.length, MAXLEN], 'float32');
        assert.deepEqual(t.shape, [rows.length, MAXLEN]);
        t.dispose();
    });

    test('all Unicode whitespace normalizes to a space', () => {
        for (const space of ['\u00A0', '\u2009', '\u2002', '\u2003', '\u3000', '\u202F', '\u205F', '\u2028', '\u2029']) {
            assert.equal(normalize(space), ' ', 'U+' + space.codePointAt(0).toString(16) + ' must become a space');
        }
        const text = encode('\u05E9\u05DC\u05D5\u05DD\u2009\u05E2\u05D5\u05DC\u05DD\u202F\u05E9\u05D5\u05D1');
        assert.ok(!text.includes('O'), 'unicode spaces must not glue words');
        assertValidRows(split_to_rows(text, MAXLEN), text);
    });
});

describe('remove_niqqud', () => {
    test('strips all niqqud, dagesh and cantillation marks', () => {
        assert.equal(remove_niqqud('\u05E9\u05B8\u05C1\u05DC\u05D5\u05B9\u05DD'), '\u05E9\u05DC\u05D5\u05DD');
        assert.equal(remove_niqqud('\u05D1\u05BC\u05B0\u05E8\u05B5\u05D0\u05E9\u05B4\u05C1\u05D9\u05EA'), '\u05D1\u05E8\u05D0\u05E9\u05D9\u05EA');
    });
    test('preserves Hebrew punctuation: maqaf, paseq, sof pasuq', () => {
        // \u05BE maqaf, \u05C0 paseq, \u05C3 sof pasuq share the block with
        // the marks but are punctuation and must survive stripping
        const text = '\u05D1\u05D9\u05EA\u05BE\u05E1\u05E4\u05E8 \u05C0 \u05E1\u05D5\u05E3\u05C3';
        assert.equal(remove_niqqud(text), text);
    });

    test('strips cantillation and meteg but keeps the letters', () => {
        // \u0596 tipeha (cantillation), \u05BD meteg
        assert.equal(remove_niqqud('\u05D0\u0596\u05D1\u05BD'), '\u05D0\u05D1');
    });

    test('leaves unmarked text alone', () => {
        const text = '\u05E9\u05DC\u05D5\u05DD hello 123';
        assert.equal(remove_niqqud(text), text);
    });
});

describe('end-to-end with the real model', () => {
    let model;

    before(async () => {
        model = await loadModelFromDisk(join(repoRoot, 'model'));
    });

    test('short sentence gets niqqud', async () => {
        const out = await diacritize(tf, model, 'הם חלק ממאמצי האגודה הלאומית');
        assert.ok(/[ְ-ּ]/.test(out), 'output should contain niqqud marks');
        assert.equal(remove_niqqud(out), 'הם חלק ממאמצי האגודה הלאומית');
    });

    test('select-all-like page text with giant unbroken tokens does not crash', async () => {
        const blob = [
            Array(50).fill('חדשות').join(' '),
            'https://www.ynet.co.il/home/0,7340,L-8,00.html',
            'ynetארועיםמבזקיםכלכלהספורטתרבותדיגיטלבריאותוכושרצרכנותנדלןחופשקניוןדעותקריירהיהדותאוכללימודיםאסטרולוגיהמזגאוויר',
            'כותרת ראשית: דבר מה קרה היום בבוקר.',
            'עוד פסקה עם טקסט עברי רגיל שאמור לקבל ניקוד תקין.',
        ].join(' ');
        const out = await diacritize(tf, model, blob);
        // Structure is preserved: stripping the added niqqud returns the input.
        assert.equal(remove_niqqud(out), remove_niqqud(blob));
    });

    test('large multi-batch input (forces predict batching)', async () => {
        const blob = Array(200).fill('הם חלק ממאמצי האגודה הלאומית לשמירת הטבע בישראל').join(' ');
        const out = await diacritize(tf, model, blob);
        assert.equal(remove_niqqud(out), blob);
    });

    test('characters are preserved exactly, including newlines and tabs', async () => {
        const text = 'שורה ראשונה\nשורה שנייה\tסוף';
        const out = await diacritize(tf, model, text);
        assert.equal(remove_niqqud(out), text);
    });

    test('maqaf survives the full pipeline verbatim', async () => {
        const text = '\u05D1\u05D9\u05EA\u05BE\u05E1\u05E4\u05E8 \u05D7\u05D3\u05E9';
        const out = await diacritize(tf, model, text);
        assert.ok(out.includes('\u05BE'), 'maqaf must not be deleted from dotted text');
        assert.equal(remove_niqqud(out), text);
    });

    test('diacritize_batch: every segment round-trips and gets niqqud', async () => {
        // Batched segments share row context (they are joined with spaces
        // before row-splitting, like the original extension), so outputs are
        // not required to be bit-identical to per-segment runs — but each
        // segment must map back to exactly its own text.
        const texts = [
            'הם חלק ממאמצי האגודה הלאומית',
            'כותרת ראשית: דבר מה קרה היום.',
            'עוד פסקה עם טקסט עברי רגיל.',
        ];
        const batched = await diacritize_batch(tf, model, texts);
        assert.equal(batched.length, texts.length);
        for (let i = 0; i < texts.length; i++) {
            assert.equal(remove_niqqud(batched[i]), texts[i]);
            assert.ok(/[\u05B0-\u05BC]/.test(batched[i]), `segment ${i} should get niqqud`);
        }
    });

    test('one huge segment (paste-page case) round-trips exactly', async () => {
        // The paste page sends a whole textarea as a single segment, so the
        // per-request accumulators must stay aligned at scale.
        const text = Array(400).fill('\u05D4\u05DD \u05D7\u05DC\u05E7 \u05DE\u05DE\u05D0\u05DE\u05E6\u05D9 \u05D4\u05D0\u05D2\u05D5\u05D3\u05D4 \u05D4\u05DC\u05D0\u05D5\u05DE\u05D9\u05EA').join(' ');
        const out = await diacritize(tf, model, text);
        assert.equal(remove_niqqud(out), text);
        assert.ok(/[\u05B0-\u05BC]/.test(out));
    });

    test('no tensor leaks across calls', async () => {
        await diacritize(tf, model, 'בדיקת זיכרון ראשונה');
        const before = tf.memory().numTensors;
        await diacritize_batch(tf, model, ['בדיקת זיכרון שנייה', 'ועוד אחת']);
        assert.equal(tf.memory().numTensors, before);
    });
    test('rows without Hebrew are skipped: Latin-only text is returned unchanged', async () => {
        const latin = ('lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50)).trim();
        const t0 = performance.now();
        const out = await diacritize(tf, model, latin);
        const ms = performance.now() - t0;
        assert.equal(out, latin);
        console.log(`# latin-only blob (${latin.length} chars): ${ms.toFixed(0)}ms`);
    });

    test('Hebrew embedded in a mostly-Latin page still gets niqqud', async () => {
        const blob = 'lorem ipsum dolor sit amet. '.repeat(100) +
            'הם חלק ממאמצי האגודה הלאומית ' +
            'consectetur adipiscing elit. '.repeat(100);
        const t0 = performance.now();
        const out = await diacritize(tf, model, blob);
        const ms = performance.now() - t0;
        assert.equal(remove_niqqud(out), blob);
        assert.ok(/[\u05B0-\u05BC]/.test(out), 'the Hebrew part should still receive niqqud');
        console.log(`# mostly-latin blob (${blob.length} chars): ${ms.toFixed(0)}ms`);
    });
});
