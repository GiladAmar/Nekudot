# Arabic Tashkeel - Chrome Extension

A Google Chrome extension that automatically adds diacritical marks (tashkeel/harakat) to Arabic text using the state-of-the-art CATT (Character-Aware Transformer for Tashkeel) model running directly in your browser.

## Features

- **Automatic Diacritization**: Select any Arabic text on a webpage and add diacritical marks with one click
- **CATT Model**: Uses the advanced Character-Aware Transformer model from [abjadai/catt](https://github.com/abjadai/catt)
- **Fully Local**: All processing happens in your browser using ONNX.js - no external servers required
- **Privacy-Focused**: No data leaves your machine
- **Works Offline**: Once loaded, works without internet connection
- **Works Everywhere**: Compatible with any website containing Arabic text

## Diacritical Marks Supported

- **Fatha** (َ), **Damma** (ُ), **Kasra** (ِ), **Sukun** (ْ)
- **Shadda** (ّ) - Consonant doubling
- **Tanween** variants (ً ٌ ٍ) - Nunation
- All other Arabic diacritical marks

## Architecture

This extension runs entirely in your browser using:

- **ONNX.js**: JavaScript runtime for ONNX models
- **CATT Model**: State-of-the-art transformer model exported to ONNX format
- **Custom Tokenizer**: JavaScript port of the CATT tokenizer with Buckwalter transliteration
- **No External Dependencies**: Everything runs locally in Chrome

## Installation

### 1. Set Up the ONNX Models

The extension requires CATT models in ONNX format. See [MODEL_SETUP.md](MODEL_SETUP.md) for detailed instructions.

**Quick setup:**

```bash
# Install Python dependencies for export
pip install catt-tashkeel torch onnx onnxruntime

# Export models to ONNX format
python3 scripts/export_onnx.py
```

This will create `model/encoder.onnx` and `model/decoder.onnx` (~500MB total).

### 2. Build the Chrome Extension

```bash
# Install Node.js dependencies
npm install

# Build the extension
npm run build
```

### 3. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` folder from this project

## Usage

1. Navigate to any webpage with Arabic text
2. Select the Arabic text you want to diacritize
3. Click the extension icon in your Chrome toolbar
4. The selected text will be replaced with the diacritized version

**Note**: The first time you use the extension, it will load the ONNX models (~500MB) which may take a few seconds.

## Development

### Project Structure

```
├── background.js              # ONNX.js inference engine
├── content.js                 # DOM manipulation and text selection
├── tashkeel_tokenizer.js      # Tokenization and text processing
├── buckwalter.js              # Arabic-Buckwalter transliteration
├── manifest.json              # Extension configuration
├── model/                     # ONNX model files
│   ├── encoder.onnx           # Transformer encoder
│   └── decoder.onnx           # Linear decoder
└── scripts/
    └── export_onnx.py         # Model export script
```

### Build Scripts

- `npm run build` - Production build
- `npm run build-dev` - Development build with source maps
- `npm install` - Install dependencies

### Technical Components

**Tokenizer** (`tashkeel_tokenizer.js`):
- Implements the complete CATT tokenization pipeline
- Handles Buckwalter transliteration (Arabic ↔ ASCII)
- Splits text into letters and diacritics
- Encodes/decodes to/from token IDs

**Buckwalter** (`buckwalter.js`):
- Standard Buckwalter transliteration scheme
- Converts Arabic Unicode to ASCII for model input
- Converts model output back to Arabic Unicode

**Inference** (`background.js`):
- Loads ONNX models using onnxruntime-web
- Implements encoder-decoder inference pipeline
- Handles attention masks and padding
- Applies post-processing (argmax, space masking)

## Troubleshooting

### "Models not loaded" Error

**Problem**: Extension shows models not loaded.

**Solution**:
1. Verify model files exist in `model/` directory:
   ```bash
   ls -lh model/
   ```
2. Check file sizes (each ~250MB)
3. Follow [MODEL_SETUP.md](MODEL_SETUP.md) to export models
4. Rebuild extension: `npm run build`
5. Reload extension in Chrome

### Model Export Fails

**Problem**: `python3 scripts/export_onnx.py` fails.

**Solution**:
- Ensure you have internet connection (for initial download)
- Install all Python dependencies:
  ```bash
  pip install catt-tashkeel torch onnx onnxruntime
  ```
- Check you have ~2GB free disk space
- See [MODEL_SETUP.md](MODEL_SETUP.md) for alternative methods

### Extension Not Diacritizing

**Problem**: Clicking the icon doesn't add diacritics.

**Checklist:**
1. Did you select text before clicking? Highlight Arabic text first
2. Are models loaded? Check DevTools Console (F12) for errors
3. Is the extension enabled? Check `chrome://extensions/`
4. Try reloading the extension

### Build Errors

**Problem**: `npm run build` fails.

**Solution**:
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json dist
npm install
npm run build
```

## Technical Details

**CATT Model:**
- **Type**: Encoder-Only Transformer
- **Architecture**: 6-layer transformer encoder + linear decoder
- **Parameters**: ~50M
- **Input**: Buckwalter-encoded Arabic text (max 1024 tokens)
- **Output**: Diacritical mark predictions (18 classes)
- **Format**: ONNX (optimized for browser)

**Runtime:**
- **Engine**: ONNX Runtime Web (WebAssembly backend)
- **Model Size**: ~500MB (encoder + decoder)
- **Load Time**: ~2-3 seconds (first time)
- **Inference Speed**: ~100-200 characters/second

**Extension:**
- **Manifest Version**: 3
- **Permissions**: activeTab, scripting, notifications
- **Dependencies**: onnxruntime-web
- **Bundle Size**: ~2MB (including ONNX.js runtime)

## Credits

- **CATT Model**: [abjadai/catt](https://github.com/abjadai/catt) - Character-Aware Transformer for Tashkeel
- **Extension Structure**: Adapted from [Nekudot](https://github.com/GiladAmar/Nekudot) (Hebrew diacritization extension) by Gilad Amar

## License

MIT License

## Contributing

Contributions are welcome! Areas for improvement:

- Add support for batch processing of larger texts
- Create a standalone Electron app version
- Add configuration UI for server settings
- Implement caching for frequently diacritized phrases
- Support for offline mode with pre-downloaded model