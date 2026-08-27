// Show exactly what the model sees in one pass: how a paragraph is split
// into the fixed-width rows the network was trained on.
// Usage: node scripts/show_context_windows.mjs
import {normalize, split_to_rows, ALL_TOKENS, MAXLEN} from '../text_encoding.mjs';

const paragraph =
    'שרי הממשלה התכנסו הבוקר לדיון ארוך על תקציב החינוך לשנה הבאה, ובסופו ' +
    'הוחלט להגדיל את ההשקעה בבתי הספר היסודיים ברחבי הארץ. ההורים בירכו על ' +
    'ההחלטה אך ביקשו לוודא שהתקציב אכן יגיע לכיתות עצמן.';

const rows = split_to_rows(paragraph.replace(/./gms, normalize), MAXLEN);
const decode = (row) => row.map(t => ALL_TOKENS[t] || '·').join('');

console.log(`paragraph: ${paragraph.length} characters -> ${rows.length} rows of ${MAXLEN}\n`);
rows.forEach((row, i) => {
    const text = decode(row).replace(/·+$/, '');
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    console.log(`row ${i + 1}: ${words} words, ${text.trim().length} chars`);
    console.log(`  ${text.trim()}`);
});
