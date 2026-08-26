// Remove-nikud entry point. Restores the exact original text of anything
// this extension modified — but only while the target still reads exactly
// what the extension wrote; text edited since is stripped of marks in
// place instead, so nothing the user typed is ever discarded. Scope
// mirrors content.js: the selection when this frame has one, otherwise
// the whole page. No model round-trip involved.
import {remove_niqqud} from './text_encoding.mjs';
import {scopedTextNodes, getRegistry, activeEditable} from './content_runtime.mjs';

const NIQQUD_RE = /[\u0591-\u05C7]/;

function removeNekudot() {
    const registry = getRegistry();

    function restore(target, getText, setText) {
        const current = getText();
        const record = registry.get(target);
        if (record && current === record.written) {
            setText(record.original);
            registry.delete(target);
        } else if (NIQQUD_RE.test(current)) {
            // Edited since we wrote it (or never ours): lossless strip.
            setText(remove_niqqud(current));
        }
    }

    const editable = activeEditable();
    if (editable) {
        restore(editable, () => editable.value, v => { editable.value = v; });
        return;
    }

    const {nodes} = scopedTextNodes();
    for (const node of nodes)
        restore(node, () => node.textContent, v => { node.textContent = v; });
}

removeNekudot();
