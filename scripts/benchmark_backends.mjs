// Benchmark diacritization across tfjs backends available in Node.
// Usage: npm run bench
// The extension runs WebGL in the browser (not measurable here); this
// compares the CPU and WASM backends to decide whether shipping the WASM
// backend as a fallback is worthwhile.
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-wasm';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadModelFromDisk} from './model_loader.mjs';
import {diacritize} from '../text_encoding.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const SHORT = 'הם חלק ממאמצי האגודה הלאומית לשמירת הטבע בישראל';
const LONG = Array(50).fill(SHORT).join(' ');

async function bench(backend) {
    await tf.setBackend(backend);
    await tf.ready();
    const model = await loadModelFromDisk(join(repoRoot, 'model'));
    await diacritize(tf, model, 'א'); // warm-up

    const results = {};
    for (const [name, text] of [['short', SHORT], ['long', LONG]]) {
        const times = [];
        for (let i = 0; i < 3; i++) {
            const t0 = performance.now();
            await diacritize(tf, model, text);
            times.push(performance.now() - t0);
        }
        results[name] = Math.min(...times);
    }
    model.dispose();
    return results;
}

for (const backend of ['cpu', 'wasm']) {
    try {
        const r = await bench(backend);
        console.log(`${backend.padEnd(5)} short (${SHORT.length} chars): ${r.short.toFixed(0)}ms   long (${LONG.length} chars): ${r.long.toFixed(0)}ms`);
    } catch (e) {
        console.log(`${backend.padEnd(5)} unavailable: ${e.message}`);
    }
}
