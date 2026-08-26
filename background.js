// Modular tfjs imports: only core + layers + backends, instead of the
// full @tensorflow/tfjs bundle (converters, data, vis, ...).
import * as tf from '@tensorflow/tfjs-core';
import {setWasmPaths} from '@tensorflow/tfjs-backend-wasm';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import {loadLayersModel} from '@tensorflow/tfjs-layers';
import {diacritize, diacritize_batch} from './text_encoding.mjs';

// WASM (SIMD) is the primary backend: benchmarked 12-35x faster than the
// plain CPU backend on this BiLSTM, predictable across machines, and immune
// to the WebGL texture-upload failure class. WebGL remains the fallback.
async function pick_backend() {
    setWasmPaths(chrome.runtime.getURL('wasm/'));
    // MV3 service workers have no Worker API, but tfjs's feature detection
    // still reports thread support and then crashes spawning workers
    // ("ReferenceError: Worker is not defined"). Force the single-threaded
    // SIMD binary where workers don't exist.
    if (typeof Worker === 'undefined')
        tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
    for (const backend of ['wasm', 'webgl', 'cpu']) {
        try {
            if (await tf.setBackend(backend)) {
                await tf.ready();
                console.log('Nekudot: using backend', backend);
                return;
            }
        } catch (e) {
            console.warn(`Nekudot: backend ${backend} unavailable`, e);
        }
    }
    throw new Error('no tfjs backend available');
}

// Segments are processed in chunks: each chunk is one model.predict call,
// results stream back per segment, and yielding between chunks keeps the
// service worker responsive on select-all-sized inputs.
const SEGMENTS_PER_CHUNK = 32;

async function load_model() {
    await pick_backend();
    const model = await loadLayersModel(chrome.runtime.getURL("model/model.json"));
    // Warm-up: the first predict compiles kernels/shaders; pay that cost at
    // load time instead of on the user's first click.
    await diacritize(tf, model, 'א');
    return model;
}

const model = load_model();

function inject(tab) {
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ['content.js'],
    });
}

chrome.action.onClicked.addListener(inject);

function post(port, message) {
    try {
        port.postMessage(message);
        return true;
    } catch (e) {
        return false; // port gone (tab navigated or closed) — stop quietly
    }
}

async function handleRequest(port, segments) {
    let m;
    try {
        m = await model;
    } catch (e) {
        console.error('Nekudot: model failed to load', e);
        post(port, {type: 'fatal', reason: 'model failed to load'});
        return;
    }

    try {
        for (let i = 0; i < segments.length; i += SEGMENTS_PER_CHUNK) {
            const chunk = segments.slice(i, i + SEGMENTS_PER_CHUNK);
            const results = await diacritize_batch(tf, m, chunk.map(s => s.text));
            for (let j = 0; j < chunk.length; j++) {
                if (!post(port, {type: 'result', id: chunk[j].id, text: results[j]}))
                    return;
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        post(port, {type: 'done'});
    } catch (e) {
        console.error('Nekudot: diacritization failed', e);
        post(port, {type: 'fatal', reason: String((e && e.message) || e)});
    }
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'nekudot') return;
    port.onMessage.addListener((msg) => {
        if (msg && msg.type === 'diacritize' && Array.isArray(msg.segments))
            handleRequest(port, msg.segments);
    });
});
