# Arabic Diacritization Model Training Guide

This document explains how to train and convert the Arabic diacritization model for use in this Chrome extension.

## Overview

The Arabic Tashkeel extension uses a TensorFlow.js model to predict diacritical marks (tashkeel/harakat) for Arabic text. The model needs to be trained using the code from the [Arabic-Text-Diacritization repository](https://github.com/AbdelrahmanHamdyy/Arabic-Text-Diacritization).

## Model Requirements

The model should predict:
1. **Harakat (short vowels)**: Fatha (َ), Damma (ُ), Kasra (ِ), Sukun (ْ), and Tanween variants
2. **Shadda (doubling mark)**: ّ

## Training Process

### Step 1: Clone and Setup the Training Repository

```bash
git clone https://github.com/AbdelrahmanHamdyy/Arabic-Text-Diacritization.git
cd Arabic-Text-Diacritization
pip install -r requirements.txt
```

### Step 2: Train the Model

Follow the instructions in the repository to train the LSTM model:

```bash
cd src
python train.py
```

The model will be saved in `../trained_models/` directory.

### Step 3: Convert to TensorFlow.js Format

The model needs to be converted to TensorFlow.js format using tensorflowjs_converter:

```bash
pip install tensorflowjs

# Convert the Keras model to TensorFlow.js format
tensorflowjs_converter \
    --input_format=keras \
    ../trained_models/your_model.h5 \
    ../web_model
```

### Step 4: Adapt Model Architecture

The current extension expects a model with the following characteristics:

- **Input**: Sequences of token indices (max length: 90)
- **Output**: Two prediction arrays:
  1. Harakat predictions (9 classes: none, fatha, damma, kasra, sukun, tanween-fath, tanween-damm, tanween-kasr, + 1 extra)
  2. Shadda predictions (3 classes: none, shadda, + 1 extra)

You may need to modify the training script to match this architecture, or adapt `background.js` to match your model's output format.

### Step 5: Install Model Files

Copy the converted model files to the `model/` directory:

```bash
cp ../web_model/model.json ./model/
cp ../web_model/*.bin ./model/
```

## Model File Structure

After conversion, your `model/` directory should contain:

```
model/
├── model.json           # Model architecture definition
└── group1-shard*.bin    # Model weight files (number may vary)
```

## Vocabulary Adjustments

The current `background.js` uses these tokens:

```javascript
const ARABIC_LETTERS = ['ا', 'أ', 'إ', 'آ', 'ء', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ',
                       'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ',
                       'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و',
                       'ؤ', 'ي', 'ئ', 'ى', 'ة'];
```

Make sure your training vocabulary matches these tokens, or update the `ARABIC_LETTERS` array to match your training vocabulary.

## Testing the Model

After installing the model:

1. Build the extension: `npm run build`
2. Load the extension in Chrome (chrome://extensions/)
3. Select Arabic text on any webpage
4. Click the extension icon to add diacritics

## Troubleshooting

### Model Loading Errors

- Ensure `model.json` and all shard files are in the `model/` directory
- Check that the model architecture matches the prediction function in `background.js`
- Verify the model expects the correct input shape (batch × 90)

### Prediction Issues

- The model must output exactly 2 arrays (harakat and shadda predictions)
- Each prediction should be categorical (one-hot encoded)
- The length of predictions should match the input sequence length

## Alternative: Using Pre-trained Weights

If a pre-trained Arabic diacritization model is available in TensorFlow.js format, you can:

1. Download the model files
2. Place them in the `model/` directory
3. Adjust the prediction arrays in `background.js` if needed

## Further Customization

You can customize the extension by:

- Adjusting the `MAXLEN` parameter (currently 90) in `split_to_rows()`
- Modifying the diacritics arrays to include/exclude specific marks
- Updating the normalization rules in the `normalize()` function

## Resources

- [Arabic-Text-Diacritization Repository](https://github.com/AbdelrahmanHamdyy/Arabic-Text-Diacritization)
- [TensorFlow.js Converter Documentation](https://www.tensorflow.org/js/guide/conversion)
- [Arabic Unicode Range](https://en.wikipedia.org/wiki/Arabic_(Unicode_block)): U+0600 to U+06FF
