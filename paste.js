// The paste page: diacritize arbitrary pasted text. Works where DOM
// rewriting can't (canvas-rendered apps like Google Docs, Word Online).
// Uses the shared port-protocol client from content_runtime with a custom
// apply target, so there is exactly one implementation of the protocol.
import {requestDiacritics} from './content_runtime.mjs';

const input = document.getElementById('input');
const output = document.getElementById('output');
const run = document.getElementById('run');
const copy = document.getElementById('copy');
const status = document.getElementById('status');

run.addEventListener('click', () => {
    const text = input.value;
    if (!text.trim()) return;

    run.disabled = true;
    status.textContent = 'Adding nikud...';
    output.value = '';
    copy.disabled = true;

    const pending = new Map();
    pending.set(0, {
        apply(dotted) {
            output.value = dotted;
            return () => { output.value = ''; };
        }
    });
    requestDiacritics([{id: 0, text}], pending, {
        onDone() {
            status.textContent = '';
            run.disabled = false;
            copy.disabled = !output.value;
        },
        onFail(message) {
            status.textContent = message.replace(/^Nekudot: /, 'Failed: ');
            run.disabled = false;
        },
    });
});

copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(output.value);
    status.textContent = 'Copied!';
    setTimeout(() => { status.textContent = ''; }, 2000);
});
