# Quick Start Guide

Get the Arabic Tashkeel extension running in 5 minutes!

## Prerequisites

- Python 3.7+ installed
- Node.js and npm installed
- Google Chrome browser

## Step-by-Step Setup

### 1. Install Python Dependencies

```bash
cd server
pip install -r requirements.txt
```

**What this does:** Installs Flask web server and the `catt-tashkeel` package with the CATT model.

**Note:** The first run will download the pre-trained model (~500MB). This may take a few minutes depending on your internet speed.

### 2. Start the Python Server

```bash
python3 tashkeel_server.py
```

**Expected output:**
```
==================================================
Arabic Tashkeel Server
==================================================
Loading CATT Encoder-Only model...
✅ Model loaded successfully!

🚀 Starting server on http://localhost:5000
📝 API endpoint: POST /diacritize
❤️  Health check: GET /health

Press Ctrl+C to stop the server
```

**Keep this terminal window open!** The server must be running for the extension to work.

### 3. Build the Chrome Extension

Open a **new terminal window** and run:

```bash
npm install
npm run build
```

**Expected output:**
```
✨ Built in 6.12s

dist/content.js       1.65 kB
dist/background.js    1.41 kB
```

### 4. Load the Extension in Chrome

1. Open Chrome and go to: `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Navigate to and select the `dist/` folder
5. You should see "Arabic Tashkeel" extension loaded ✅

### 5. Test It Out!

1. Go to any website with Arabic text (e.g., a news site like [Al Jazeera](https://www.aljazeera.net/))
2. Select some Arabic text with your mouse
3. Click the extension icon in your Chrome toolbar
4. Watch the text get diacritized! ✨

## Example Test

Try diacritizing this text:

```
وقالت مجلة نيوزويك الأمريكية التحديث الجديد
```

Expected result:
```
وَقَالَتْ مَجَلَّةُ نْيُوزْوِيكَ الْأَمْرِيكِيَّةُ التَّحْدِيثُ الْجَدِيدُ
```

## Troubleshooting

### "Server Not Running" notification

**Problem:** You see a notification saying the server is not running.

**Solution:** Make sure you started the Python server in step 2.

### Import Error

**Problem:** `ModuleNotFoundError: No module named 'flask'`

**Solution:** Run `pip install -r requirements.txt` in the `server/` directory.

### Extension Not Appearing

**Problem:** The extension doesn't show up in Chrome.

**Solution:**
- Make sure you selected the `dist/` folder, not the root folder
- Check that Developer mode is enabled in `chrome://extensions/`
- Try reloading the extension

### No Changes to Text

**Problem:** Clicking the icon doesn't diacritize the text.

**Solution:**
- Did you select text first? You must highlight text before clicking
- Check that the server is running (visit http://localhost:5000)
- Open DevTools (F12) and check the Console for error messages

## Using the API Directly

You can also use the server API directly from the command line:

```bash
curl -X POST http://localhost:5000/diacritize \
  -H "Content-Type: application/json" \
  -d '{"text": "مرحبا بك"}'
```

Response:
```json
{
  "original": "مرحبا بك",
  "diacritized": "مَرْحَباً بِكَ"
}
```

## Next Steps

- Read the full [README.md](README.md) for advanced configuration
- Customize the server port or model type
- Report issues or contribute on GitHub

## Need Help?

- Check the [README.md](README.md) for detailed documentation
- Check the server logs in the terminal
- Open Chrome DevTools (F12) to see extension logs

Happy diacritizing! 🎉
