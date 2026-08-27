// Measure how much segment packing changes the model's output.
//
// diacritize_batch joins segments with spaces before row-splitting, so a
// segment's vowels can depend on its neighbours in the batch (a 3x speed
// win). This script quantifies that against per-segment inference on a
// real page fixture: character-level agreement, and how often a Hebrew
// letter's marks differ.
//
// Usage: node scripts/packing_accuracy.mjs [fixture-name]
import {readFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-wasm';
import {JSDOM} from 'jsdom';
import {loadModelFromDisk} from './model_loader.mjs';
import {collectSegments} from '../content_lib.mjs';
import {collectTextNodes} from '../content_runtime.mjs';
import {diacritize, diacritize_batch, remove_niqqud, chunkSegments} from '../text_encoding.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = process.argv[2] || 'ynet-home.html';

if (!await tf.setBackend('wasm')) throw new Error('wasm backend unavailable');
await tf.ready();

const dom = new JSDOM(await readFile(join(repoRoot, 'tests', 'fixtures', fixture), 'utf8'));
global.document = dom.window.document;
global.NodeFilter = dom.window.NodeFilter;
global.Node = dom.window.Node;

const segments = collectSegments(collectTextNodes(dom.window.document.body), null)
    .segments.map(s => s.text);
console.log(`${fixture}: ${segments.length} segments`);

const model = await loadModelFromDisk(join(repoRoot, 'model'));

const t0 = performance.now();
const packed = [];
for (const chunk of chunkSegments(segments.map(text => ({text}))))
    packed.push(...await diacritize_batch(tf, model, chunk.map(s => s.text)));
const packedMs = performance.now() - t0;

const t1 = performance.now();
const separate = [];
for (const s of segments)
    separate.push(await diacritize(tf, model, s));
const separateMs = performance.now() - t1;

let sameChars = 0, totalChars = 0, differingSegments = 0;
let markedLetters = 0, differingLetters = 0;
const examples = [];
for (let i = 0; i < segments.length; i++) {
    const a = packed[i], b = separate[i];
    if (a !== b && examples.length < 5)
        examples.push({packed: a, separate: b});
    if (a !== b) differingSegments++;
    const len = Math.max(a.length, b.length);
    for (let j = 0; j < len; j++) {
        totalChars++;
        if (a[j] === b[j]) sameChars++;
    }
    // per-letter comparison: split each into letter+marks clusters
    const clusters = (s) => s.match(/[א-ת][ְ-ּׁׂ]*/g) || [];
    const ca = clusters(a), cb = clusters(b);
    for (let j = 0; j < Math.min(ca.length, cb.length); j++) {
        markedLetters++;
        if (ca[j] !== cb[j]) differingLetters++;
    }
}

console.log(`packed:   ${(packedMs / 1000).toFixed(1)}s`);
console.log(`separate: ${(separateMs / 1000).toFixed(1)}s  (${(separateMs / packedMs).toFixed(1)}x slower)`);
console.log(`character agreement: ${(sameChars / totalChars * 100).toFixed(2)}%`);
console.log(`letters differing in marks: ${differingLetters}/${markedLetters} ` +
    `(${(differingLetters / markedLetters * 100).toFixed(2)}%)`);
console.log(`segments differing at all: ${differingSegments}/${segments.length}`);
for (const e of examples) {
    console.log(`  packed:   ${e.packed.slice(0, 70)}`);
    console.log(`  separate: ${e.separate.slice(0, 70)}`);
}
// sanity: both must round-trip to the same undotted text
for (let i = 0; i < segments.length; i++) {
    if (remove_niqqud(packed[i]) !== remove_niqqud(separate[i]))
        throw new Error(`round-trip mismatch at segment ${i}`);
}
console.log('round-trip: identical for all segments');
