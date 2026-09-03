// Diacritize entry point. The background's frame probe enforces scope:
// this file is injected into the frames that have a selection, or — when
// no frame has one — into every reachable frame for whole-page mode.
import {nodeSegment, isMostlyDiacritized, collectSegments} from './content_lib.mjs';
import {scopedTextNodes, requestDiacritics, applyWithRegistry, activeEditable, setEditableValue, showToast, runWholePage} from './content_runtime.mjs';

// Selection inside an <input>/<textarea>: splice the diacritized text into
// the element's value (DOM walking can't reach it).
function setNekudotEditable(el) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const valueAtRequest = el.value;
    const seg = nodeSegment(valueAtRequest, true, true, start, end);
    if (!seg) {
        showToast('Nekudot: no Hebrew text in the selection');
        return;
    }
    if (isMostlyDiacritized(seg.middle)) {
        showToast('Nekudot: this text already has nikud');
        return;
    }

    const pending = new Map();
    pending.set(0, {
        apply(text) {
            const rollback = applyWithRegistry(
                el,
                () => el.value,
                v => setEditableValue(el, v),
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
    // Set by the background when this frame was chosen for having a
    // selection; consumed once so a later whole-page run isn't affected.
    const selectionOnly = window.__nekudotSelectionOnly === true;
    delete window.__nekudotSelectionOnly;

    const editable = activeEditable();
    if (editable) {
        setNekudotEditable(editable);
        return;
    }

    const {nodes, range} = scopedTextNodes();
    if (!range) {
        if (selectionOnly) {
            // The selection vanished between the probe and this injection —
            // never silently escalate a selection request to the whole page.
            showToast('Nekudot: the selection was lost — select the text again');
            return;
        }
        if (window === window.top)
            showToast('Nekudot: no selection — adding nikud to the whole page');
        runWholePage();
        return;
    }

    const {pending, segments, alreadyDotted} = collectSegments(nodes, range);
    if (segments.length === 0) {
        showToast(alreadyDotted > 0
            ? 'Nekudot: this text already has nikud'
            : 'Nekudot: no Hebrew text in the selection');
        return;
    }
    requestDiacritics(segments, pending);
}

setNekudot();
