// Diacritize entry point. The background's frame probe enforces scope:
// this file is injected only into frames that have a selection, or into
// the top frame alone when no frame has one (whole-page fallback).
import {nodeSegment, isMostlyDotted, collectSegments} from './content_lib.mjs';
import {scopedTextNodes, requestDiacritics, getRegistry, activeEditable, showToast} from './content_runtime.mjs';

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
            // The user may have typed while the model ran; never clobber it.
            if (el.value !== valueAtRequest) return null;
            const registry = getRegistry();
            if (!registry.has(el))
                registry.set(el, {original: valueAtRequest, written: null});
            const record = registry.get(el);
            el.value = seg.prefix + text + seg.suffix;
            const after = el.value;
            record.written = after;
            el.setSelectionRange(start, start + text.length);
            return () => {
                if (el.value !== after) return;
                el.value = valueAtRequest;
                if (record.original === valueAtRequest) registry.delete(el);
                else record.written = valueAtRequest;
            };
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
    if (!range)
        showToast('Nekudot: no selection — adding nikud to the whole page');

    const {pending, segments, alreadyDotted} = collectSegments(nodes, range);
    if (segments.length === 0) {
        if (alreadyDotted > 0)
            showToast('Nekudot: this text already has nikud');
        else if (!range)
            showToast('Nekudot: no Hebrew text found on this page');
        return;
    }
    requestDiacritics(segments, pending);
}

setNekudot();
