import * as tf from '@tensorflow/tfjs';

// Arabic diacritical marks (harakat)
const FATHA = '\u064E';      // َ
const DAMMA = '\u064F';      // ُ
const KASRA = '\u0650';      // ِ
const SUKUN = '\u0652';      // ْ
const SHADDA = '\u0651';     // ّ
const TANWEEN_FATH = '\u064B'; // ً
const TANWEEN_DAMM = '\u064C'; // ٌ
const TANWEEN_KASR = '\u064D'; // ٍ

// Diacritics arrays for model predictions
const harakat_array = ['', '', FATHA, DAMMA, KASRA, SUKUN, TANWEEN_FATH, TANWEEN_DAMM, TANWEEN_KASR];
const shadda_array = ['', '', SHADDA];

// Arabic letters (including all forms and variations)
const ARABIC_LETTERS = ['ا', 'أ', 'إ', 'آ', 'ء', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ؤ', 'ي', 'ئ', 'ى', 'ة'];
const VALID_LETTERS = [' ', '!', '"', "'", '(', ')', ',', '-', '.', ':', ';', '?', '،', '؛', '؟'].concat(ARABIC_LETTERS);
const SPECIAL_TOKENS = ['A', 'O', '5'];  // A=Arabic special, O=Other, 5=Digits
const ALL_TOKENS = [''].concat(SPECIAL_TOKENS).concat(VALID_LETTERS);

function normalize(c) {
    if (c === '\n' || c === '\t') return ' ';
    if (VALID_LETTERS.includes(c)) return c;
    if (['־', '‒', '–', '—', '―', '−'].includes(c)) return '-';
    if (c === '[') return '(';
    if (c === ']') return ')';
    if (['\u00B4', '\u2018', '\u2019'].includes(c)) return "'";
    if (['\u201C', '\u201D'].includes(c)) return '"';
    if ('0123456789'.includes(c)) return '5';
    if (['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'].includes(c)) return '5'; // Arabic-Indic digits
    if (c === '…') return ',';
    // Normalize Arabic letter variations
    if (['أ', 'إ', 'آ'].includes(c)) return 'ا';
    if (c === 'ة') return 'ه';
    if (c === 'ى') return 'ي';
    if (c === 'ؤ') return 'و';
    if (c === 'ئ') return 'ي';
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

function can_shadda(letter) {
    // Most Arabic letters can receive shadda (doubling mark)
    return ARABIC_LETTERS.includes(letter) && letter !== 'ا' && letter !== 'أ' && letter !== 'إ' && letter !== 'آ' && letter !== 'ء';
}

function can_harakat(letter) {
    // All Arabic letters can receive harakat (short vowels)
    return ARABIC_LETTERS.includes(letter);
}

function prediction_to_text(input, prediction, undotted_text) {

    function from_categorical(arr) {
        return arr.argMax(-1).reshape([-1]).arraySync().filter((e, i) => input[i] > 0);
    }

    const [harakat, shadda] = prediction;
    const len = undotted_text.length;
    const harakat_result = from_categorical(harakat);
    const shadda_result = from_categorical(shadda);

    let output = [];
    for (let i = 0; i < len; i++) {
        const c = undotted_text[i];
        const fresh = {char: c, harakat: '', shadda: ''};

        if (ARABIC_LETTERS.includes(c)) {
            if (can_harakat(c))
                fresh.harakat = harakat_array[harakat_result[i]];
            if (can_shadda(c))
                fresh.shadda = shadda_array[shadda_result[i]];
        }
        output.push(fresh);
    }
    return output;
}

function remove_tashkeel(text) {
    // Remove Arabic diacritical marks (tashkeel) - Unicode range U+064B to U+0652
    return text.replace(/[\u064B-\u0652]/g, '');
}

function to_text(item) {
    const c = item.char === '\n' ? '\r\n' : item.char;
    // In Arabic, shadda comes before harakat
    return c + (item.shadda || '') + (item.harakat || '');
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
            const undotted_text = remove_tashkeel(request.text);
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

