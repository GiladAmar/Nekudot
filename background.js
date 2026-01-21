/**
 * Arabic Tashkeel Extension - Background Script
 * Uses ONNX.js to run CATT model inference in the browser
 */

import * as ort from 'onnxruntime-web';
import TashkeelTokenizer from './tashkeel_tokenizer.js';

// Initialize tokenizer
const tokenizer = new TashkeelTokenizer();

// Model sessions (will be loaded asynchronously)
let encoderSession = null;
let decoderSession = null;
let modelLoaded = false;

/**
 * Load ONNX models
 */
async function loadModels() {
    try {
        console.log('🔄 Loading CATT ONNX models...');

        const encoderPath = chrome.runtime.getURL('model/encoder.onnx');
        const decoderPath = chrome.runtime.getURL('model/decoder.onnx');

        // Load encoder
        encoderSession = await ort.InferenceSession.create(encoderPath, {
            executionProviders: ['wasm']
        });

        // Load decoder
        decoderSession = await ort.InferenceSession.create(decoderPath, {
            executionProviders: ['wasm']
        });

        modelLoaded = true;
        console.log('✅ CATT models loaded successfully!');
        return true;
    } catch (error) {
        console.error('❌ Error loading models:', error);
        modelLoaded = false;
        return false;
    }
}

/**
 * Create padding mask for attention
 */
function makePadMask(q, k, qPadIdx, kPadIdx) {
    const lenQ = q.length;
    const lenK = k.length;

    // Create k_mask
    const kMask = new Array(lenK).fill(0).map((_, i) => k[i] !== kPadIdx ? 1 : 0);
    // Repeat for lenQ times
    const kMaskExpanded = new Array(lenQ).fill(null).map(() => kMask.slice());

    // Create q_mask
    const qMask = new Array(lenQ).fill(0).map((_, i) => q[i] !== qPadIdx ? 1 : 0);
    // Repeat for lenK times in each row
    const qMaskExpanded = qMask.map(val => new Array(lenK).fill(val));

    // Combine masks with AND operation
    const combined = new Array(lenQ);
    for (let i = 0; i < lenQ; i++) {
        combined[i] = new Array(lenK);
        for (let j = 0; j < lenK; j++) {
            combined[i][j] = kMaskExpanded[i][j] && qMaskExpanded[i][j];
        }
    }

    return combined;
}

/**
 * Run encoder on input
 */
async function runEncoder(srcArray) {
    const batchSize = 1;
    const seqLen = srcArray.length;
    const srcPadIdx = tokenizer.lettersMap['<PAD>'];

    // Create src tensor [batch_size, seq_len]
    const srcTensor = new ort.Tensor('int64', BigInt64Array.from(srcArray.map(x => BigInt(x))), [batchSize, seqLen]);

    // Create mask [batch_size, 1, seq_len, seq_len]
    const maskData = makePadMask(srcArray, srcArray, srcPadIdx, srcPadIdx);
    const maskFlat = [];
    for (let i = 0; i < seqLen; i++) {
        for (let j = 0; j < seqLen; j++) {
            maskFlat.push(maskData[i][j]);
        }
    }
    const maskTensor = new ort.Tensor('bool', new Uint8Array(maskFlat), [batchSize, 1, seqLen, seqLen]);

    // Run encoder
    const feeds = { src: srcTensor, src_mask: maskTensor };
    const results = await encoderSession.run(feeds);

    return results.encoder_output;
}

/**
 * Run decoder on encoder output
 */
async function runDecoder(encSrc) {
    // For encoder-only model, decoder is just a linear layer
    const feeds = { enc_src: encSrc };
    const results = await decoderSession.run(feeds);
    return results.decoder_output;
}

/**
 * Apply argmax to get predictions
 */
function argmax(tensor) {
    const data = tensor.data;
    const shape = tensor.dims;
    const batchSize = shape[0];
    const seqLen = shape[1];
    const numClasses = shape[2];

    const predictions = [];
    for (let b = 0; b < batchSize; b++) {
        const batchPreds = [];
        for (let s = 0; s < seqLen; s++) {
            let maxIdx = 0;
            let maxVal = -Infinity;

            for (let c = 0; c < numClasses; c++) {
                const idx = b * seqLen * numClasses + s * numClasses + c;
                if (data[idx] > maxVal) {
                    maxVal = data[idx];
                    maxIdx = c;
                }
            }
            batchPreds.push(maxIdx);
        }
        predictions.push(batchPreds);
    }

    return predictions;
}

/**
 * Apply space mask to predictions
 */
function applySpaceMask(predictions, inputIds) {
    const spaceIdx = tokenizer.lettersMap[' '];
    const noTashkeelIdx = tokenizer.tashkeelMap[tokenizer.noTashkeelTag];

    for (let i = 0; i < inputIds.length; i++) {
        if (inputIds[i] === spaceIdx) {
            predictions[i] = noTashkeelIdx;
        }
    }

    return predictions;
}

/**
 * Pad sequence to max length
 */
function padSequence(sequence, maxLen, padValue = 0) {
    const padded = new Array(maxLen).fill(padValue);
    for (let i = 0; i < Math.min(sequence.length, maxLen); i++) {
        padded[i] = sequence[i];
    }
    return padded;
}

/**
 * Diacritize Arabic text using CATT model
 */
async function diacritizeText(text) {
    if (!modelLoaded) {
        throw new Error('Models not loaded');
    }

    try {
        // Preprocess: remove existing diacritics
        const cleanedText = tokenizer.removeTashkeel(text);

        // Tokenize
        const [inputIds, _] = tokenizer.encode(cleanedText);

        // Remove BOS and EOS for encoder-only model
        const inputIdsNoSpecial = inputIds.slice(1, -1);

        // Run encoder
        const encOutput = await runEncoder(inputIdsNoSpecial);

        // Run decoder
        const decOutput = await runDecoder(encOutput);

        // Get predictions via argmax
        const predictions = argmax(decOutput);

        // Apply space mask
        const finalPreds = applySpaceMask(predictions[0], inputIdsNoSpecial);

        // Decode back to text
        const diacritized = tokenizer.decode([inputIdsNoSpecial], [finalPreds]);

        return diacritized[0];
    } catch (error) {
        console.error('Error during diacritization:', error);
        throw error;
    }
}

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener(async (tab) => {
    if (!modelLoaded) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '/images/aleph_48.png',
            title: 'Models Loading',
            message: 'Please wait, models are still loading...'
        });
        return;
    }

    // Inject content script
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
    });
});

/**
 * Handle messages from content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.text) {
        if (!modelLoaded) {
            sendResponse({
                processed: 'error',
                error: 'Models not loaded yet. Please wait and try again.'
            });
            return false;
        }

        // Process text asynchronously
        diacritizeText(request.text)
            .then(result => {
                sendResponse({ processed: result });
            })
            .catch(error => {
                console.error('Diacritization error:', error);
                sendResponse({
                    processed: 'error',
                    error: error.message
                });
            });

        // Return true to indicate async response
        return true;
    }
});

/**
 * Load models on extension startup
 */
console.log('🚀 Arabic Tashkeel Extension starting...');
loadModels().then(success => {
    if (success) {
        console.log('✅ Extension ready!');
    } else {
        console.error('❌ Failed to load models. Please check that model files exist in model/ directory.');
    }
});
