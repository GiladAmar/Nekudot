// Modular tfjs imports: only core + layers + backends, instead of the
// full @tensorflow/tfjs bundle (converters, data, vis, ...).
import * as tf from '@tensorflow/tfjs-core';
import {setWasmPaths} from '@tensorflow/tfjs-backend-wasm';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import {loadLayersModel} from '@tensorflow/tfjs-layers';
import {diacritize, diacritize_batch, chunkSegments} from './text_encoding.mjs';

// WASM (SIMD) is the primary backend: benchmarked 12-35x faster than the
// plain CPU backend on this BiLSTM, predictable across machines, and immune
// to the WebGL texture-upload failure class. WebGL remains the fallback.
async function pick_backend() {
    setWasmPaths(chrome.runtime.getURL('wasm/'));
    // Threading is off unconditionally: MV3 service workers have no Worker
    // API (tfjs's feature detection still reports thread support and then
    // crashes with "Worker is not defined"), and even where Worker exists
    // the threaded runtime spawns blob: workers, which this extension's
    // CSP forbids. Only the single-threaded SIMD binary is shipped.
    tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
    for (const backend of ['wasm', 'webgl', 'cpu']) {
        try {
            if (await tf.setBackend(backend)) {
                await tf.ready();
                console.log('Nekudot: using backend', backend);
                globalThis.__nekudotBackend = backend; // observability (e2e tests)
                return;
            }
        } catch (e) {
            console.warn(`Nekudot: backend ${backend} unavailable`, e);
        }
    }
    throw new Error('no tfjs backend available');
}

// Segments are processed in chunks (chunkSegments): each chunk is one
// model.predict call, results stream back per segment, and yielding between
// chunks keeps the service worker responsive on select-all-sized inputs.

async function load_model() {
    await pick_backend();
    const model = await loadLayersModel(chrome.runtime.getURL("model/model.json"));
    // Warm-up: the first predict compiles kernels/shaders; pay that cost at
    // load time instead of on the user's first click.
    await diacritize(tf, model, 'א');
    return model;
}

// Lazy + memoized: the service worker wakes for plenty of model-free work
// (Remove nikud, opening the paste page, frame probes) and must not pay
// backend init + 10MB of weights + warm-up for those. The add-nikud call
// sites prefetch so the model loads while the content script collects text.
let modelPromise = null;
function getModel() {
    if (!modelPromise) {
        const attempt = load_model();
        modelPromise = attempt;
        // a transient load failure must not poison every later request
        attempt.catch(() => {
            if (modelPromise === attempt) modelPromise = null;
        });
        // observability (e2e tests)
        globalThis.__nekudotModelReady = attempt.then(() => true, () => false);
    }
    return modelPromise;
}
// observability (e2e tests): force the lazy load and await readiness
globalThis.__nekudotEnsureModel = () => getModel().then(() => true, () => false);

// Probe every frame for a live selection (in the DOM or inside a focused
// input/textarea), then inject `file` into exactly the frames that have
// one — or into the top frame alone (whole-page mode) when none does.
// The entry files self-select their behavior from the frame's state.
async function invoke(tab, file) {
    if (!tab || tab.id === undefined) return;
    if (file === 'content.js')
        getModel(); // prefetch: load overlaps with text collection
    try {
        const probes = await chrome.scripting.executeScript({
            target: {tabId: tab.id, allFrames: true},
            // NOTE: executeScript serializes this function, so it cannot
            // import. It must mirror the "usable selection" definition in
            // content_runtime.mjs (scopedTextNodes + activeEditable) — if
            // either changes, change both, or the router will inject
            // content.js into frames whose entry point then does nothing.
            func: () => {
                const s = window.getSelection();
                if (s && s.rangeCount > 0 && !s.getRangeAt(0).collapsed) return true;
                const el = document.activeElement;
                if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
                    try {
                        return el.selectionStart != null && el.selectionStart !== el.selectionEnd;
                    } catch (e) { /* unsupported input type */ }
                }
                return false;
            },
        });
        const frameIds = probes.filter(p => p && p.result).map(p => p.frameId);
        const target = frameIds.length > 0
            ? {tabId: tab.id, frameIds}
            // no selection anywhere: whole-page mode in every reachable frame,
            // matching the explicit whole-page menu (and letting no-selection
            // Remove nikud restore iframe work)
            : {tabId: tab.id, allFrames: true};
        if (file === 'content.js') {
            // Probe and injection are two round trips; the selection can
            // collapse in between (page script, stray click). Tell the entry
            // point whether this was a selection request, so it reports the
            // lost selection instead of silently rewriting the whole frame.
            // Written unconditionally (not only when true) so a value left
            // behind by an earlier run can never be read as current.
            await chrome.scripting.executeScript({
                target,
                func: (selectionOnly) => { window.__nekudotSelectionOnly = selectionOnly; },
                args: [frameIds.length > 0],
            });
        }
        await chrome.scripting.executeScript({target, files: [file]});
    } catch (e) {
        console.warn('Nekudot: cannot run on this page', e);
    }
}

chrome.action.onClicked.addListener(tab => invoke(tab, 'content.js'));

// observability (e2e tests): drive the real routing rather than a copy
globalThis.__nekudotInvoke = invoke;
globalThis.__nekudotInvokeWholePage = (tab) => invokeWholePage(tab);

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        // English-first labels: the audience is Hebrew learners.
        chrome.contextMenus.create({
            id: 'nekudot-selection',
            title: 'Add nikud (הוסף ניקוד)',
            contexts: ['selection'],
        });
        chrome.contextMenus.create({
            id: 'nekudot-page',
            title: 'Add nikud to the whole page',
            contexts: ['page'],
        });
        chrome.contextMenus.create({
            id: 'nekudot-remove',
            title: 'Remove nikud (הסר ניקוד)',
            contexts: ['selection', 'page'],
        });
        chrome.contextMenus.create({
            id: 'nekudot-paste-page',
            title: 'Open paste page (works in Google Docs etc.)',
            contexts: ['action'],
        });
    });
});

// Explicit whole-page request: no selection probe — a stray surviving
// selection anywhere in the tab must not narrow the scope the user asked for.
async function invokeWholePage(tab) {
    if (!tab || tab.id === undefined) return;
    getModel(); // prefetch
    try {
        await chrome.scripting.executeScript({
            target: {tabId: tab.id, allFrames: true},
            files: ['content_page.js'],
        });
    } catch (e) {
        console.warn('Nekudot: cannot run on this page', e);
    }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'nekudot-remove')
        invoke(tab, 'content_undo.js');
    else if (info.menuItemId === 'nekudot-page')
        invokeWholePage(tab);
    else if (info.menuItemId === 'nekudot-paste-page')
        chrome.tabs.create({url: chrome.runtime.getURL('paste.html')});
    else
        invoke(tab, 'content.js');
});

chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'add-nekudot') return;
    // the tab argument only exists on newer Chrome; fall back to a query
    if (!tab)
        [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    invoke(tab, 'content.js');
});

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
        m = await getModel();
    } catch (e) {
        console.error('Nekudot: model failed to load', e);
        post(port, {type: 'fatal', reason: 'model failed to load'});
        return;
    }

    try {
        for (const chunk of chunkSegments(segments)) {
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
