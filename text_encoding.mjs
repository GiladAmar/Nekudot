const MAXLEN = 90;

const niqqud_array = ['', '', 'ְ', 'ֱ', 'ֲ', 'ֳ', 'ִ', 'ֵ', 'ֶ', 'ַ', 'ָ', 'ֹ', 'ֺ', 'ֻ', 'ּ', 'ַ'];
const dagesh_array = ['', '', 'ּ'];
const sin_array = ['', '', 'ׁ', 'ׂ'];

const HEBREW_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'ך', 'כ', 'ל', 'ם', 'מ', 'ן', 'נ', 'ס', 'ע', 'ף',
    'פ', 'ץ', 'צ', 'ק', 'ר', 'ש', 'ת'];
const VALID_LETTERS = [' ', '!', '"', "'", '(', ')', ',', '-', '.', ':', ';', '?'].concat(HEBREW_LETTERS);
const SPECIAL_TOKENS = ['H', 'O', '5'];
const ALL_TOKENS = [''].concat(SPECIAL_TOKENS).concat(VALID_LETTERS);

function normalize(c) {
    // Any Unicode whitespace separates words; mapping only a hardcoded few
    // left thin/en/em spaces etc. gluing words into giant tokens.
    if (/\s/.test(c)) return ' ';
    if (VALID_LETTERS.includes(c)) return c;
    if (['־', '‒', '–', '—', '―', '−'].includes(c)) return '-';
    if (c === '[') return '(';
    if (c === ']') return ')';
    if (['´', '‘', '’'].includes(c)) return "'";
    if (['“', '”', '״'].includes(c)) return '"';
    if ('0123456789'.includes(c)) return '5';
    if (c === '…') return ',';
    if (['ײ', 'װ', 'ױ'].includes(c)) return 'H';
    return 'O';
}

function split_to_rows(text, maxlen) {
    const space = ALL_TOKENS.indexOf(" ");
    const words = text.split(" ").map(s => Array.from(s).map(c => ALL_TOKENS.indexOf(c)));
    let line = [];
    const rows = [line];

    function next_row() {
        while (line.length < maxlen)
            line.push(0);
        line = [];
        rows.push(line);
    }

    for (const word of words) {
        if (word.length + line.length + 1 > maxlen && line.length > 0)
            next_row();
        // A single word longer than a row must be split across rows,
        // otherwise rows come out ragged and the input tensor is corrupt.
        let offset = 0;
        while (word.length - offset > maxlen - line.length) {
            const take = maxlen - line.length;
            line.push(...word.slice(offset, offset + take));
            offset += take;
            next_row();
        }
        line.push(...word.slice(offset));
        if (line.length === maxlen)
            next_row();
        line.push(space);
    }
    while (line.length < maxlen)
        line.push(0);
    return rows;
}

function can_dagesh(letter) {
    return ('בגדהוזטיכלמנספצקשת' + 'ךף').includes(letter);
}

function can_sin(letter) {
    return letter === 'ש';
}

function can_niqqud(letter) {
    return ('אבגדהוזחטיכלמנסעפצקרשת' + 'ךן').includes(letter);
}

// Strip only MARKS (niqqud, dagesh, shin/sin dots, rafe, meteg,
// cantillation) — NOT the punctuation code points that share the block:
// maqaf \u05BE, paseq \u05C0, sof pasuq \u05C3, nun hafukha \u05C6.
// A wider range silently deleted maqaf from every dotted text
// (\u05D1\u05D9\u05EA\u05BE\u05E1\u05E4\u05E8 became one glued word).
const HEBREW_MARKS_RE = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/;

function remove_niqqud(text) {
    return text.replace(new RegExp(HEBREW_MARKS_RE.source, 'g'), '');
}

// Insert predicted marks into undotted text. The per-character head classes
// (nq/dg/sn) are aligned to a stream of which this text occupies
// [offset, offset + length). Characters are preserved exactly — only
// combining marks are inserted — so callers may substitute the result for
// the original text in place.
function decode_chars(undotted_text, heads, charToToken, offset) {
    let output = '';
    for (let i = 0; i < undotted_text.length; i++) {
        const c = undotted_text[i];
        output += c;
        if (HEBREW_LETTERS.includes(c)) {
            const t = charToToken[offset + i];
            if (can_dagesh(c))
                output += dagesh_array[heads.dagesh[t]];
            if (can_sin(c))
                output += sin_array[heads.sin[t]];
            if (can_niqqud(c))
                output += niqqud_array[heads.niqqud[t]];
        }
    }
    return output;
}

// Only rows containing a Hebrew letter can receive marks; the rest of a
// select-all-sized input (nav chrome, URLs, Latin text) is skipped entirely.
const HEBREW_TOKEN_MIN = ALL_TOKENS.indexOf(HEBREW_LETTERS[0]);

// Upper bound on rows per predict call, so one giant segment doesn't hold
// the whole intermediate activation set alive at once.
const ROWS_PER_PREDICT = 512;

// Run the model over encoded rows and return per-token argmax classes for
// the three heads as plain typed arrays (length rows.length * MAXLEN each).
// Rows without Hebrew keep class 0 (no marks) and are never predicted.
async function run_model(tf, model, rows) {
    const heads = {
        niqqud: new Int32Array(rows.length * MAXLEN),
        dagesh: new Int32Array(rows.length * MAXLEN),
        sin: new Int32Array(rows.length * MAXLEN),
    };

    const kept = [];
    for (let i = 0; i < rows.length; i++)
        if (rows[i].some(t => t >= HEBREW_TOKEN_MIN))
            kept.push(i);

    for (let start = 0; start < kept.length; start += ROWS_PER_PREDICT) {
        const indices = kept.slice(start, start + ROWS_PER_PREDICT);
        const argmaxes = tf.tidy(() => {
            const input = tf.tensor2d(indices.map(i => rows[i]), [indices.length, MAXLEN], 'float32');
            const outputs = model.predict(input, {batchSize: 64}); // [niqqud, dagesh, sin]
            // functional API: modular tfjs-core does not register chained tensor ops
            return outputs.map(h => tf.argMax(h, -1));
        });
        // async readback: no dataSync() stall on the GPU pipeline
        const [niqqud, dagesh, sin] = await Promise.all(argmaxes.map(t => t.data()));
        argmaxes.forEach(t => t.dispose());
        for (let j = 0; j < indices.length; j++) {
            const dst = indices[j] * MAXLEN;
            const src = j * MAXLEN;
            heads.niqqud.set(niqqud.subarray(src, src + MAXLEN), dst);
            heads.dagesh.set(dagesh.subarray(src, src + MAXLEN), dst);
            heads.sin.set(sin.subarray(src, src + MAXLEN), dst);
        }
    }
    return heads;
}

// Diacritize several text segments with one shared row stream. Segments are
// joined with single spaces before row-splitting, so many short segments
// (one per DOM text node on a news page) share rows instead of each padding
// its own — on a real homepage this cuts predicted rows roughly 3x.
// The non-padding tokens of the joined stream are exactly `joined + ' '`
// (split_to_rows re-emits every consumed delimiter), so segment i's
// characters live at [sum(len_j + 1 for j < i), ... + len_i) of the
// filtered stream. Returns one dotted string per input segment, in order.
async function diacritize_batch(tf, model, texts) {
    const undotted = texts.map(remove_niqqud);
    const joined = undotted.map(t => t.replace(/./gms, normalize)).join(' ');
    const rows = split_to_rows(joined, MAXLEN);
    const heads = await run_model(tf, model, rows);

    // Map each character of `joined` to its slot in the padded row stream.
    // One Int32Array rather than flattening the rows into a JS array and
    // building three more: the accumulators here scale with the whole
    // request, so they are the memory that matters on a huge paste.
    const charToToken = new Int32Array(joined.length + 1); // +1 trailing space
    let c = 0;
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const base = r * MAXLEN;
        for (let i = 0; i < MAXLEN; i++)
            if (row[i] > 0) charToToken[c++] = base + i;
    }
    if (c !== charToToken.length)
        throw new Error(`token/character misalignment: ${c} tokens for ${charToToken.length} characters`);

    const out = [];
    let offset = 0;
    for (const text of undotted) {
        out.push(decode_chars(text, heads, charToToken, offset));
        offset += text.length + 1; // +1 for the joining space
    }
    return out;
}

async function diacritize(tf, model, text) {
    return (await diacritize_batch(tf, model, [text]))[0];
}

// Group segments into per-predict batches by CHARACTER count, not segment
// count: a single huge segment (the paste page sends a whole textarea as
// one) would otherwise slip past a per-segment cap and rebuild the memory
// blowup this all exists to fix. A chunk always holds at least one segment,
// so an oversized segment still goes through alone rather than being lost.
const CHARS_PER_CHUNK = 4000;

function chunkSegments(segments, charsPerChunk = CHARS_PER_CHUNK) {
    const chunks = [];
    let chunk = [], chars = 0;
    for (const segment of segments) {
        if (chunk.length > 0 && chars + segment.text.length > charsPerChunk) {
            chunks.push(chunk);
            chunk = [];
            chars = 0;
        }
        chunk.push(segment);
        chars += segment.text.length;
    }
    if (chunk.length > 0) chunks.push(chunk);
    return chunks;
}

export {
    MAXLEN, niqqud_array, dagesh_array, sin_array,
    HEBREW_LETTERS, VALID_LETTERS, SPECIAL_TOKENS, ALL_TOKENS,
    normalize, split_to_rows, can_dagesh, can_sin, can_niqqud,
    remove_niqqud, HEBREW_MARKS_RE, diacritize, diacritize_batch,
    chunkSegments, CHARS_PER_CHUNK,
};
