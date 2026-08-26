// Diacritize entry point. The background's frame probe enforces scope:
// this file is injected only into frames that have a selection, or into
// the top frame alone when no frame has one (whole-page mode).
import {nodeSegment} from './content_lib.mjs';
import {collectTextNodes, requestDiacritics, getRegistry, activeEditable, showToast} from './content_runtime.mjs';

// Selection inside an <input>/<textarea>: splice the diacritized text into
// the element's value (DOM walking can't reach it).
function setNekudotEditable(el) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const seg = nodeSegment(el.value, true, true, start, end);
    if (!seg) return;

    const pending = new Map();
    pending.set(0, {
        apply(text) {
            const registry = getRegistry();
            if (!registry.has(el))
                registry.set(el, el.value);
            el.value = seg.prefix + text + seg.suffix;
            el.setSelectionRange(start, start + text.length);
        }
    });
    requestDiacritics([{id: 0, text: seg.middle}], pending);
}

function collectSegments(nodes, range) {
    const pending = new Map();
    const segments = [];
    for (const node of nodes) {
        const seg = range
            ? nodeSegment(node.textContent, node === range.startContainer,
                node === range.endContainer, range.startOffset, range.endOffset)
            : nodeSegment(node.textContent, false, false, 0, 0);
        if (!seg) continue;
        const id = segments.length;
        pending.set(id, {node, prefix: seg.prefix, suffix: seg.suffix});
        segments.push({id, text: seg.middle});
    }
    return {pending, segments};
}

function setNekudot() {
    const editable = activeEditable();
    if (editable) {
        setNekudotEditable(editable);
        return;
    }

    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed
        ? selection.getRangeAt(0)
        : null;

    let nodes;
    if (range) {
        const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentElement
            : range.commonAncestorContainer;
        if (!root) return;
        nodes = collectTextNodes(root, range);
    } else {
        nodes = collectTextNodes(document.body); // whole-page mode
    }

    const {pending, segments} = collectSegments(nodes, range);
    if (segments.length === 0) {
        if (!range) showToast('לא נמצא טקסט בעברית בדף');
        return;
    }
    requestDiacritics(segments, pending);
}

setNekudot();
