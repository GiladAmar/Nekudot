// Quantize a tfjs layers model's float32 weights to float16 (half size).
// tfjs dequantizes `quantization: {dtype: 'float16'}` natively at load time.
//
// Used at build time (see the `copy` npm script) so model/ stays the
// float32 source of truth; the extension ships the quantized copy.
//
// CLI: node scripts/quantize_model.mjs <srcDir> <dstDir>
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';

const f32buf = new Float32Array(1);
const u32buf = new Uint32Array(f32buf.buffer);

// IEEE 754 float32 -> float16 bits, round-to-nearest-even.
function toHalf(value) {
    f32buf[0] = value;
    const x = u32buf[0];
    const sign = (x >>> 16) & 0x8000;
    const exp = (x >>> 23) & 0xff;
    const frac = x & 0x7fffff;

    if (exp === 0xff) // Inf / NaN
        return sign | 0x7c00 | (frac ? 0x200 : 0);

    const e = exp - 127 + 15;
    if (e >= 0x1f) // overflow -> Inf
        return sign | 0x7c00;

    if (e <= 0) { // subnormal half (or underflow to zero)
        if (e < -10)
            return sign;
        const m = (frac | 0x800000) >>> (1 - e);
        return sign | ((m >>> 13) + roundHalfEven(m, 13));
    }

    // mantissa rounding may carry into the exponent bits — that is the
    // correct rounded result (and saturates to Inf at e === 0x1f)
    return (sign | (e << 10) | (frac >>> 13)) + roundHalfEven(frac, 13);
}

// Rounding increment for dropping `bits` low bits of `m`, nearest-even.
function roundHalfEven(m, bits) {
    const lsb = (m >>> bits) & 1;
    const roundBit = (m >>> (bits - 1)) & 1;
    const sticky = m & ((1 << (bits - 1)) - 1);
    return (roundBit && (sticky || lsb)) ? 1 : 0;
}

// Quantize in-memory model artifacts. Returns new {modelJSON, weightData}.
function quantizeToFloat16(modelJSON, weightData) {
    const bytes = new Uint8Array(weightData);
    const specs = modelJSON.weightsManifest.flatMap(g => g.weights);

    const parts = [];
    const newSpecs = [];
    let offset = 0;
    let outBytes = 0;
    for (const spec of specs) {
        if (spec.quantization)
            throw new Error(`weight ${spec.name} is already quantized — refusing to re-quantize`);
        const size = spec.shape.reduce((a, b) => a * b, 1);
        if (spec.dtype === 'float32') {
            const src = new Float32Array(size);
            new Uint8Array(src.buffer).set(bytes.subarray(offset, offset + size * 4));
            const dst = new Uint16Array(size);
            for (let i = 0; i < size; i++)
                dst[i] = toHalf(src[i]);
            parts.push(new Uint8Array(dst.buffer));
            newSpecs.push({...spec, quantization: {dtype: 'float16'}});
            offset += size * 4;
            outBytes += size * 2;
        } else {
            const bytesPerElement = {int32: 4, uint8: 1, bool: 1}[spec.dtype];
            if (!bytesPerElement)
                throw new Error(`weight ${spec.name} has unsupported dtype ${spec.dtype}`);
            const byteLength = size * bytesPerElement;
            parts.push(bytes.subarray(offset, offset + byteLength));
            newSpecs.push(spec);
            offset += byteLength;
            outBytes += byteLength;
        }
    }

    const out = new Uint8Array(outBytes);
    let outOffset = 0;
    for (const part of parts) {
        out.set(part, outOffset);
        outOffset += part.length;
    }

    const newModelJSON = {
        ...modelJSON,
        weightsManifest: [{paths: ['group1-shard1of1.bin'], weights: newSpecs}],
    };
    return {modelJSON: newModelJSON, weightData: out.buffer};
}

async function readModelArtifacts(dir) {
    const modelJSON = JSON.parse(await readFile(join(dir, 'model.json'), 'utf8'));
    const buffers = await Promise.all(
        modelJSON.weightsManifest.flatMap(g => g.paths).map(p => readFile(join(dir, p))));
    const weightData = new Uint8Array(buffers.reduce((a, b) => a + b.length, 0));
    let offset = 0;
    for (const b of buffers) {
        weightData.set(b, offset);
        offset += b.length;
    }
    return {modelJSON, weightData: weightData.buffer};
}

export {toHalf, quantizeToFloat16, readModelArtifacts};

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    const [srcDir, dstDir] = process.argv.slice(2);
    if (!srcDir || !dstDir) {
        console.error('usage: node scripts/quantize_model.mjs <srcDir> <dstDir>');
        process.exit(1);
    }
    const src = await readModelArtifacts(srcDir);
    const {modelJSON, weightData} = quantizeToFloat16(src.modelJSON, src.weightData);
    await mkdir(dstDir, {recursive: true});
    await writeFile(join(dstDir, 'model.json'), JSON.stringify(modelJSON));
    await writeFile(join(dstDir, 'group1-shard1of1.bin'), Buffer.from(weightData));
    console.log(`quantized ${srcDir} (${src.weightData.byteLength} B) -> ${dstDir} (${weightData.byteLength} B)`);
}
