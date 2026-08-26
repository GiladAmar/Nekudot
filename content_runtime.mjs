// Shared DOM runtime for the content entry points (selection & whole-page).
import {collectSegments} from './content_lib.mjs';

/**
 * Collect text nodes under root, optionally restricted to a Range, skipping
 * nodes whose text is never rendered (script/style/etc.) — a select-all
 * range can intersect Hebrew-containing JSON-LD, which must not be rewritten.
 *
 * @param {Node} root
 * @param {Range|null} range
 * @returns {Text[]}
 */
function collectTextNodes(root, range = null) {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (range && !range.intersectsNode(node))
                    return NodeFilter.FILTER_REJECT;
                // script/style: never rendered. option/select/textarea:
                // rewriting their text nodes changes submitted form values.
                if (node.parentElement && node.parentElement.closest('script,style,noscript,template,option,select,textarea'))
                    return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode())
        nodes.push(node);
    return nodes;
}

/**
 * The text nodes this invocation should operate on: the current selection's
 * nodes when this frame has one, otherwise the whole page.
 * Returns {nodes, range} — range is null in whole-page mode.
 */
function scopedTextNodes() {
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed
        ? selection.getRangeAt(0)
        : null;
    if (range) {
        const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentElement
            : range.commonAncestorContainer;
        return {nodes: root ? collectTextNodes(root, range) : [], range};
    }
    // document.body is null on SVG/XML documents and some subframes
    return {nodes: document.body ? collectTextNodes(document.body) : [], range: null};
}

function showToast(message) {
    const previous = document.getElementById('__nekudot-toast');
    if (previous) previous.remove();
    const toast = document.createElement('div');
    toast.id = '__nekudot-toast';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;' +
        'background:#333;color:#fff;padding:10px 16px;border-radius:6px;' +
        'font:14px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35)';
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// What this extension has written, so "remove nikud" can restore originals
// and so a failed run can roll back. Each record is
//   {original: <text before we ever touched the target>,
//    written:  <what we last wrote>}
// — a restore only happens while the current text still equals `written`;
// anything the page or user changed since is left alone. WeakMap: detached
// nodes must not be pinned for the page's lifetime. Window-scoped because
// content scripts are re-injected per invocation but share the page's
// isolated world.
function getRegistry() {
    if (!window.__nekudotOriginals)
        window.__nekudotOriginals = new WeakMap();
    return window.__nekudotOriginals;
}

/**
 * The single implementation of the registry contract, shared by the DOM
 * node path and the input/textarea path. Writes `newText` to the target
 * (via read/write closures) and maintains its {original, written} record:
 * - a stale target (current text !== the snapshot taken at request time)
 *   is left alone — user/page changes are never clobbered;
 * - text edited since our last write becomes the new `original`, so
 *   Remove nikud gives back the edited text, not a pre-edit state.
 * Returns a rollback function, or null when nothing was applied.
 */
function applyWithRegistry(target, read, write, snapshot, newText) {
    if (read() !== snapshot) return null;
    const registry = getRegistry();
    let record = registry.get(target);
    if (!record) {
        record = {original: snapshot, written: null};
        registry.set(target, record);
    } else if (record.written !== snapshot) {
        record.original = snapshot;
    }
    write(newText);
    const after = read();
    record.written = after;
    return () => {
        if (read() !== after) return;
        write(snapshot);
        if (record.original === snapshot) registry.delete(target);
        else record.written = snapshot;
    };
}

/**
 * Send segments to the background over a port and apply each result to its
 * node as it arrives. `pending` maps segment id -> {node, prefix, suffix}
 * or {apply: fn} for custom targets (e.g. input/textarea values); a custom
 * apply returns a rollback function, or null when it did not apply.
 *
 * If the run fails part-way (a 'fatal' message, or the service worker dying
 * and disconnecting the port), everything already applied in THIS run is
 * rolled back so the page is never left half-processed.
 *
 * Optional callbacks: onDone() after a successful run; onFail(message)
 * after rollback on failure (default: a toast).
 */
function requestDiacritics(segments, pending, {onDone, onFail} = {}) {
    if (segments.length === 0) return;

    const registry = getRegistry();
    const rollbacks = [];
    let finished = false;

    function applyToNode(entry, text) {
        const node = entry.node;
        if (!node.isConnected) return;
        const rollback = applyWithRegistry(
            node,
            () => node.textContent,
            v => { node.textContent = v; },
            entry.whole,
            entry.prefix + text + entry.suffix,
        );
        if (rollback) rollbacks.push(rollback);
    }

    const port = chrome.runtime.connect({name: 'nekudot'});

    function fail(message) {
        finished = true;
        for (const rollback of rollbacks.reverse()) rollback();
        if (onFail) onFail(message);
        else showToast(message);
        try { port.disconnect(); } catch (e) { /* already gone */ }
    }

    port.onMessage.addListener((msg) => {
        if (finished) return;
        if (msg.type === 'result') {
            const entry = pending.get(msg.id);
            if (entry) {
                if (entry.apply) {
                    const rollback = entry.apply(msg.text);
                    if (rollback) rollbacks.push(rollback);
                } else {
                    applyToNode(entry, msg.text);
                }
            }
            pending.delete(msg.id);
        } else if (msg.type === 'done') {
            finished = true;
            port.disconnect();
            if (onDone) onDone();
        } else if (msg.type === 'fatal') {
            console.error('Nekudot failed:', msg.reason);
            fail('Nekudot: adding nikud failed — the page was restored');
        }
    });
    // Service worker death (reload, crash, OOM) closes the port without a
    // 'done'/'fatal'; without this the run would end silently half-applied.
    port.onDisconnect.addListener(() => {
        if (!finished) fail('Nekudot: interrupted — the page was restored');
    });
    port.postMessage({type: 'diacritize', segments});
}

// The focused input/textarea. By default it must hold a text selection
// (adding nikud targets the selection); pass requireSelection=false for
// operations on the whole field, e.g. Remove nikud after the selection
// collapsed. (selectionStart throws for some input types, e.g. number.)
function activeEditable(requireSelection = true) {
    const el = document.activeElement;
    if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT'))
        return null;
    try {
        if (el.selectionStart == null)
            return null;
        if (!requireSelection || el.selectionStart !== el.selectionEnd)
            return el;
    } catch (e) { /* unsupported input type */ }
    return null;
}

// The whole-page flow, shared by the explicit menu entry (content_page.js)
// and content.js's no-selection fallback.
function runWholePage() {
    // document.body is null on SVG/XML documents and some subframes
    const nodes = document.body ? collectTextNodes(document.body) : [];
    const {pending, segments, alreadyDotted} = collectSegments(nodes, null);
    if (segments.length === 0) {
        // injected into all frames: only the top frame reports, so a
        // Hebrew-free iframe doesn't toast over a page that was processed
        if (window === window.top)
            showToast(alreadyDotted > 0
                ? 'Nekudot: this page already has nikud'
                : 'Nekudot: no Hebrew text found on this page');
        return;
    }
    requestDiacritics(segments, pending);
}

export {
    collectTextNodes, scopedTextNodes, showToast, requestDiacritics,
    getRegistry, applyWithRegistry, activeEditable, runWholePage,
};
