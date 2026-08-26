import {nodeSegment} from './content_lib.mjs';

/**
 * Get the text nodes contained in a given range, skipping nodes whose text
 * is never rendered (script/style/etc.) — a select-all range can intersect
 * Hebrew-containing JSON-LD, which must not be rewritten.
 *
 * @param {Range} range
 * @returns {Text[]}
 */
function getSelectedNodes(range) {
    const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;
    if (!root) return [];

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!range.intersectsNode(node))
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
    toast.setAttribute('dir', 'rtl');
    toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;' +
        'background:#333;color:#fff;padding:10px 16px;border-radius:6px;' +
        'font:14px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35)';
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function setNekudot() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    // pending: id -> how to put the diacritized middle back into its node
    const pending = new Map();
    const segments = [];
    for (const node of getSelectedNodes(range)) {
        const seg = nodeSegment(
            node.textContent,
            node === range.startContainer,
            node === range.endContainer,
            range.startOffset,
            range.endOffset,
        );
        if (!seg) continue;
        const id = segments.length;
        pending.set(id, {node, prefix: seg.prefix, suffix: seg.suffix});
        segments.push({id, text: seg.middle});
    }
    if (segments.length === 0) return;

    const port = chrome.runtime.connect({name: 'nekudot'});
    port.onMessage.addListener((msg) => {
        if (msg.type === 'result') {
            const entry = pending.get(msg.id);
            if (entry && entry.node.isConnected)
                entry.node.textContent = entry.prefix + msg.text + entry.suffix;
            pending.delete(msg.id);
        } else if (msg.type === 'done') {
            port.disconnect();
        } else if (msg.type === 'fatal') {
            console.error('Nekudot failed:', msg.reason);
            showToast('הוספת הניקוד נכשלה');
            port.disconnect();
        }
    });
    port.postMessage({type: 'diacritize', segments});
}

setNekudot();
