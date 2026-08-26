// Remove-nikud entry point. No model round-trip involved.
//
// What it touches depends on scope, to make destructive stripping always
// an explicit act:
// - Text THIS EXTENSION dotted is restored to its exact original — but
//   only while it still reads exactly what the extension wrote; text
//   edited since has just its marks stripped, so nothing the user typed
//   is ever discarded.
// - With a SELECTION, other text inside the selection is stripped of its
//   marks too — but only the selected part of each node, never the rest.
// - With NO selection (whole-page mode), only the extension's own work is
//   undone: a page's native vocalization (Tanakh, siddur) is never
//   destroyed wholesale. Select text explicitly to strip native marks.
import {remove_niqqud, HEBREW_MARKS_RE} from './text_encoding.mjs';
import {nodeSegment} from './content_lib.mjs';
import {scopedTextNodes, getRegistry, activeEditable} from './content_runtime.mjs';

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

    const {nodes, range} = scopedTextNodes();

    // A focused field counts even with a collapsed selection — undo must
    // stay reachable after the caret moves — but never hijacks an explicit
    // DOM selection elsewhere in the frame (pages love to refocus inputs).
    const editable = range ? null : activeEditable(false);
    if (editable) {
        if (!restoreOurs(editable, editable.value, v => { editable.value = v; })
            && HEBREW_MARKS_RE.test(editable.value))
            editable.value = remove_niqqud(editable.value);
        return;
    }

    for (const node of nodes) {
        const text = node.textContent;
        if (restoreOurs(node, text, v => { node.textContent = v; }))
            continue;
        if (!range)
            continue; // whole-page mode never strips text we didn't write
        const seg = nodeSegment(text, node === range.startContainer,
            node === range.endContainer, range.startOffset, range.endOffset);
        if (!seg || !HEBREW_MARKS_RE.test(seg.middle)) continue;
        node.textContent = seg.prefix + remove_niqqud(seg.middle) + seg.suffix;
    }
}

removeNekudot();
