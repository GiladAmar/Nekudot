// Pure helpers for the content script — kept DOM-free so they can be unit
// tested in Node.

const HEBREW_RE = /[א-ת]/;

function hasHebrew(text) {
    return HEBREW_RE.test(text);
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

export {hasHebrew, segmentRange, nodeSegment};
