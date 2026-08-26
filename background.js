import * as tf from '@tensorflow/tfjs';
import {diacritize} from './text_encoding.mjs';

async function load_model() {
    const model = await tf.loadLayersModel(chrome.runtime.getURL("model/model.json"));

    model.summary()
    return model
}

const model = load_model()

chrome.action.onClicked.addListener(tab => {
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ['content.js'],
    });
});


chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {

        model.then(function (res) {
            sendResponse({processed: diacritize(tf, res, request.text)});

        }, function (err) {
            sendResponse({processed: 'error'});
        });
        return true
    }
);
