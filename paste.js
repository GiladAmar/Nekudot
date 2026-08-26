// The paste page: diacritize arbitrary pasted text. Works where DOM
// rewriting can't (canvas-rendered apps like Google Docs, Word Online).
// Uses the same port protocol as the content scripts.

const input = document.getElementById('input');
const output = document.getElementById('output');
const run = document.getElementById('run');
const copy = document.getElementById('copy');
const status = document.getElementById('status');

run.addEventListener('click', () => {
    const text = input.value;
    if (!text.trim()) return;

    run.disabled = true;
    status.textContent = 'מנקד...';
    output.value = '';
    copy.disabled = true;

    const port = chrome.runtime.connect({name: 'nekudot'});
    port.onMessage.addListener((msg) => {
        if (msg.type === 'result') {
            output.value = msg.text;
        } else if (msg.type === 'done') {
            status.textContent = '';
            run.disabled = false;
            copy.disabled = !output.value;
            port.disconnect();
        } else if (msg.type === 'fatal') {
            status.textContent = 'הניקוד נכשל: ' + msg.reason;
            run.disabled = false;
            port.disconnect();
        }
    });
    port.postMessage({type: 'diacritize', segments: [{id: 0, text}]});
});

copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(output.value);
    status.textContent = 'הועתק!';
    setTimeout(() => { status.textContent = ''; }, 2000);
});
