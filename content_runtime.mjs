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

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;' +
        'background:#333;color:#fff;padding:10px 16px;border-radius:6px;' +
        'font:14px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35)';
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Original text of every node/element this extension has modified, so
// "remove niqqud" can restore it exactly (including pre-existing partial
// niqqud). Window-scoped: content scripts are re-injected per invocation
// but share the page's isolated world.
function getRegistry() {
    if (!window.__nekudotOriginals)
        window.__nekudotOriginals = new Map();
    return window.__nekudotOriginals;
}

/**
 * Send segments to the background over a port and apply each result to its
 * node as it arrives. `pending` maps segment id -> {node, prefix, suffix}
 * or {apply: fn} for custom targets (e.g. input/textarea values).
 */
function requestDiacritics(segments, pending) {
    if (segments.length === 0) return;

    const registry = getRegistry();
    const port = chrome.runtime.connect({name: 'nekudot'});
    port.onMessage.addListener((msg) => {
        if (msg.type === 'result') {
            const entry = pending.get(msg.id);
            if (entry) {
                if (entry.apply) {
                    entry.apply(msg.text);
                } else if (entry.node.isConnected) {
                    if (!registry.has(entry.node))
                        registry.set(entry.node, entry.node.textContent);
                    entry.node.textContent = entry.prefix + msg.text + entry.suffix;
                }
            }
            pending.delete(msg.id);
        } else if (msg.type === 'done') {
            port.disconnect();
        } else if (msg.type === 'fatal') {
            console.error('Nekudot failed:', msg.reason);
            showToast('Nekudot: adding nikud failed');
            port.disconnect();
        }
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

export {collectTextNodes, showToast, requestDiacritics, getRegistry, activeEditable};
