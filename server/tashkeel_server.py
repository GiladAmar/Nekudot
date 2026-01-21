#!/usr/bin/env python3
"""
Arabic Tashkeel Server
A local HTTP server that provides Arabic diacritization using the CATT model.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for Chrome extension

# Global variable to hold the model
model = None

def initialize_model():
    """Initialize the CATT model"""
    global model
    try:
        from catt_tashkeel import CATTEncoderOnly
        print("Loading CATT Encoder-Only model...")
        model = CATTEncoderOnly()
        print("✅ Model loaded successfully!")
        return True
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        print("\nPlease install catt-tashkeel: pip install catt-tashkeel")
        return False

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None
    })

@app.route('/diacritize', methods=['POST'])
def diacritize():
    """Diacritize Arabic text"""
    if model is None:
        return jsonify({
            'error': 'Model not loaded'
        }), 500

    try:
        data = request.get_json()
        text = data.get('text', '')

        if not text:
            return jsonify({
                'error': 'No text provided'
            }), 400

        # Process the text with CATT
        result = model.do_tashkeel(text)

        return jsonify({
            'original': text,
            'diacritized': result
        })

    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/', methods=['GET'])
def index():
    """Index page with usage instructions"""
    return """
    <html>
    <head><title>Arabic Tashkeel Server</title></head>
    <body>
        <h1>Arabic Tashkeel Server</h1>
        <p>Server is running!</p>
        <h2>API Endpoints:</h2>
        <ul>
            <li><strong>GET /health</strong> - Check server health</li>
            <li><strong>POST /diacritize</strong> - Diacritize Arabic text</li>
        </ul>
        <h2>Example Usage:</h2>
        <pre>
curl -X POST http://localhost:5000/diacritize \\
  -H "Content-Type: application/json" \\
  -d '{"text": "وقالت مجلة نيوزويك الأمريكية"}'
        </pre>
        <p>Model Status: <strong>{}</strong></p>
    </body>
    </html>
    """.format("Loaded ✅" if model else "Not Loaded ❌")

if __name__ == '__main__':
    print("="*50)
    print("Arabic Tashkeel Server")
    print("="*50)

    # Initialize the model
    if not initialize_model():
        print("\n⚠️  Server starting without model. Install catt-tashkeel to enable diacritization.")
        print("Run: pip install catt-tashkeel")

    print("\n🚀 Starting server on http://localhost:5000")
    print("📝 API endpoint: POST /diacritize")
    print("❤️  Health check: GET /health")
    print("\nPress Ctrl+C to stop the server\n")

    app.run(host='0.0.0.0', port=5000, debug=False)
