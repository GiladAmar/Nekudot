// Diacritize entry point. The background's frame probe enforces scope:
// this file is injected only into frames that have a selection, or into
// the top frame alone when no frame has one (whole-page fallback).
import {nodeSegment, isMostlyDotted, collectSegments} from './content_lib.mjs';
import {scopedTextNodes, requestDiacritics, applyWithRegistry, activeEditable, showToast, runWholePage} from './content_runtime.mjs';

// Selection inside an <input>/<textarea>: splice the diacritized text into
// the element's value (DOM walking can't reach it).
function setNekudotEditable(el) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const valueAtRequest = el.value;
    const seg = nodeSegment(valueAtRequest, true, true, start, end);
    if (!seg) return;
    if (isMostlyDotted(seg.middle)) {
        showToast('Nekudot: this text already has nikud');
        return;
    }

    const pending = new Map();
    pending.set(0, {
        apply(text) {
            const rollback = applyWithRegistry(
                el,
                () => el.value,
                v => { el.value = v; },
                valueAtRequest,
                seg.prefix + text + seg.suffix,
            );
            if (rollback)
                el.setSelectionRange(start, start + text.length);
            return rollback;
        }
    });
    requestDiacritics([{id: 0, text: seg.middle}], pending);
}

function setNekudot() {
    const editable = activeEditable();
    if (editable) {
        setNekudotEditable(editable);
        return;
    }

    const {nodes, range} = scopedTextNodes();
    if (!range) {
        if (window === window.top)
            showToast('Nekudot: no selection — adding nikud to the whole page');
        runWholePage();
        return;
    }

    const {pending, segments, alreadyDotted} = collectSegments(nodes, range);
    if (segments.length === 0) {
        if (alreadyDotted > 0)
            showToast('Nekudot: this text already has nikud');
        return;
    }
    requestDiacritics(segments, pending);
}

setNekudot();
