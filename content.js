// Entry point for diacritizing the current selection. The background probes
// frames for a selection and injects this file only where one exists.
import {nodeSegment} from './content_lib.mjs';
import {collectTextNodes, requestDiacritics} from './content_runtime.mjs';

function setNekudot() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;
    if (!root) return;

    // pending: id -> how to put the diacritized middle back into its node
    const pending = new Map();
    const segments = [];
    for (const node of collectTextNodes(root, range)) {
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
    requestDiacritics(segments, pending);
}

setNekudot();
