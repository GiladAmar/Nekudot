// Remove-nikud entry point. No model round-trip involved.
//
// It only ever undoes THIS EXTENSION'S OWN work: text that came with its
// own vocalisation (a Tanakh, a siddur, a learning site) is never stripped,
// in any scope. And a target is restored only while it still reads exactly
// what the extension wrote — anything edited since is left alone, so
// nothing the user typed is discarded.
//
// Scope decides which of our own changes are undone: the selection when
// this frame has one, otherwise everything in the frame (including
// input/textarea fields, whose entries a text-node walk cannot reach).
import {scopedTextNodes, getRegistry, activeEditable, setEditableValue} from './content_runtime.mjs';

function removeNekudot() {
    const registry = getRegistry();

    // Restore our own work when untouched since; returns false otherwise.
    function restoreOurs(target, current, setText) {
        const record = registry.get(target);
        if (record && current === record.written) {
            setText(record.original);
            registry.delete(target);
            return true;
        }
        return false;
    }

    // An explicit selection inside a field targets that field.
    const editable = activeEditable(true);
    if (editable) {
        restoreOurs(editable, editable.value, v => setEditableValue(editable, v));
        return;
    }

    const {nodes, range} = scopedTextNodes();
    for (const node of nodes)
        restoreOurs(node, node.textContent, v => { node.textContent = v; });

    if (!range) {
        // Whole-frame: fields we dotted are element-keyed in the registry and
        // invisible to the text-node walk, so sweep them too.
        for (const el of document.querySelectorAll('input, textarea'))
            restoreOurs(el, el.value, v => setEditableValue(el, v));
    }
}

removeNekudot();
