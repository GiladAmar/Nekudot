# Model Files

This directory should contain the ONNX model files for the CATT (Character-Aware Transformer for Tashkeel) model.

## Required Files

- `encoder.onnx` (~250MB) - Transformer encoder
- `decoder.onnx` (~250MB) - Linear decoder

## How to Get the Models

### Option 1: Automatic Export (Recommended)

Run the provided export script:

```bash
# From the root directory of this project
python3 scripts/export_onnx.py
```

This will:
1. Download the pre-trained CATT model (~500MB)
2. Extract the ONNX files
3. Copy them to this directory

### Option 2: Manual Setup

See [MODEL_SETUP.md](../MODEL_SETUP.md) for detailed instructions on:
- Installing dependencies
- Exporting models from the CATT repository
- Manual model placement

## Verification

After adding the models, verify they're in place:

```bash
ls -lh model/
```

You should see:
```
-rw-r--r-- encoder.onnx (~250MB)
-rw-r--r-- decoder.onnx (~250MB)
```

## Note

These models are not included in the repository due to their large size (~500MB total).
Each user needs to export or download them separately.

## Troubleshooting

If you encounter issues:
1. Check you have ~2GB free disk space
2. Ensure you have internet connection for initial download
3. See [MODEL_SETUP.md](../MODEL_SETUP.md) for troubleshooting guide

## Resources

- [CATT Repository](https://github.com/abjadai/catt)
- [catt-tashkeel Package](https://pypi.org/project/catt-tashkeel/)
- [Model Releases](https://github.com/abjadai/catt/releases)
