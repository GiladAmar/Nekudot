# Arabic Tashkeel - Chrome Extension

A Google Chrome extension that automatically adds diacritical marks (tashkeel/harakat) to Arabic text using deep learning.

## Features

- **Automatic Diacritization**: Select any Arabic text on a webpage and add diacritical marks with one click
- **Machine Learning Powered**: Uses TensorFlow.js with a trained LSTM model
- **Fast and Local**: All processing happens in your browser - no data sent to external servers
- **Works Everywhere**: Compatible with any website containing Arabic text

## Diacritical Marks Supported

- **Fatha** (َ), **Damma** (ُ), **Kasra** (ِ), **Sukun** (ْ)
- **Shadda** (ّ) - Consonant doubling
- **Tanween** variants (ً ٌ ٍ) - Nunation

## Installation

### Setup Locally

1. Install the requirements:
   ```bash
   npm install
   ```

2. Create the compiled code:
   ```bash
   npm run build
   ```

3. Install the package by following [these instructions](https://webkul.com/blog/how-to-install-the-unpacked-extension-in-chrome/)
   - Use the `dist/` folder as the source
   - Open `chrome://extensions/` and enable Developer mode
   - Click "Load unpacked" and select the `dist/` folder

## Usage

1. Navigate to any webpage with Arabic text
2. Select the Arabic text you want to diacritize
3. Click the extension icon in your Chrome toolbar
4. The selected text will be replaced with the diacritized version

## Model Training

⚠️ **Important**: This extension requires a trained Arabic diacritization model. The current model files are from the original Hebrew extension and need to be replaced.

See [MODEL_TRAINING.md](MODEL_TRAINING.md) for detailed instructions on training and converting an Arabic model using the [Arabic-Text-Diacritization](https://github.com/AbdelrahmanHamdyy/Arabic-Text-Diacritization) repository.

## Development

**Build Scripts:**
- `npm run build` - Production build
- `npm run build-dev` - Development build with source maps

**Technical Stack:**
- TensorFlow.js v4.16.0
- Parcel bundler
- Chrome Extension Manifest V3

## Credits

- Arabic diacritization model architecture based on [Arabic-Text-Diacritization](https://github.com/AbdelrahmanHamdyy/Arabic-Text-Diacritization)
- Extension structure adapted from [Nekudot](https://github.com/GiladAmar/Nekudot) (Hebrew diacritization)

## License

MIT License