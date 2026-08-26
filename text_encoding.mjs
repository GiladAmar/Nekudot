const MAXLEN = 90;

const RAFE = '\u05BF';
const niqqud_array = ['', '', 'ְ', 'ֱ', 'ֲ', 'ֳ', 'ִ', 'ֵ', 'ֶ', 'ַ', 'ָ', 'ֹ', 'ֺ', 'ֻ', 'ּ', 'ַ'];
const dagesh_array = ['', '', 'ּ'];
const sin_array = ['', '', 'ׁ', 'ׂ'];

const HEBREW_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'ך', 'כ', 'ל', 'ם', 'מ', 'ן', 'נ', 'ס', 'ע', 'ף',
    'פ', 'ץ', 'צ', 'ק', 'ר', 'ש', 'ת'];
const VALID_LETTERS = [' ', '!', '"', "'", '(', ')', ',', '-', '.', ':', ';', '?'].concat(HEBREW_LETTERS);
const SPECIAL_TOKENS = ['H', 'O', '5'];
const ALL_TOKENS = [''].concat(SPECIAL_TOKENS).concat(VALID_LETTERS);

function normalize(c) {
    if (c === '\n' || c === '\t' || c === '\r' || c === '\u00A0') return ' ';
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

function remove_niqqud(text) {
    return text.replace(/[\u0591-\u05C7]/g, '');
}

function encode_text(text) {
    const undotted = remove_niqqud(text);
    const rows = split_to_rows(undotted.replace(/./gms, normalize), MAXLEN);
    return {undotted, rows};
}

// Run the model over encoded rows and return per-token argmax classes for
// the three heads as plain typed arrays (length rows.length * MAXLEN each).
function run_model(tf, model, rows) {
    return tf.tidy(() => {
        const input = tf.tensor2d(rows, [rows.length, MAXLEN], 'float32');
        const [niqqud, dagesh, sin] = model.predict(input, {batchSize: 64});
        return {
            niqqud: niqqud.argMax(-1).dataSync(),
            dagesh: dagesh.argMax(-1).dataSync(),
            sin: sin.argMax(-1).dataSync(),
        };
    });
}

// Turn one segment's slice of the model output back into dotted text.
// `flat_input` is the segment's encoded rows flattened; `offset` is where
// those rows start inside the batched head arrays. The characters of the
// input are preserved exactly — only combining marks are inserted — so
// callers may substitute the result for the original text in place.
function decode(flat_input, heads, undotted_text, offset) {
    const niqqud_result = [];
    const dagesh_result = [];
    const sin_result = [];
    for (let i = 0; i < flat_input.length; i++) {
        if (flat_input[i] > 0) {
            niqqud_result.push(heads.niqqud[offset + i]);
            dagesh_result.push(heads.dagesh[offset + i]);
            sin_result.push(heads.sin[offset + i]);
        }
    }

    let output = '';
    for (let i = 0; i < undotted_text.length; i++) {
        const c = undotted_text[i];
        output += c;
        if (HEBREW_LETTERS.includes(c)) {
            if (can_dagesh(c))
                output += dagesh_array[dagesh_result[i]];
            if (can_sin(c))
                output += sin_array[sin_result[i]];
            if (can_niqqud(c))
                output += niqqud_array[niqqud_result[i]];
        }
    }
    return output;
}

// Diacritize several independent text segments with a single model.predict
// call. Returns one dotted string per input segment, in order.
function diacritize_batch(tf, model, texts) {
    const encoded = texts.map(encode_text);
    const allRows = encoded.flatMap(e => e.rows);
    const heads = run_model(tf, model, allRows);

    const out = [];
    let offset = 0;
    for (const e of encoded) {
        const flat = [].concat(...e.rows);
        out.push(decode(flat, heads, e.undotted, offset));
        offset += flat.length;
    }
    return out;
}

function diacritize(tf, model, text) {
    return diacritize_batch(tf, model, [text])[0];
}

export {
    MAXLEN, RAFE, niqqud_array, dagesh_array, sin_array,
    HEBREW_LETTERS, VALID_LETTERS, SPECIAL_TOKENS, ALL_TOKENS,
    normalize, split_to_rows, can_dagesh, can_sin, can_niqqud,
    remove_niqqud, encode_text, diacritize, diacritize_batch,
};
