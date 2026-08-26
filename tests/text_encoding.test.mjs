import {test, describe, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as tf from '@tensorflow/tfjs';
import {normalize, split_to_rows, remove_niqqud, diacritize, diacritize_batch} from '../text_encoding.mjs';

const MAXLEN = 90;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

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
});

describe('end-to-end with the real model', () => {
    let model;

    before(async () => {
        const dir = join(repoRoot, 'model');
        const modelJSON = JSON.parse(await readFile(join(dir, 'model.json'), 'utf8'));
        const weightSpecs = modelJSON.weightsManifest.flatMap(g => g.weights);
        const buffers = await Promise.all(
            modelJSON.weightsManifest.flatMap(g => g.paths).map(p => readFile(join(dir, p))));
        const weightData = new Uint8Array(buffers.reduce((a, b) => a + b.length, 0));
        let offset = 0;
        for (const b of buffers) {
            weightData.set(b, offset);
            offset += b.length;
        }
        model = await tf.loadLayersModel(tf.io.fromMemory({
            modelTopology: modelJSON.modelTopology,
            weightSpecs,
            weightData: weightData.buffer,
        }));
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

    test('diacritize_batch matches per-segment diacritize', async () => {
        const texts = [
            'הם חלק ממאמצי האגודה הלאומית',
            'כותרת ראשית: דבר מה קרה היום.',
            'עוד פסקה עם טקסט עברי רגיל.',
        ];
        const batched = await diacritize_batch(tf, model, texts);
        const separate = [];
        for (const t of texts)
            separate.push(await diacritize(tf, model, t));
        assert.deepEqual(batched, separate);
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
