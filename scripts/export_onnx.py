#!/usr/bin/env python3
"""
Export CATT Encoder-Only model to ONNX format for use in browser
"""

import sys
import os
from pathlib import Path

# Add catt directory to path
sys.path.insert(0, '/home/user/catt')

try:
    from catt_tashkeel import CATTEncoderOnly
    from catt_tashkeel.tokenizer import TashkeelTokenizer
    print("✅ Using catt-tashkeel package")
except ImportError:
    print("❌ catt-tashkeel not found, trying local CATT repo")
    from eo_pl import TashkeelModel as TashkeelModelEO
    from tashkeel_tokenizer import TashkeelTokenizer

def export_to_onnx_browser():
    """
    Export CATT Encoder-Only model to ONNX for browser use
    """
    print("="*60)
    print("CATT Model Export for Browser")
    print("="*60)

    # Initialize model (will download if needed)
    print("\n📥 Loading CATT Encoder-Only model...")
    try:
        model = CATTEncoderOnly()
        print("✅ Model loaded successfully from catt-tashkeel package")

        # Get the model paths
        import catt_tashkeel
        package_dir = Path(catt_tashkeel.__file__).parent
        onnx_dir = package_dir / "onnx_models" / "eo_model"

        encoder_path = onnx_dir / "encoder.onnx"
        decoder_path = onnx_dir / "decoder.onnx"

        # Check if models exist
        if encoder_path.exists() and decoder_path.exists():
            print("✅ Found existing ONNX models:")
            print(f"   Encoder: {encoder_path}")
            print(f"   Decoder: {decoder_path}")

            # Copy to extension model directory
            output_dir = Path("/home/user/Nekudot/model")
            output_dir.mkdir(parents=True, exist_ok=True)

            import shutil
            shutil.copy(encoder_path, output_dir / "encoder.onnx")
            shutil.copy(decoder_path, output_dir / "decoder.onnx")

            print(f"\n✅ Copied ONNX models to: {output_dir}")
            print(f"   Encoder size: {(output_dir / 'encoder.onnx').stat().st_size / 1024 / 1024:.2f} MB")
            print(f"   Decoder size: {(output_dir / 'decoder.onnx').stat().st_size / 1024 / 1024:.2f} MB")

            return True
        else:
            print("❌ ONNX models not found in package")
            return False

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = export_to_onnx_browser()
    if success:
        print("\n✨ Export completed successfully!")
        print("\nNext steps:")
        print("1. The ONNX models are now in /home/user/Nekudot/model/")
        print("2. Build the extension: npm run build")
        print("3. Load the extension in Chrome")
    else:
        print("\n❌ Export failed")
        print("\nTroubleshooting:")
        print("- Ensure catt-tashkeel is installed: pip install catt-tashkeel")
        print("- The first run will download models (~500MB)")
        sys.exit(1)
