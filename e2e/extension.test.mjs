// Full end-to-end test: launches real Chrome with the built extension,
// opens locally served snapshots of real news homepages, simulates Ctrl+A,
// invokes the extension exactly like the toolbar click does, then inspects
// the FINAL page HTML: every Hebrew-bearing element type must have received
// niqqud. Reports the active tfjs backend and end-to-end timing.
//
// Prereqs: `npm run build` (dist/) and `npm run fixtures` (page snapshots).
// Run with: npm run test:e2e
import {test, describe, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join, dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer';
import {FIXTURES as ALL_FIXTURES} from '../scripts/fixtures_list.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(repoRoot, 'dist');
const FIXTURES = ALL_FIXTURES.map(f => f.name)
    .filter(f => existsSync(join(repoRoot, 'tests', 'fixtures', f)));

const MARKS = '\\u05B0-\\u05BC\\u05C1\\u05C2';

const missing = FIXTURES.length === 0 ? 'fixtures missing — run `npm run fixtures`'
    : !existsSync(join(DIST, 'manifest.json')) ? 'dist missing — run `npm run build`'
    : false;

describe('extension end-to-end in Chrome', {skip: missing}, () => {
    let browser, server, sw, origin;

    // -- shared Chrome-driving helpers -------------------------------------

    async function openFixture(fixture) {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', req =>
            req.url().startsWith(origin) ? req.continue() : req.abort());
        await page.goto(`${origin}/${fixture}`, {waitUntil: 'domcontentloaded', timeout: 30000});
        return page;
    }

    const selectAll = (page) => page.evaluate(() => {
        const range = document.createRange();
        range.selectNodeContents(document.body);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    });

    // exactly what chrome.action.onClicked -> invoke() does
    const invokeOn = (page) => sw.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({url});
        await chrome.scripting.executeScript({
            target: {tabId: tab.id, allFrames: true},
            files: ['content.js'],
        });
    }, page.url());

    const markCount = (page) => page.evaluate((MARKS) =>
        (document.body.innerText.match(new RegExp(`[${MARKS}]`, 'g')) || []).length, MARKS);

    // Results stream in; wait until the mark count is stable for 2s.
    async function waitForStable(page, baseline, t0) {
        let last = baseline, stable = 0, first = 0;
        const deadline = Date.now() + 180000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 500));
            const n = await markCount(page);
            if (n > baseline && first === 0) first = performance.now() - t0;
            stable = (n === last && n > baseline) ? stable + 1 : 0;
            last = n;
            if (stable >= 4) break;
        }
        // totalMs excludes the 2s stability confirmation window
        return {count: last, firstMs: first, totalMs: performance.now() - t0 - 2000};
    }

    // -----------------------------------------------------------------------

    before(async () => {
        // Serve fixtures by name; block everything else so the snapshots'
        // external references don't hit the network.
        server = createServer(async (req, res) => {
            const name = basename(new URL(req.url, 'http://x/').pathname);
            if (!FIXTURES.includes(name)) {
                res.statusCode = 404;
                return res.end('not found');
            }
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(await readFile(join(repoRoot, 'tests', 'fixtures', name)));
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
    });

    after(async () => {
        if (browser) await browser.close();
        if (server) server.close();
    });

    test('service worker initializes the wasm backend and loads the model', async () => {
        const ready = await sw.evaluate(() => globalThis.__nekudotEnsureModel());
        assert.equal(ready, true, 'model must load and warm up');
        const backend = await sw.evaluate(() => globalThis.__nekudotBackend);
        console.log(`# backend in real Chrome service worker: ${backend}`);
        assert.equal(backend, 'wasm',
            'wasm must initialize in the MV3 service worker (regression: Worker is not defined)');
    });

    for (const fixture of FIXTURES) {
        test(`Ctrl+A + invoke diacritizes every Hebrew element type: ${fixture}`, async () => {
            const page = await openFixture(fixture);
            await selectAll(page);
            const baseline = await markCount(page);

            const t0 = performance.now();
            await invokeOn(page);
            const {count, firstMs, totalMs} = await waitForStable(page, baseline, t0);
            assert.ok(count > baseline, 'no niqqud appeared within the deadline');
            console.log(`# ${fixture}: first marks after ${(firstMs / 1000).toFixed(1)}s, ` +
                `${count - baseline} marks added after ~${(totalMs / 1000).toFixed(1)}s`);

            // Inspect the final HTML: group Hebrew text nodes by element type.
            const report = await page.evaluate((MARKS) => {
                const CAN_NIQQUD = /[אבגדהוזחטיכלמנסעפצקרשתךן]/g;
                const MARK = new RegExp(`[${MARKS}]`);
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
            }, MARKS);

            const tags = Object.entries(report.perTag)
                .sort((a, b) => b[1].nodes - a[1].nodes);
            for (const [tag, s] of tags)
                console.log(`# ${fixture} <${tag}>: ${s.dotted}/${s.nodes} nodes dotted (${s.capableChars} capable chars)`);

            assert.deepEqual(report.violations, [],
                `Hebrew text nodes (>=2 niqqud-capable chars) left undotted: ${JSON.stringify(report.violations.slice(0, 5))}`);

            // script/style content must stay untouched
            const scriptMarks = await page.evaluate((MARKS) =>
                [...document.querySelectorAll('script,style')].some(el =>
                    new RegExp(`[${MARKS}]`).test(el.textContent)), MARKS);
            assert.equal(scriptMarks, false, 'script/style content must never be diacritized');

            // Save the dotted page for inspection.
            const out = join(process.env.E2E_SNAPSHOT_DIR || tmpdir(), `nekudot-e2e-${fixture}`);
            await writeFile(out, await page.content());
            console.log(`# dotted page saved to ${out}`);
            await page.close();
        });
    }

    test('infinite-scroll re-run: only newly loaded content is processed', async () => {
        const fixture = FIXTURES.includes('hebrewnews-home.html') ? 'hebrewnews-home.html' : FIXTURES[0];
        const page = await openFixture(fixture);

        // First full run.
        await selectAll(page);
        const t0 = performance.now();
        await invokeOn(page);
        const first = await waitForStable(page, 0, t0);
        assert.ok(first.count > 0);

        // Re-run with nothing new: everything is already dotted, so the
        // mark count must not change.
        await selectAll(page);
        await invokeOn(page);
        await new Promise(r => setTimeout(r, 4000));
        const afterRerun = await markCount(page);
        assert.equal(afterRerun, first.count,
            're-running on an already-dotted page must not re-process anything');

        // Simulate content loaded by scrolling, then Ctrl+A again.
        await page.evaluate(() => {
            const div = document.createElement('div');
            div.id = 'scrolled-in';
            div.textContent = 'תוכן חדש שנטען בגלילה: הממשלה אישרה היום תוכנית חדשה ' +
                'לשיפור התחבורה הציבורית בערים הגדולות ברחבי הארץ';
            document.body.appendChild(div);
        });
        await selectAll(page);
        const t1 = performance.now();
        await invokeOn(page);
        const incremental = await waitForStable(page, afterRerun, t1);

        const newDivMarks = await page.evaluate((MARKS) =>
            (document.getElementById('scrolled-in').textContent
                .match(new RegExp(`[${MARKS}]`, 'g')) || []).length, MARKS);
        assert.ok(newDivMarks > 10, 'the scrolled-in content must receive niqqud');
        assert.equal(incremental.count - first.count, newDivMarks,
            'a re-run must add marks only inside the newly loaded content');
        assert.ok(incremental.totalMs < first.totalMs / 2,
            `incremental run (${incremental.totalMs.toFixed(0)}ms) should be far faster ` +
            `than the full run (${first.totalMs.toFixed(0)}ms)`);
        console.log(`# incremental re-run: full page ${(first.totalMs / 1000).toFixed(1)}s, ` +
            `new-content-only ${(incremental.totalMs / 1000).toFixed(1)}s (+${newDivMarks} marks)`);
        await page.close();
    });

    test('whole-page menu ignores a surviving selection', async () => {
        // Regression: the "Add nikud to the whole page" menu item used to
        // route through the selection probe, so any leftover selection
        // silently narrowed the scope to just that selection.
        const fixture = FIXTURES.includes('hebrewnews-home.html') ? 'hebrewnews-home.html' : FIXTURES[0];
        const page = await openFixture(fixture);

        // Leave a small selection active, then invoke the whole-page entry
        // exactly like the menu handler does.
        await page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode()) && !/[א-ת]{4}/.test(node.textContent));
            const range = document.createRange();
            range.selectNodeContents(node);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        const t0 = performance.now();
        await sw.evaluate(async (url) => {
            const [tab] = await chrome.tabs.query({url});
            await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                files: ['content_page.js'],
            });
        }, page.url());
        const {count} = await waitForStable(page, 0, t0);
        assert.ok(count > 500,
            `whole-page mode must dot far more than the selection (got ${count} marks)`);
        await page.close();
    });

    test('partially-dotted node: the rest of the node can still be dotted', async () => {
        // Regression for the registry-skip bug: dotting one sentence of a
        // node must not block dotting the rest of that same node later.
        const fixture = FIXTURES[0];
        const page = await openFixture(fixture);
        const nodeText = 'משפט ראשון לגמרי רגיל. משפט שני נפרד לחלוטין.';
        await page.evaluate((nodeText) => {
            const div = document.createElement('div');
            div.id = 'two-sentences';
            div.textContent = nodeText;
            document.body.appendChild(div);
        }, nodeText);

        const firstLen = 'משפט ראשון לגמרי רגיל.'.length;
        const selectPart = (from, to) => page.evaluate(({from, to}) => {
            const textNode = document.getElementById('two-sentences').firstChild;
            const range = document.createRange();
            range.setStart(textNode, from);
            range.setEnd(textNode, to);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }, {from, to});
        const divMarks = () => page.evaluate((MARKS) =>
            (document.getElementById('two-sentences').textContent
                .match(new RegExp(`[${MARKS}]`, 'g')) || []).length, MARKS);

        // Dot only the first sentence, polling the div directly.
        await selectPart(0, firstLen);
        await invokeOn(page);
        let deadline = Date.now() + 60000;
        while (Date.now() < deadline && (await divMarks()) === 0)
            await new Promise(r => setTimeout(r, 300));
        const afterFirstSentence = await divMarks();
        assert.ok(afterFirstSentence > 0, 'first sentence must get niqqud');

        // Now select the second (still undotted) sentence of the SAME node.
        const div = await page.evaluate(() =>
            document.getElementById('two-sentences').textContent);
        const secondStart = div.indexOf('משפט שני');
        assert.ok(secondStart > 0);
        await selectPart(secondStart, div.length);
        await invokeOn(page);
        deadline = Date.now() + 60000;
        while (Date.now() < deadline && (await divMarks()) <= afterFirstSentence)
            await new Promise(r => setTimeout(r, 300));
        const afterSecondSentence = await divMarks();
        assert.ok(afterSecondSentence > afterFirstSentence,
            'the undotted rest of a partially-dotted node must still be processed');
        await page.close();
    });
});
