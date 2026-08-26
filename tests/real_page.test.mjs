// Run a REAL downloaded ynet homepage through the extension's exact
// pipeline: content-script node collection & segmentation (via jsdom) ->
// background chunking -> the real model. This automates what used to be
// manual testing (Ctrl+A on ynet + clicking the icon).
//
// The fixture is gitignored (third-party content); fetch it with
// `npm run fixtures`. Tests skip cleanly when it is absent.
import {test, describe, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-wasm';
import {JSDOM} from 'jsdom';
import {loadModelFromDisk} from '../scripts/model_loader.mjs';
import {nodeSegment} from '../content_lib.mjs';
import {collectTextNodes} from '../content_runtime.mjs';
import {remove_niqqud, diacritize_batch} from '../text_encoding.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(repoRoot, 'tests', 'fixtures', 'ynet-home.html');
const SEGMENTS_PER_CHUNK = 32; // mirrors background.js

const NIQQUD_RE = /[ְ-ּ]/;

describe('real ynet homepage through the full pipeline', {skip: !existsSync(FIXTURE) && 'fixture missing — run `npm run fixtures`'}, () => {
    let dom, model;

    before(async () => {
        await tf.setBackend('wasm');
        await tf.ready();
        dom = new JSDOM(await readFile(FIXTURE, 'utf8'));
        // content_runtime's DOM helpers resolve these at call time
        global.document = dom.window.document;
        global.NodeFilter = dom.window.NodeFilter;
        global.Node = dom.window.Node;
        model = await loadModelFromDisk(join(repoRoot, 'model'));
    });

    function collectSegments(range = null) {
        const root = range ? range.commonAncestorContainer : dom.window.document.body;
        const segments = [];
        for (const node of collectTextNodes(root, range)) {
            const seg = range
                ? nodeSegment(node.textContent, node === range.startContainer,
                    node === range.endContainer, range.startOffset, range.endOffset)
                : nodeSegment(node.textContent, false, false, 0, 0);
            if (seg) segments.push(seg.middle);
        }
        return segments;
    }

    async function runPipeline(segments) {
        const results = [];
        for (let i = 0; i < segments.length; i += SEGMENTS_PER_CHUNK)
            results.push(...await diacritize_batch(tf, model, segments.slice(i, i + SEGMENTS_PER_CHUNK)));
        return results;
    }

    test('whole-page mode: every segment survives and round-trips exactly', async () => {
        const segments = collectSegments();
        assert.ok(segments.length > 50, `expected a real page, got ${segments.length} segments`);
        const chars = segments.reduce((a, s) => a + s.length, 0);

        const t0 = performance.now();
        const results = await runPipeline(segments);
        const ms = performance.now() - t0;

        assert.equal(results.length, segments.length);
        for (let i = 0; i < segments.length; i++) {
            assert.equal(remove_niqqud(results[i]), remove_niqqud(segments[i]),
                `segment ${i} must round-trip exactly`);
        }

        const dotted = results.filter(r => NIQQUD_RE.test(r)).length;
        console.log(`# ynet whole page: ${segments.length} segments, ${chars} chars, ` +
            `${dotted} received niqqud, ${(ms / 1000).toFixed(1)}s`);
        assert.ok(dotted / results.length > 0.8,
            `most Hebrew segments should receive niqqud (got ${dotted}/${results.length})`);
    });

    test('select-all (Ctrl+A) selection path yields the same segments', (t) => {
        const doc = dom.window.document;
        const range = doc.createRange();
        try {
            range.selectNodeContents(doc.body);
            range.intersectsNode(doc.body);
        } catch (e) {
            t.skip('jsdom Range.intersectsNode unsupported');
            return;
        }
        const viaSelection = collectSegments(range);
        const viaWholePage = collectSegments();
        assert.deepEqual(viaSelection, viaWholePage,
            'Ctrl+A over <body> must segment identically to whole-page mode');
    });

    test('no script/style/JSON-LD text leaks into the segments', () => {
        const doc = dom.window.document;
        const scriptTexts = [...doc.querySelectorAll('script')]
            .map(s => s.textContent.trim()).filter(s => s.length > 40);
        const segments = new Set(collectSegments().map(s => s.trim()));
        for (const s of scriptTexts)
            assert.ok(!segments.has(s), 'script content must never be diacritized');
    });
});
