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
function decode_chars(undotted_text, nq, dg, sn, offset) {
    let output = '';
    for (let i = 0; i < undotted_text.length; i++) {
        const c = undotted_text[i];
        output += c;
        if (HEBREW_LETTERS.includes(c)) {
            if (can_dagesh(c))
                output += dagesh_array[dg[offset + i]];
            if (can_sin(c))
                output += sin_array[sn[offset + i]];
            if (can_niqqud(c))
                output += niqqud_array[nq[offset + i]];
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
            const heads = model.predict(input, {batchSize: 64});
            // functional API: modular tfjs-core does not register chained tensor ops
            return heads.map(h => tf.argMax(h, -1));
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

    // per-character head classes, aligned to `joined`
    const flat = rows.flat();
    const nq = [], dg = [], sn = [];
    for (let i = 0; i < flat.length; i++) {
        if (flat[i] > 0) {
            nq.push(heads.niqqud[i]);
            dg.push(heads.dagesh[i]);
            sn.push(heads.sin[i]);
        }
    }

    const out = [];
    let offset = 0;
    for (const text of undotted) {
        out.push(decode_chars(text, nq, dg, sn, offset));
        offset += text.length + 1; // +1 for the joining space
    }
    return out;
}

async function diacritize(tf, model, text) {
    return (await diacritize_batch(tf, model, [text]))[0];
}

export {
    MAXLEN, niqqud_array, dagesh_array, sin_array,
    HEBREW_LETTERS, VALID_LETTERS, SPECIAL_TOKENS, ALL_TOKENS,
    normalize, split_to_rows, can_dagesh, can_sin, can_niqqud,
    remove_niqqud, HEBREW_MARKS_RE, diacritize, diacritize_batch,
};
