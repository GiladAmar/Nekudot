// Explicit whole-page entry: injected by the "Add nikud to the whole page"
// menu item. Deliberately ignores any selection — the user asked for the
// whole page, and a stray surviving selection must not narrow the scope.
import {collectSegments} from './content_lib.mjs';
import {collectTextNodes, requestDiacritics, showToast} from './content_runtime.mjs';

function setNekudotWholePage() {
    const nodes = collectTextNodes(document.body);
    const {pending, segments, alreadyDotted} = collectSegments(nodes, null);
    if (segments.length === 0) {
        showToast(alreadyDotted > 0
            ? 'Nekudot: this page already has nikud'
            : 'Nekudot: no Hebrew text found on this page');
        return;
    }
    requestDiacritics(segments, pending);
}

setNekudotWholePage();
