# Model Setup Guide

This extension requires CATT (Character-Aware Transformer for Tashkeel) models in ONNX format. Follow these steps to export and install the models.

## Prerequisites

- Python 3.7+ installed
- pip package manager
- Internet connection (for initial model download)

## Step-by-Step Setup

### Option 1: Using catt-tashkeel Package (Recommended)

The `catt-tashkeel` package provides pre-trained models that can be exported to ONNX format.

#### 1. Install catt-tashkeel

```bash
pip install catt-tashkeel torch onnx onnxruntime
```

#### 2. Download and Export Models

Run the export script provided:

```bash
python3 scripts/export_onnx.py
```

This script will:
- Download the pre-trained CATT Encoder-Only model (~500MB)
- Locate the ONNX files from the package
- Copy them to the `model/` directory

**Note**: The first run will download the models automatically. This may take several minutes depending on your internet speed.

#### 3. Verify Model Files

Check that the following files exist in the `model/` directory:

```
model/
├── encoder.onnx  (~250MB)
└── decoder.onnx  (~250MB)
```

### Option 2: Manual Export from CATT Repository

If the automatic method doesn't work, you can manually export the models:

#### 1. Clone CATT Repository

```bash
git clone https://github.com/abjadai/catt.git
cd catt
```

#### 2. Install Dependencies

```bash
pip install pytorch_lightning==2.5.2 torch onnx onnxruntime
```

#### 3. Download Pre-trained Model

```bash
mkdir models
wget -P models/ https://github.com/abjadai/catt/releases/download/v2/best_eo_mlm_ns_epoch_193.pt
```

#### 4. Export to ONNX

```bash
python export_to_onnx.py
```

This creates ONNX models in `onnx_models/eo_model/`.

#### 5. Copy to Extension

```bash
cp onnx_models/eo_model/*.onnx /path/to/Nekudot/model/
```

### Option 3: Using Pre-exported ONNX Models

If someone has already exported the models, you can use them directly:

1. Obtain the `encoder.onnx` and `decoder.onnx` files
2. Copy them to the `model/` directory in the extension folder
3. Verify the files are in place

## Troubleshooting

### "Failed to download models" Error

**Problem**: Network issues prevent downloading the pre-trained models.

**Solution**:
1. Check your internet connection
2. Try using a VPN if access is restricted
3. Download the model manually from [CATT releases](https://github.com/abjadai/catt/releases)
4. Place the `.pt` file in the appropriate location

### "ONNX export failed" Error

**Problem**: PyTorch or ONNX export fails.

**Solution**:
1. Ensure you have the correct versions:
   ```bash
   pip install --upgrade torch onnx onnxruntime
   ```
2. Check that you have enough disk space (~2GB required)
3. Try running the export with `--verbose` flag for more details

### Models Not Loading in Extension

**Problem**: Extension shows "Models not loaded" error.

**Solution**:
1. Verify the model files exist in `model/`:
   ```bash
   ls -lh model/
   ```
2. Check file sizes - each should be around 250MB
3. Rebuild the extension:
   ```bash
   npm run build
   ```
4. Reload the extension in Chrome

### Model Files Too Large

**Problem**: Model files exceed GitHub's file size limit or Chrome extension limits.

**Solution**:
- The models are designed to work within Chrome's extension limits
- If uploading to GitHub, use Git LFS:
  ```bash
  git lfs install
  git lfs track "*.onnx"
  git add .gitattributes
  git add model/*.onnx
  git commit -m "Add ONNX models via LFS"
  ```

## Model Information

**CATT Encoder-Only Model:**
- **Architecture**: Transformer Encoder + Linear Decoder
- **Parameters**: ~50M
- **Input**: Buckwalter-encoded Arabic text
- **Output**: Diacritical mark predictions
- **Sequence Length**: Up to 1024 tokens
- **Inference Speed**: ~100-200 characters/second in browser

**Files:**
- `encoder.onnx`: Transformer encoder (extracts contextual features)
- `decoder.onnx`: Linear layer decoder (predicts tashkeel marks)

## Testing the Models

Once installed, test the models with this Python script:

```python
import onnxruntime as ort

# Load encoder
encoder_session = ort.InferenceSession('model/encoder.onnx')
print("✅ Encoder loaded")
print(f"   Inputs: {[i.name for i in encoder_session.get_inputs()]}")
print(f"   Outputs: {[o.name for o in encoder_session.get_outputs()]}")

# Load decoder
decoder_session = ort.InferenceSession('model/decoder.onnx')
print("✅ Decoder loaded")
print(f"   Inputs: {[i.name for i in decoder_session.get_inputs()]}")
print(f"   Outputs: {[o.name for o in decoder_session.get_outputs()]}")
```

Expected output:
```
✅ Encoder loaded
   Inputs: ['src', 'src_mask']
   Outputs: ['encoder_output']
✅ Decoder loaded
   Inputs: ['enc_src']
   Outputs: ['decoder_output']
```

## Next Steps

After successfully setting up the models:

1. Build the extension: `npm run build`
2. Load it in Chrome: `chrome://extensions/`
3. Test with Arabic text from any website

## Resources

- [CATT Repository](https://github.com/abjadai/catt)
- [catt-tashkeel Package](https://pypi.org/project/catt-tashkeel/)
- [ONNX Runtime](https://onnxruntime.ai/)
- [Model Releases](https://github.com/abjadai/catt/releases)
