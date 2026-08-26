import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {hasHebrew, isMostlyDotted, segmentRange, nodeSegment, collectSegments} from '../content_lib.mjs';

describe('hasHebrew', () => {
    test('detects Hebrew letters', () => {
        assert.ok(hasHebrew('שלום'));
        assert.ok(hasHebrew('abc שלום xyz'));
    });
    test('rejects Latin, digits, and niqqud-only text', () => {
        assert.ok(!hasHebrew('hello 123'));
        assert.ok(!hasHebrew('ְָֹ'));
        assert.ok(!hasHebrew(''));
    });
});

describe('isMostlyDotted', () => {
    test('undotted Hebrew is not skipped', () => {
        assert.equal(isMostlyDotted('שלום עולם, זהו טקסט רגיל'), false);
    });
    test('fully dotted Hebrew is skipped', () => {
        assert.equal(isMostlyDotted('שָׁלוֹם עוֹלָם'), true);
    });
    test('lightly dotted learning text is still processed', () => {
        // one dotted word inside a long undotted sentence
        assert.equal(isMostlyDotted('שָׁלוֹם is one word inside טקסט ארוך בלי ניקוד בכלל כאן'), false);
    });
    test('judged per word: a dotted short word next to bare words is processed', () => {
        // per-letter ratios misfire here (1 mark / 4 letters); per-word is 1/2
        assert.equal(isMostlyDotted('עַל זה'), false);
        assert.equal(isMostlyDotted('בְּסֵדֶר גמור לגמרי בלי כלום'), false);
    });
    test('no Hebrew means nothing to skip', () => {
        assert.equal(isMostlyDotted('hello world 123'), false);
        assert.equal(isMostlyDotted(''), false);
    });
});

describe('collectSegments already-dotted skip', () => {
    const node = (text) => ({textContent: text});

    test('fully dotted nodes are skipped and counted', () => {
        const nodes = [node('שָׁלוֹם עוֹלָם'), node('טקסט חדש בלי ניקוד')];
        const {segments, alreadyDotted} = collectSegments(nodes, null);
        assert.equal(alreadyDotted, 1);
        assert.deepEqual(segments.map(s => s.text), ['טקסט חדש בלי ניקוד']);
    });

    test('the skip is judged on the selected part, not the whole node', () => {
        // A node whose first half was dotted earlier: selecting the still
        // undotted second half must be processed (regression: node-identity
        // and whole-text skips blocked this forever).
        const text = 'מִשְׁפָּט רִאשׁוֹן מְנֻקָּד. משפט שני רגיל.';
        const secondStart = text.indexOf('משפט שני');
        const n = node(text);
        const range = {startContainer: n, endContainer: n,
            startOffset: secondStart, endOffset: text.length};
        const {segments, alreadyDotted} = collectSegments([n], range);
        assert.equal(alreadyDotted, 0);
        assert.deepEqual(segments.map(s => s.text), ['משפט שני רגיל.']);
    });

    test('selecting the already-dotted part of a node is skipped', () => {
        const text = 'מִשְׁפָּט רִאשׁוֹן מְנֻקָּד. משפט שני רגיל.';
        const dottedEnd = text.indexOf('.') + 1;
        const n = node(text);
        const range = {startContainer: n, endContainer: n,
            startOffset: 0, endOffset: dottedEnd};
        const {segments, alreadyDotted} = collectSegments([n], range);
        assert.equal(alreadyDotted, 1);
        assert.equal(segments.length, 0);
    });
});

describe('segmentRange', () => {
    test('middle node is fully covered', () => {
        assert.deepEqual(segmentRange(10, false, false, 3, 7), {start: 0, end: 10});
    });
    test('start container starts at the range offset', () => {
        assert.deepEqual(segmentRange(10, true, false, 3, 7), {start: 3, end: 10});
    });
    test('end container ends at the range offset', () => {
        assert.deepEqual(segmentRange(10, false, true, 3, 7), {start: 0, end: 7});
    });
    test('single node covered by both ends', () => {
        assert.deepEqual(segmentRange(10, true, true, 3, 7), {start: 3, end: 7});
    });
    test('element-container offsets (Ctrl+A) are clamped to the text length', () => {
        // With select-all the range containers are elements and offsets are
        // child indices, which can exceed a short text node's length.
        assert.deepEqual(segmentRange(4, true, true, 0, 57), {start: 0, end: 4});
    });
    test('end never precedes start', () => {
        assert.deepEqual(segmentRange(10, true, true, 8, 2), {start: 8, end: 8});
    });
});

describe('nodeSegment', () => {
    test('splits prefix / middle / suffix', () => {
        const seg = nodeSegment('אבג שלום דהו', true, true, 4, 8);
        assert.deepEqual(seg, {prefix: 'אבג ', middle: 'שלום', suffix: ' דהו'});
    });
    test('returns null when the selected part has no Hebrew', () => {
        assert.equal(nodeSegment('שלום hello', true, true, 5, 10), null);
        assert.equal(nodeSegment('plain latin text', false, false, 0, 0), null);
    });
    test('whole node when it is not a boundary container', () => {
        const seg = nodeSegment('שלום', false, false, 99, 99);
        assert.deepEqual(seg, {prefix: '', middle: 'שלום', suffix: ''});
    });
    test('reassembly is lossless', () => {
        const text = 'לפני שלום אחרי';
        const seg = nodeSegment(text, true, true, 5, 9);
        assert.equal(seg.prefix + seg.middle + seg.suffix, text);
    });
});
