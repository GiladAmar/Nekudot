// Entry point for whole-page mode: injected into the top frame when no
// frame has a selection — diacritizes all Hebrew text on the page.
import {nodeSegment} from './content_lib.mjs';
import {collectTextNodes, requestDiacritics, showToast} from './content_runtime.mjs';

function setNekudotWholePage() {
    const pending = new Map();
    const segments = [];
    for (const node of collectTextNodes(document.body)) {
        const seg = nodeSegment(node.textContent, false, false, 0, 0);
        if (!seg) continue;
        const id = segments.length;
        pending.set(id, {node, prefix: seg.prefix, suffix: seg.suffix});
        segments.push({id, text: seg.middle});
    }
    if (segments.length === 0) {
        showToast('לא נמצא טקסט בעברית בדף');
        return;
    }
    requestDiacritics(segments, pending);
}

setNekudotWholePage();
