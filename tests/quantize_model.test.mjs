import {test, describe, before} from 'node:test';
import assert from 'node:assert/strict';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-wasm';
import {io} from '@tensorflow/tfjs-core';
import {loadLayersModel} from '@tensorflow/tfjs-layers';
import {toHalf, quantizeToFloat16, readModelArtifacts} from '../scripts/quantize_model.mjs';
import {diacritize, remove_niqqud} from '../text_encoding.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');


// Reference float16 round-trip via DataView-free bit math.
function halfToFloat(h) {
    const sign = (h & 0x8000) ? -1 : 1;
    const exp = (h >>> 10) & 0x1f;
    const frac = h & 0x3ff;
    if (exp === 0) return sign * frac * 2 ** -24;
    if (exp === 0x1f) return frac ? NaN : sign * Infinity;
    return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}

describe('toHalf', () => {
    test('exact values round-trip', () => {
        for (const v of [0, 1, -1, 0.5, -0.5, 2, 1024, -1024, 0.25, 65504]) {
            assert.equal(halfToFloat(toHalf(v)), v, `value ${v}`);
        }
    });

    test('signed zero and infinities', () => {
        assert.equal(toHalf(0), 0x0000);
        assert.equal(toHalf(-0), 0x8000);
        assert.equal(toHalf(Infinity), 0x7c00);
        assert.equal(toHalf(-Infinity), 0xfc00);
        assert.ok(Number.isNaN(halfToFloat(toHalf(NaN))));
    });

    test('overflow saturates to infinity, underflow to zero', () => {
        assert.equal(halfToFloat(toHalf(1e6)), Infinity);
        assert.equal(halfToFloat(toHalf(-1e6)), -Infinity);
        assert.equal(halfToFloat(toHalf(1e-10)), 0);
    });

    test('round-trip error is within half precision (relative 2^-11)', () => {
        let x = 0x12345678;
        for (let i = 0; i < 10000; i++) {
            // deterministic LCG so the test is reproducible
            x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
            const v = (x / 2 ** 32 - 0.5) * 8; // typical weight range
            const err = Math.abs(halfToFloat(toHalf(v)) - v);
            assert.ok(err <= Math.max(Math.abs(v) * 2 ** -11, 2 ** -24), `value ${v} err ${err}`);
        }
    });

    test('subnormal ties round to nearest even (sticky bits computed before the shift)', () => {
        const f32 = new Float32Array(1);
        const u32 = new Uint32Array(f32.buffer);
        const fromBits = (bits) => { u32[0] = bits; return f32[0]; };
        // exact counterexamples from review: shifting before the sticky
        // computation rounded these the wrong way by 1 ulp
        assert.equal(toHalf(fromBits(0x33000577)), 0x0001);
        assert.equal(toHalf(fromBits(0xb72c8004)), 0x80ad);
    });

    test('rounds to nearest even', () => {
        // 1 + 2^-11 is exactly between 1 (0x3c00) and 1 + 2^-10 (0x3c01):
        // ties go to the even mantissa.
        assert.equal(toHalf(1 + 2 ** -11), 0x3c00);
        // Just above the tie rounds up.
        assert.equal(toHalf(1 + 2 ** -11 + 2 ** -20), 0x3c01);
    });
});

describe('quantized model', () => {
    let f32model, f16model, srcBytes, quantizedBytes;

    before(async () => {
        assert.ok(await tf.setBackend('wasm'), 'wasm backend must initialize');
        await tf.ready();
        // one disk read serves both models and the size assertion
        const src = await readModelArtifacts(join(repoRoot, 'model'));
        const fromMemory = (modelJSON, weightData) => loadLayersModel(io.fromMemory({
            modelTopology: modelJSON.modelTopology,
            weightSpecs: modelJSON.weightsManifest.flatMap(g => g.weights),
            weightData,
        }));
        f32model = await fromMemory(src.modelJSON, src.weightData);
        const q = quantizeToFloat16(src.modelJSON, src.weightData);
        f16model = await fromMemory(q.modelJSON, q.weightData);
        srcBytes = src.weightData.byteLength;
        quantizedBytes = q.weightData.byteLength;
    });

    test('weights shrink to about half', () => {
        const ratio = quantizedBytes / srcBytes;
        assert.ok(ratio < 0.55, `expected ~0.5, got ${ratio.toFixed(3)}`);
    });

    test('diacritization output stays essentially identical', async () => {
        const samples = [
            'הם חלק ממאמצי האגודה הלאומית לשמירת הטבע בישראל',
            'כותרת ראשית: דבר מה קרה היום בבוקר בעיר הגדולה.',
            'הממשלה אישרה את התקציב החדש לשנת הלימודים הקרובה.',
            'מזג האוויר צפוי להיות חם ויבש ברוב אזורי הארץ.',
            'שחקן הכדורגל כבש שלושה שערים במשחק אמש מול היריבה.',
            'המחקר החדש מגלה ממצאים מפתיעים על אורח החיים שלנו.',
            'ראש העיר הודיע על תוכנית בנייה חדשה בשכונות הדרום.',
            'בית המשפט קיבל את הערעור ופסק פיצויים לתובעים.',
        ];
        let same = 0, total = 0;
        for (const text of samples) {
            const a = await diacritize(tf, f32model, text);
            const b = await diacritize(tf, f16model, text);
            assert.equal(remove_niqqud(b), text, 'quantized output must round-trip');
            const len = Math.max(a.length, b.length);
            for (let i = 0; i < len; i++)
                if (a[i] === b[i]) same++;
            total += len;
        }
        const agreement = same / total;
        console.log(`# f32/f16 agreement: ${(agreement * 100).toFixed(2)}%`);
        assert.ok(agreement >= 0.99,
            `float16 model diverges from float32: ${(agreement * 100).toFixed(2)}% agreement`);
    });
});
