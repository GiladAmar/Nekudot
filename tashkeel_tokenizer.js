/**
 * TashkeelTokenizer - JavaScript port of CATT tokenizer
 * Handles tokenization and detokenization of Arabic text with diacritics
 */

// Import Buckwalter transliteration
const { transliterateText } = require('./buckwalter.js');

// Unicode diacritics constants
const FATHATAN = '\u064b';
const DAMMATAN = '\u064c';
const KASRATAN = '\u064d';
const FATHA = '\u064e';
const DAMMA = '\u064f';
const KASRA = '\u0650';
const SHADDA = '\u0651';
const SUKUN = '\u0652';
const TATWEEL = '\u0640';

// Harakat pattern for removal
const HARAKAT_PATTERN = new RegExp(`[${FATHATAN}${DAMMATAN}${KASRATAN}${FATHA}${DAMMA}${KASRA}${SUKUN}${SHADDA}]`, 'g');

class TashkeelTokenizer {
    constructor() {
        // Buckwalter letters vocabulary
        this.letters = [' ', '$', '&', "'", '*', '<', '>', 'A', 'D', 'E', 'H', 'S', 'T', 'Y', 'Z',
                       'b', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't',
                       'v', 'w', 'x', 'y', 'z', '|', '}'];
        this.letters = ['<PAD>', '<BOS>', '<EOS>', ...this.letters, '<MASK>'];

        // Tashkeel vocabulary
        this.noTashkeelTag = '<NT>';
        this.tashkeelList = ['<NT>', '<SD>', '<SDD>', '<SF>', '<SFF>', '<SK>',
                            '<SKK>', 'F', 'K', 'N', 'a', 'i', 'o', 'u', '~'];
        this.tashkeelList = ['<PAD>', '<BOS>', '<EOS>', ...this.tashkeelList];

        // Create mappings
        this.tashkeelMap = {};
        this.tashkeelList.forEach((c, i) => this.tashkeelMap[c] = i);

        this.lettersMap = {};
        this.letters.forEach((c, i) => this.lettersMap[c] = i);

        // Inverse tags for compound diacritics
        this.inverseTags = {
            '~a': '<SF>',  // shaddah + fatHa
            '~u': '<SD>',  // shaddah + Damma
            '~i': '<SK>',  // shaddah + kasra
            '~F': '<SFF>', // shaddah + fatHatayn
            '~N': '<SDD>', // shaddah + Dammatayn
            '~K': '<SKK>'  // shaddah + kasratayn
        };

        this.tags = {};
        for (const [k, v] of Object.entries(this.inverseTags)) {
            this.tags[v] = k;
        }

        this.shaddahLast = ['a~', 'u~', 'i~', 'F~', 'N~', 'K~'];
        this.shaddahFirst = ['~a', '~u', '~i', '~F', '~N', '~K~'];
        this.tahkeelChars = ['F', 'N', 'K', 'a', 'u', 'i', '~', 'o'];
    }

    /**
     * Clean Arabic text
     */
    cleanText(text) {
        // Remove tatweel
        text = text.replace(new RegExp(TATWEEL, 'g'), '');
        // Normalize alif
        text = text.replace(/ٱ/g, 'ا');
        // Keep only Arabic characters and spaces
        text = text.replace(/[^\u0621-\u063A\u0640-\u0652\u0670\u0671\ufefb\ufef7\ufef5\ufef9 ]/g, ' ');
        // Normalize whitespace
        return text.split(/\s+/).filter(s => s).join(' ');
    }

    /**
     * Unify shaddah position (shaddah always first)
     */
    unifyShaddahPosition(textWithTashkeel) {
        for (let i = 0; i < this.shaddahFirst.length; i++) {
            textWithTashkeel = textWithTashkeel.replace(
                new RegExp(this.shaddahLast[i], 'g'),
                this.shaddahFirst[i]
            );
        }
        return textWithTashkeel;
    }

    /**
     * Split tashkeel from text
     */
    splitTashkeelFromText(textWithTashkeel) {
        textWithTashkeel = this.cleanText(textWithTashkeel);
        textWithTashkeel = transliterateText(textWithTashkeel, 'ar2bw');
        textWithTashkeel = textWithTashkeel.replace(/`/g, ''); // remove dagger alif

        // Unify shaddah position
        textWithTashkeel = this.unifyShaddahPosition(textWithTashkeel);

        // Remove duplicated harakat
        for (const char of this.tahkeelChars) {
            const regex = new RegExp(char + '{2,}', 'g');
            textWithTashkeel = textWithTashkeel.replace(regex, char);
        }

        const letterNTashkeelPairs = [];
        for (let i = 0; i < textWithTashkeel.length; i++) {
            const char = textWithTashkeel[i];

            // Check if current char is letter and next is tashkeel
            if (i < textWithTashkeel.length - 1 &&
                !this.tashkeelList.includes(char) &&
                this.tashkeelList.includes(textWithTashkeel[i + 1])) {

                // Handle shaddah combinations
                if (textWithTashkeel[i + 1] === '~') {
                    if (i + 2 < textWithTashkeel.length) {
                        const combo = '~' + textWithTashkeel[i + 2];
                        if (combo in this.inverseTags) {
                            letterNTashkeelPairs.push([char, this.inverseTags[combo]]);
                            continue;
                        }
                    }
                    letterNTashkeelPairs.push([char, '~']);
                } else {
                    letterNTashkeelPairs.push([char, textWithTashkeel[i + 1]]);
                }
            }
            // Letter without tashkeel
            else if (!this.tashkeelList.includes(char)) {
                letterNTashkeelPairs.push([char, this.noTashkeelTag]);
            }
        }

        return [['<BOS>', '<BOS>'], ...letterNTashkeelPairs, ['<EOS>', '<EOS>']];
    }

    /**
     * Combine tashkeel with text
     */
    combineTashkeelWithText(letterNTashkeelPairs) {
        const combined = [];
        for (const [letter, tashkeel] of letterNTashkeelPairs) {
            combined.push(letter);
            if (tashkeel in this.tags) {
                combined.push(this.tags[tashkeel]);
            } else if (tashkeel !== this.noTashkeelTag) {
                combined.push(tashkeel);
            }
        }
        return combined.join('');
    }

    /**
     * Encode text to token IDs
     */
    encode(textWithTashkeel) {
        const letterNTashkeelPairs = this.splitTashkeelFromText(textWithTashkeel);
        const text = letterNTashkeelPairs.map(pair => pair[0]);
        const tashkeel = letterNTashkeelPairs.map(pair => pair[1]);

        const inputIds = text.map(c => this.lettersMap[c] || 0);
        const targetIds = tashkeel.map(c => this.tashkeelMap[c] || 0);

        return [inputIds, targetIds];
    }

    /**
     * Filter tashkeel tags
     */
    filterTashkeel(tashkeel) {
        return tashkeel.map((t, i) => {
            if (i !== 0 && t === '<BOS>') return this.noTashkeelTag;
            if (i !== tashkeel.length - 1 && t === '<EOS>') return this.noTashkeelTag;
            return t;
        });
    }

    /**
     * Decode token IDs to text
     */
    decode(inputIdsBatch, targetIdsBatch) {
        const arTexts = [];

        for (let j = 0; j < inputIdsBatch.length; j++) {
            const inputIds = inputIdsBatch[j];
            const targetIds = targetIdsBatch[j];

            let letters = inputIds.map(i => this.letters[i] || '');
            let tashkeel = targetIds.map(i => this.tashkeelList[i] || '');

            // Filter special tokens
            letters = letters.filter(x => x !== '<BOS>' && x !== '<EOS>' && x !== '<PAD>');
            tashkeel = this.filterTashkeel(tashkeel);
            tashkeel = tashkeel.filter(x => x !== '<BOS>' && x !== '<EOS>' && x !== '<PAD>');

            // Zip letters and tashkeel
            const minLen = Math.min(letters.length, tashkeel.length);
            const letterNTashkeelPairs = [];
            for (let i = 0; i < minLen; i++) {
                letterNTashkeelPairs.push([letters[i], tashkeel[i]]);
            }

            const bwText = this.combineTashkeelWithText(letterNTashkeelPairs);
            const arText = transliterateText(bwText, 'bw2ar');
            arTexts.push(arText);
        }

        return arTexts;
    }

    /**
     * Remove tashkeel from text
     */
    removeTashkeel(text) {
        text = text.replace(HARAKAT_PATTERN, '');
        text = text.replace(/[\u064E]/g, ''); // fattha
        text = text.replace(/[\u0671]/g, ''); // waSla
        return text;
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TashkeelTokenizer;
}
