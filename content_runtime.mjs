// Shared DOM runtime for the content entry points (selection & whole-page).

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
                if (node.parentElement && node.parentElement.closest('script,style,noscript,template'))
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
    return {nodes: collectTextNodes(document.body), range: null};
}

function showToast(message) {
    const toast = document.createElement('div');
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
 * Send segments to the background over a port and apply each result to its
 * node as it arrives. `pending` maps segment id -> {node, prefix, suffix}
 * or {apply: fn} for custom targets (e.g. input/textarea values); a custom
 * apply returns a rollback function, or null when it did not apply.
 *
 * If the run fails part-way (a 'fatal' message, or the service worker dying
 * and disconnecting the port), everything already applied in THIS run is
 * rolled back so the page is never left half-processed.
 */
function requestDiacritics(segments, pending) {
    if (segments.length === 0) return;

    const registry = getRegistry();
    const rollbacks = [];
    let finished = false;

    function applyToNode(entry, text) {
        const node = entry.node;
        if (!node.isConnected) return;
        const before = node.textContent;
        if (!registry.has(node))
            registry.set(node, {original: before, written: null});
        const record = registry.get(node);
        node.textContent = entry.prefix + text + entry.suffix;
        const after = node.textContent;
        record.written = after;
        rollbacks.push(() => {
            if (!node.isConnected || node.textContent !== after) return;
            node.textContent = before;
            if (record.original === before) registry.delete(node);
            else record.written = before;
        });
    }

    const port = chrome.runtime.connect({name: 'nekudot'});

    function fail(message) {
        finished = true;
        for (const rollback of rollbacks.reverse()) rollback();
        showToast(message);
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

// The focused input/textarea, if it has a usable text selection.
// (selectionStart throws for some input types, e.g. number/email.)
function activeEditable() {
    const el = document.activeElement;
    if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT'))
        return null;
    try {
        if (el.selectionStart != null && el.selectionStart !== el.selectionEnd)
            return el;
    } catch (e) { /* unsupported input type */ }
    return null;
}

export {collectTextNodes, scopedTextNodes, showToast, requestDiacritics, getRegistry, activeEditable};
