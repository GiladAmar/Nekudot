import * as tf from '@tensorflow/tfjs';
import {diacritize, diacritize_batch} from './text_encoding.mjs';

// Segments are processed in chunks: each chunk is one model.predict call,
// results stream back per segment, and yielding between chunks keeps the
// service worker responsive on select-all-sized inputs.
const SEGMENTS_PER_CHUNK = 32;

async function load_model() {
    const model = await tf.loadLayersModel(chrome.runtime.getURL("model/model.json"));
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
