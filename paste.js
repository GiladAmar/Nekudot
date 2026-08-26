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
    status.textContent = 'Adding nikud...';
    output.value = '';
    copy.disabled = true;

    let finished = false;
    const port = chrome.runtime.connect({name: 'nekudot'});
    port.onMessage.addListener((msg) => {
        if (msg.type === 'result') {
            output.value = msg.text;
        } else if (msg.type === 'done') {
            finished = true;
            status.textContent = '';
            run.disabled = false;
            copy.disabled = !output.value;
            port.disconnect();
        } else if (msg.type === 'fatal') {
            finished = true;
            status.textContent = 'Failed: ' + msg.reason;
            run.disabled = false;
            port.disconnect();
        }
    });
    // Service worker death would otherwise leave the button disabled forever.
    port.onDisconnect.addListener(() => {
        if (finished) return;
        status.textContent = 'Failed: connection lost — try again';
        run.disabled = false;
    });
    port.postMessage({type: 'diacritize', segments: [{id: 0, text}]});
});

copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(output.value);
    status.textContent = 'Copied!';
    setTimeout(() => { status.textContent = ''; }, 2000);
});
