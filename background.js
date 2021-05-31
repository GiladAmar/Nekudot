import * as tf from '@tensorflow/tfjs';

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
    if (c === '\n' || c === '\t') return ' ';
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

function split_to_rows(text, MAXLEN) {
    const space = ALL_TOKENS.indexOf(" ");
    const arr = text.split(" ").map(s => Array.from(s).map(c => ALL_TOKENS.indexOf(c)));
    let line = [];
    const rows = [line];
    for (let i = 0; i < arr.length; i++) {
        if (arr[i].length + line.length + 1 > MAXLEN) {
            while (line.length < MAXLEN)
                line.push(0);
            line = [];
            rows.push(line);
        }
        line.push(...arr[i]);
        line.push(space);
    }
    while (line.length < MAXLEN)
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

function prediction_to_text(input, prediction, undotted_text) {

    function from_categorical(arr) {
        return arr.argMax(-1).reshape([-1]).arraySync().filter((e, i) => input[i] > 0);
    }

    const [niqqud, dagesh, sin] = prediction;
    const len = undotted_text.length;
    const niqqud_result = from_categorical(niqqud);
    const dagesh_result = from_categorical(dagesh);
    const sin_result = from_categorical(sin);

    let output = [];
    for (let i = 0; i < len; i++) {
        const c = undotted_text[i];
        const fresh = {char: c, niqqud: '', dagesh: '', sin: ''};

        if (HEBREW_LETTERS.includes(c)) {
            if (can_niqqud(c))
                fresh.niqqud = niqqud_array[niqqud_result[i]];
            if (can_dagesh(c))
                fresh.dagesh = dagesh_array[dagesh_result[i]];
            if (can_sin(c))
                fresh.sin = sin_array[sin_result[i]];
        }
        output.push(fresh);
    }
    return output;
}

function remove_niqqud(text) {
    return text.replace(/[\u0591-\u05C7]/g, '');
}

function to_text(item) {
    const c = item.char === '\n' ? '\r\n' : item.char;
    return c + (item.dagesh || '') + (item.sin || '') + (item.niqqud || '');
}

async function load_model() {
    const model = await tf.loadLayersModel(chrome.runtime.getURL("model/model.json"));

    model.summary()
    return model
}

const model = load_model()

chrome.action.onClicked.addListener(tab => {
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ['content.js'],
    });
});


chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {

        model.then(function (res) {
            const undotted_text = remove_niqqud(request.text);
            const input = split_to_rows(undotted_text.replace(/./gms, normalize), 90);
            const prediction = res.predict(tf.tensor2d(input), {batchSize: 64});

            let result = prediction_to_text([].concat(...input), prediction, undotted_text);

            result = result.map(to_text).join("")
            sendResponse({processed: result});

        }, function (err) {
            sendResponse({processed: 'error'});
        });
        return true
    }
);

