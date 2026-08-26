// Remove-niqqud entry point. Restores the exact original text of anything
// this extension modified (from the window-scoped registry) and strips
// niqqud marks from everything else in scope. Scope mirrors content.js:
// the selection when this frame has one, otherwise the whole page.
// No model round-trip involved.
import {remove_niqqud} from './text_encoding.mjs';
import {collectTextNodes, getRegistry, activeEditable} from './content_runtime.mjs';

const NIQQUD_RE = /[\u0591-\u05C7]/;

function removeNekudot() {
    const registry = getRegistry();

    const editable = activeEditable();
    if (editable) {
        if (registry.has(editable)) {
            editable.value = registry.get(editable);
            registry.delete(editable);
        } else {
            editable.value = remove_niqqud(editable.value);
        }
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
        nodes = collectTextNodes(document.body);
    }

    for (const node of nodes) {
        if (registry.has(node)) {
            node.textContent = registry.get(node);
            registry.delete(node);
        } else if (NIQQUD_RE.test(node.textContent)) {
            node.textContent = remove_niqqud(node.textContent);
        }
    }
}

removeNekudot();
