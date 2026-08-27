// Pure helpers for the content script — kept DOM-free so they can be unit
// tested in Node.

const HEBREW_RE = /[א-ת]/;

function hasHebrew(text) {
    return HEBREW_RE.test(text);
}

// Text that is already dotted needs no work — this extension dotted it on
// a previous run, or the content came dotted. Judged per word (a Hebrew
// word counts as dotted when it carries at least one mark) so that a
// per-letter ratio can't misfire on short words or dagesh-dense spans:
// learning texts where most words are bare are still processed. Lets a
// re-run on an infinite-scroll page process only the newly loaded content.
// (To force re-dotting, use Remove nikud first.)
function isMostlyDotted(text) {
    const words = (text.match(/[\u05D0-\u05EA\u05B0-\u05C2]+/g) || [])
        .filter(w => (w.match(/[\u05D0-\u05EA]/g) || []).length >= 2);
    if (words.length === 0) return false;
    const dotted = words.filter(w => /[\u05B0-\u05BC\u05C1\u05C2]/.test(w)).length;
    return dotted / words.length >= 0.75;
}

// The part of one text node covered by a Range. Ranges are always ordered
// (unlike Selection anchor/extent), so no direction handling is needed.
// Offsets are clamped: when the range's start/end container is not a text
// node (e.g. Ctrl+A selects from an element), the node is fully covered.
function segmentRange(textLength, isStartContainer, isEndContainer, rangeStartOffset, rangeEndOffset) {
    const start = isStartContainer ? Math.min(rangeStartOffset, textLength) : 0;
    const end = isEndContainer ? Math.min(rangeEndOffset, textLength) : textLength;
    return {start, end: Math.max(start, end)};
}

// Split one node's text into the untouched prefix/suffix and the selected
// middle that should be diacritized. Returns null when the selected part
// contains no Hebrew (nothing to do for this node).
function nodeSegment(text, isStartContainer, isEndContainer, rangeStartOffset, rangeEndOffset) {
    const {start, end} = segmentRange(text.length, isStartContainer, isEndContainer, rangeStartOffset, rangeEndOffset);
    const middle = text.slice(start, end);
    if (!hasHebrew(middle))
        return null;
    return {prefix: text.slice(0, start), middle, suffix: text.slice(end)};
}

// Build the segment list for a set of text nodes (the selection's nodes, or
// every node in whole-page mode). The already-dotted skip is judged on each
// node's SELECTED text (seg.middle), never on node identity or full text:
// a partially-dotted node can still have its other sentences dotted, and a
// node whose text the page swapped after we dotted it (SPA re-render) is
// re-processed because its new text carries no marks.
function collectSegments(nodes, range) {
    const pending = new Map();
    const segments = [];
    let alreadyDotted = 0;
    for (const node of nodes) {
        const seg = range
            ? nodeSegment(node.textContent, node === range.startContainer,
                node === range.endContainer, range.startOffset, range.endOffset)
            : nodeSegment(node.textContent, false, false, 0, 0);
        if (!seg) continue;
        if (isMostlyDotted(seg.middle)) {
            alreadyDotted++;
            continue;
        }
        const id = segments.length;
        // `whole` snapshots the node's text at collection time so a result
        // is never applied over text the page changed while the model ran
        pending.set(id, {node, prefix: seg.prefix, suffix: seg.suffix, whole: node.textContent});
        segments.push({id, text: seg.middle});
    }
    return {pending, segments, alreadyDotted};
}

export {hasHebrew, isMostlyDotted, segmentRange, nodeSegment, collectSegments};
