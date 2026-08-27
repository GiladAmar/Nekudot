// Load the extension's layers model from disk in Node (tests, benchmarks).
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {io} from '@tensorflow/tfjs-core';
import {loadLayersModel} from '@tensorflow/tfjs-layers';

async function loadModelFromDisk(dir) {
    const modelJSON = JSON.parse(await readFile(join(dir, 'model.json'), 'utf8'));
    const weightSpecs = modelJSON.weightsManifest.flatMap(g => g.weights);
    const buffers = await Promise.all(
        modelJSON.weightsManifest.flatMap(g => g.paths).map(p => readFile(join(dir, p))));
    const weightData = new Uint8Array(buffers.reduce((a, b) => a + b.length, 0));
    let offset = 0;
    for (const b of buffers) {
        weightData.set(b, offset);
        offset += b.length;
    }
    return loadLayersModel(io.fromMemory({
        modelTopology: modelJSON.modelTopology,
        weightSpecs,
        weightData: weightData.buffer,
    }));
}

export {loadModelFromDisk};
