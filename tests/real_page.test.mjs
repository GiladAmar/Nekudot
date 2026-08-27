// Run REAL downloaded news homepages through the extension's exact
// pipeline: content-script node collection & segmentation (via jsdom) ->
// background chunking -> the real model. This automates what used to be
// manual testing (Ctrl+A on the site + clicking the icon).
//
// Fixtures are gitignored (third-party content); fetch them with
// `npm run fixtures`. Tests skip cleanly when a fixture is absent.
import {test, describe, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-wasm';
import {JSDOM} from 'jsdom';
import {loadModelFromDisk} from '../scripts/model_loader.mjs';
import {FIXTURES} from '../scripts/fixtures_list.mjs';
import {collectSegments} from '../content_lib.mjs';
import {collectTextNodes} from '../content_runtime.mjs';
import {remove_niqqud, diacritize_batch, chunkSegments} from '../text_encoding.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const NIQQUD_RE = /[ְ-ּ]/;

let model = null;
async function getModel() {
    if (!model) {
        assert.ok(await tf.setBackend('wasm'), 'wasm backend must initialize');
        await tf.ready();
        model = await loadModelFromDisk(join(repoRoot, 'model'));
    }
    return model;
}

for (const {name: fixtureName} of FIXTURES) {
    const fixturePath = join(repoRoot, 'tests', 'fixtures', fixtureName);

    describe(`real page through the full pipeline: ${fixtureName}`,
        {skip: !existsSync(fixturePath) && 'fixture missing — run `npm run fixtures`'}, () => {
        let dom;

        before(async () => {
            dom = new JSDOM(await readFile(fixturePath, 'utf8'));
            // content_runtime's DOM helpers resolve these at call time
            global.document = dom.window.document;
            global.NodeFilter = dom.window.NodeFilter;
            global.Node = dom.window.Node;
        });

        // These globals are shared state: without teardown, running suites
        // concurrently would walk one fixture's DOM while segmenting another.
        after(() => {
            delete global.document;
            delete global.NodeFilter;
            delete global.Node;
            dom.window.close();
        });

        // the extension's exact segment collection (shared code, not a copy)
        function pageSegments(range = null) {
            const root = range ? range.commonAncestorContainer : dom.window.document.body;
            const nodes = collectTextNodes(root, range);
            return collectSegments(nodes, range).segments.map(s => s.text);
        }

        test('whole-page mode: every segment survives and round-trips exactly', async () => {
            const m = await getModel();
            const segments = pageSegments();
            assert.ok(segments.length > 20, `expected a real page, got ${segments.length} segments`);
            const chars = segments.reduce((a, s) => a + s.length, 0);

            const t0 = performance.now();
            const results = [];
            // the production chunking path, not a copy of it
            for (const chunk of chunkSegments(segments.map(text => ({text}))))
                results.push(...await diacritize_batch(tf, m, chunk.map(s => s.text)));
            const ms = performance.now() - t0;

            assert.equal(results.length, segments.length);
            for (let i = 0; i < segments.length; i++) {
                assert.equal(remove_niqqud(results[i]), remove_niqqud(segments[i]),
                    `segment ${i} must round-trip exactly`);
            }

            const dotted = results.filter(r => NIQQUD_RE.test(r)).length;
            console.log(`# ${fixtureName}: ${segments.length} segments, ${chars} chars, ` +
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
            const viaSelection = pageSegments(range);
            const viaWholePage = pageSegments();
            assert.deepEqual(viaSelection, viaWholePage,
                'Ctrl+A over <body> must segment identically to whole-page mode');
        });

        test('no script/style/JSON-LD text leaks into the segments', () => {
            const doc = dom.window.document;
            const scriptTexts = [...doc.querySelectorAll('script')]
                .map(s => s.textContent.trim()).filter(s => s.length > 40);
            const segments = new Set(pageSegments().map(s => s.trim()));
            for (const s of scriptTexts)
                assert.ok(!segments.has(s), 'script content must never be diacritized');
        });
    });
}
