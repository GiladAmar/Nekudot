// Full end-to-end test: launches real Chrome with the built extension,
// opens a locally served snapshot of the ynet homepage, simulates Ctrl+A,
// invokes the extension exactly like the toolbar click does, then inspects
// the FINAL page HTML: every Hebrew-bearing element type must have received
// niqqud. Reports the active tfjs backend and end-to-end timing.
//
// Prereqs: `npm run build` (dist/) and `npm run fixtures` (page snapshot).
// Run with: npm run test:e2e
import {test, describe, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(repoRoot, 'tests', 'fixtures', 'ynet-home.html');
const DIST = join(repoRoot, 'dist');

const missing = !existsSync(FIXTURE) ? 'fixture missing — run `npm run fixtures`'
    : !existsSync(join(DIST, 'manifest.json')) ? 'dist missing — run `npm run build`'
    : false;

describe('extension end-to-end in Chrome', {skip: missing}, () => {
    let browser, server, page, sw, origin;

    before(async () => {
        // Serve the fixture locally; block everything else so the snapshot's
        // external references don't hit the network.
        const html = await readFile(FIXTURE, 'utf8');
        server = createServer((req, res) => {
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(html);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${server.address().port}`;

        // The shipped extension has only activeTab (granted by a real user
        // gesture, which automation cannot produce), so the test copy gets
        // host_permissions for the local origin instead.
        const extDir = await mkdtemp(join(tmpdir(), 'nekudot-e2e-'));
        await cp(DIST, extDir, {recursive: true});
        const manifest = JSON.parse(await readFile(join(extDir, 'manifest.json'), 'utf8'));
        manifest.host_permissions = [`${origin}/*`];
        await writeFile(join(extDir, 'manifest.json'), JSON.stringify(manifest));

        browser = await puppeteer.launch({
            headless: true,
            args: [
                `--disable-extensions-except=${extDir}`,
                `--load-extension=${extDir}`,
                ...(process.env.CI ? ['--no-sandbox'] : []),
            ],
        });

        const swTarget = await browser.waitForTarget(
            t => t.type() === 'service_worker' && t.url().includes('background.js'),
            {timeout: 30000});
        sw = await swTarget.worker();

        page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', req =>
            req.url().startsWith(origin) ? req.continue() : req.abort());
        await page.goto(origin + '/', {waitUntil: 'domcontentloaded', timeout: 30000});
    });

    after(async () => {
        if (browser) await browser.close();
        if (server) server.close();
    });

    test('service worker initializes the wasm backend and loads the model', async () => {
        const ready = await sw.evaluate(() => globalThis.__nekudotModelReady);
        assert.equal(ready, true, 'model must load and warm up');
        const backend = await sw.evaluate(() => globalThis.__nekudotBackend);
        console.log(`# backend in real Chrome service worker: ${backend}`);
        assert.equal(backend, 'wasm',
            'wasm must initialize in the MV3 service worker (regression: Worker is not defined)');
    });

    test('Ctrl+A + invoke diacritizes every Hebrew-bearing element type', async () => {
        // Simulate Ctrl+A
        await page.evaluate(() => {
            const range = document.createRange();
            range.selectNodeContents(document.body);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        const markCount = () => page.evaluate(() =>
            (document.body.innerText.match(/[\u05B0-\u05BC\u05C1\u05C2]/g) || []).length);

        assert.equal(await markCount(), 0, 'page must start without niqqud');

        // Invoke exactly like chrome.action.onClicked -> invoke() does
        const t0 = performance.now();
        await sw.evaluate(async (origin) => {
            const [tab] = await chrome.tabs.query({url: origin + '/*'});
            await chrome.scripting.executeScript({
                target: {tabId: tab.id, allFrames: true},
                files: ['content.js'],
            });
        }, origin);

        // Results stream in; wait until the mark count is stable.
        let last = 0, stable = 0, first = 0;
        const deadline = Date.now() + 120000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 500));
            const n = await markCount();
            if (n > 0 && first === 0) first = performance.now() - t0;
            stable = (n === last && n > 0) ? stable + 1 : 0;
            last = n;
            if (stable >= 4) break;
        }
        const total = performance.now() - t0 - 2000; // minus stability wait
        assert.ok(last > 0, 'no niqqud appeared within the deadline');
        console.log(`# first marks after ${(first / 1000).toFixed(1)}s, ` +
            `${last} marks total after ~${(total / 1000).toFixed(1)}s`);

        // Inspect the final HTML: group Hebrew text nodes by element type.
        const report = await page.evaluate(() => {
            const CAN_NIQQUD = /[אבגדהוזחטיכלמנסעפצקרשתךן]/g;
            const MARK = /[\u05B0-\u05BC\u05C1\u05C2]/;
            const perTag = {};
            const violations = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const text = node.textContent;
                const capable = (text.match(CAN_NIQQUD) || []).length;
                if (capable === 0) continue;
                if (node.parentElement && node.parentElement.closest('script,style,noscript,template'))
                    continue; // intentionally untouched
                const tag = node.parentElement ? node.parentElement.tagName.toLowerCase() : '?';
                const entry = perTag[tag] ??= {nodes: 0, dotted: 0, capableChars: 0};
                entry.nodes++;
                entry.capableChars += capable;
                if (MARK.test(text)) entry.dotted++;
                else if (capable >= 2)
                    violations.push({tag, text: text.slice(0, 60)});
            }
            return {perTag, violations};
        });

        const tags = Object.entries(report.perTag)
            .sort((a, b) => b[1].nodes - a[1].nodes);
        for (const [tag, s] of tags)
            console.log(`# <${tag}>: ${s.dotted}/${s.nodes} nodes dotted (${s.capableChars} capable chars)`);

        assert.deepEqual(report.violations, [],
            `Hebrew text nodes (>=2 niqqud-capable chars) left undotted: ${JSON.stringify(report.violations.slice(0, 5))}`);

        // script/style content must stay untouched
        const scriptMarks = await page.evaluate(() =>
            [...document.querySelectorAll('script,style')].some(el =>
                /[\u05B0-\u05BC\u05C1\u05C2]/.test(el.textContent)));
        assert.equal(scriptMarks, false, 'script/style content must never be diacritized');
    });

    test('final HTML snapshot is saved for inspection', async () => {
        const html = await page.content();
        const out = process.env.E2E_SNAPSHOT_PATH || join(tmpdir(), 'nekudot-e2e-result.html');
        await writeFile(out, html);
        console.log(`# dotted page saved to ${out}`);
        assert.ok(/[\u05B0-\u05BC\u05C1\u05C2]/.test(html));
    });
});
