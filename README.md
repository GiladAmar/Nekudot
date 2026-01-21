# Arabic Tashkeel - Chrome Extension

A Google Chrome extension that automatically adds diacritical marks (tashkeel/harakat) to Arabic text using the state-of-the-art CATT (Character-Aware Transformer for Tashkeel) model.

## Features

- **Automatic Diacritization**: Select any Arabic text on a webpage and add diacritical marks with one click
- **CATT Model**: Uses the advanced Character-Aware Transformer model from [abjadai/catt](https://github.com/abjadai/catt)
- **Local Processing**: All processing happens on your local machine - no data sent to external servers
- **Works Everywhere**: Compatible with any website containing Arabic text

## Diacritical Marks Supported

- **Fatha** (َ), **Damma** (ُ), **Kasra** (ِ), **Sukun** (ْ)
- **Shadda** (ّ) - Consonant doubling
- **Tanween** variants (ً ٌ ٍ) - Nunation
- All other Arabic diacritical marks

## Architecture

This extension uses a **client-server architecture**:

- **Chrome Extension** (client): Handles text selection and UI interaction
- **Python Server** (backend): Runs the CATT model for diacritization

## Installation

### 1. Set Up the Python Server

First, install the Python dependencies:

```bash
cd server
pip install -r requirements.txt
```

This will install:
- Flask (web server)
- Flask-CORS (for extension communication)
- catt-tashkeel (Arabic diacritization model)

The first time you run the server, it will automatically download the pre-trained CATT model (~500MB).

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

### 1. Start the Python Server

Before using the extension, start the local server:

```bash
cd server
python3 tashkeel_server.py
```

You should see:
```
==================================================
Arabic Tashkeel Server
==================================================
✅ Loaded model successfully!
🚀 Starting server on http://localhost:5000
```

Keep this server running while using the extension.

### 2. Diacritize Text

1. Navigate to any webpage with Arabic text
2. Select the Arabic text you want to diacritize
3. Click the extension icon in your Chrome toolbar
4. The selected text will be replaced with the diacritized version

**Note**: If the server is not running, the extension will show a notification asking you to start it.

## API

The Python server exposes a simple REST API:

### Health Check
```bash
curl http://localhost:5000/health
```

### Diacritize Text
```bash
curl -X POST http://localhost:5000/diacritize \
  -H "Content-Type: application/json" \
  -d '{"text": "وقالت مجلة نيوزويك الأمريكية"}'
```

Response:
```json
{
  "original": "وقالت مجلة نيوزويك الأمريكية",
  "diacritized": "وَقَالَتْ مَجَلَّةُ نْيُوزْوِيكَ الْأَمْرِيكِيَّةُ"
}
```

## Development

### Chrome Extension

**Build Scripts:**
- `npm run build` - Production build
- `npm run build-dev` - Development build with source maps

**Structure:**
- `background.js` - Communicates with the Python server
- `content.js` - Handles text selection and replacement on web pages
- `manifest.json` - Extension configuration

### Python Server

**Files:**
- `server/tashkeel_server.py` - Flask server for CATT model inference
- `server/requirements.txt` - Python dependencies

**Customization:**
- To change the server port, edit `SERVER_URL` in `background.js` and update the Flask `app.run()` call
- To use the encoder-decoder model instead of encoder-only, change `CATTEncoderOnly` to `CATTEncoderDecoder` in `tashkeel_server.py`

## Troubleshooting

### "Server Not Running" Notification

**Problem**: The extension shows a notification that the server is not running.

**Solution**:
```bash
cd server
python3 tashkeel_server.py
```

### Server Fails to Start

**Problem**: `ModuleNotFoundError: No module named 'flask'`

**Solution**: Install the Python dependencies:
```bash
cd server
pip install -r requirements.txt
```

### Model Download Fails

**Problem**: The CATT model fails to download automatically.

**Solution**: The model will be downloaded on first run. If it fails due to network issues, the `catt-tashkeel` package will retry. You can also manually download the model from the [CATT releases](https://github.com/abjadai/catt/releases).

### Extension Not Working

**Checklist:**
1. Is the Python server running? Check http://localhost:5000 in your browser
2. Is the extension loaded in Chrome? Check `chrome://extensions/`
3. Did you select Arabic text before clicking the icon?
4. Check the browser console (F12) for error messages

## Technical Details

**CATT Model:**
- **Type**: Encoder-Only Transformer (faster inference) or Encoder-Decoder (higher accuracy)
- **Framework**: PyTorch with ONNX Runtime
- **Model Size**: ~500MB (downloaded automatically)
- **Inference Speed**: ~100-200 characters per second

**Extension:**
- **Manifest Version**: 3
- **Permissions**: activeTab, scripting, notifications, localhost:5000
- **No external dependencies** (no TensorFlow.js required)

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