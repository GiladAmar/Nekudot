// Load the extension's layers model from disk in Node (tests, benchmarks).
import {io} from '@tensorflow/tfjs-core';
import {loadLayersModel} from '@tensorflow/tfjs-layers';
import {readModelArtifacts} from './quantize_model.mjs';

async function loadModelFromDisk(dir) {
    const {modelJSON, weightData} = await readModelArtifacts(dir);
    return loadLayersModel(io.fromMemory({
        modelTopology: modelJSON.modelTopology,
        weightSpecs: modelJSON.weightsManifest.flatMap(g => g.weights),
        weightData,
    }));
}

export {loadModelFromDisk};
