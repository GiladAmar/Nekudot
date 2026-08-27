// Remove-nikud entry point. No model round-trip involved.
//
// What it touches depends on scope, to make destructive stripping always
// an explicit act:
// - Text THIS EXTENSION dotted is restored to its exact original — but
//   only while it still reads exactly what the extension wrote; text
//   edited since has just its marks stripped, so nothing the user typed
//   is ever discarded.
// - With a SELECTION (in the page, or inside a field), other text inside
//   the selection's target is stripped of its marks too — but for page
//   nodes only the selected part, never the rest.
// - With NO selection (whole-page mode), only the extension's own work is
//   undone — including in input/textarea fields, whose registry entries a
//   DOM text-node walk cannot reach. A page's native vocalization
//   (Tanakh, siddur) is never destroyed wholesale; select text explicitly
//   to strip native marks.
import {remove_niqqud, HEBREW_MARKS_RE} from './text_encoding.mjs';
import {nodeSegment} from './content_lib.mjs';
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

    function undoField(el, stripUnowned) {
        if (restoreOurs(el, el.value, v => setEditableValue(el, v)))
            return;
        if (stripUnowned && HEBREW_MARKS_RE.test(el.value))
            setEditableValue(el, remove_niqqud(el.value));
    }

    // An explicit selection inside a field targets that field.
    const editable = activeEditable(true);
    if (editable) {
        undoField(editable, true);
        return;
    }

    const {nodes, range} = scopedTextNodes();
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

    if (!range) {
        // Whole-page: fields we dotted are element-keyed in the registry and
        // invisible to the text-node walk — sweep them (restore-ours-only).
        for (const el of document.querySelectorAll('input, textarea'))
            undoField(el, false);
    }
}

removeNekudot();
