// Close-up element captures: same element before and after nikud, high DPR.
import {readFile, writeFile, mkdtemp, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from 'puppeteer';

const REPO = '/Users/giladamar/PycharmProjects/Nekudot/.claude/worktrees/fix-large-selection-crash';
const OUT = '/private/tmp/claude-501/-Users-giladamar-PycharmProjects-Nekudot--claude-worktrees-fix-large-selection-crash/6f710472-beda-4d41-987b-fd3d79db7149/scratchpad/raw';

const extDir = await mkdtemp(join(tmpdir(), 'nekudot-shots2-'));
await cp(join(REPO, 'dist'), extDir, {recursive: true});
const manifest = JSON.parse(await readFile(join(extDir, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
await writeFile(join(extDir, 'manifest.json'), JSON.stringify(manifest));

const browser = await puppeteer.launch({
    headless: true,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`,
           '--lang=he', '--font-render-hinting=none'],
});
const swTarget = await browser.waitForTarget(
    t => t.type() === 'service_worker' && t.url().includes('background.js'), {timeout: 30000});
const sw = await swTarget.worker();

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const MARKS = '\\u05B0-\\u05BC\\u05C1\\u05C2';

const invokeOn = async (page) => {
    const target = decodeURIComponent(page.url());
    await sw.evaluate(async (target) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => decodeURIComponent(t.url || '') === target);
        await chrome.scripting.executeScript({
            target: {tabId: tab.id, allFrames: true}, files: ['content.js'],
        });
    }, target);
};
const markCount = (page) => page.evaluate((MARKS) =>
    (document.body.innerText.match(new RegExp(`[${MARKS}]`, 'g')) || []).length, MARKS);
async function waitForStable(page, baseline) {
    let last = baseline, stable = 0;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500));
        const n = await markCount(page).catch(() => last);
        stable = (n === last && n > baseline) ? stable + 1 : 0;
        last = n;
        if (stable >= 5) break;
    }
    return last;
}

async function elemShot(page, selector, path, pad = 8) {
    const el = await page.$(selector);
    const box = await el.boundingBox();
    await page.screenshot({
        path, type: 'png',
        clip: {x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
               width: box.width + pad * 2, height: box.height + pad * 2},
    });
    console.log('saved', path);
}

// Wikipedia: first paragraph close-up, before and after.
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({width: 1280, height: 900, deviceScaleFactor: 3});
await page.goto('https://he.wikipedia.org/wiki/%D7%A2%D7%91%D7%A8%D7%99%D7%AA',
    {waitUntil: 'networkidle2', timeout: 60000});
// find the first substantial Hebrew paragraph and tag it
const P = await page.evaluate(() => {
    for (const p of document.querySelectorAll('p')) {
        const heb = (p.textContent.match(/[א-ת]/g) || []).length;
        const r = p.getBoundingClientRect();
        if (heb > 100 && r.width > 300) {
            p.id = p.id || 'nekudot-closeup';
            return '#' + p.id;
        }
    }
    return null;
});
console.log('wiki paragraph selector:', P);
await elemShot(page, P, join(OUT, 'wiki-p-before.png'));

// select all + run
await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
});
await invokeOn(page);
const n = await waitForStable(page, 0);
console.log('marks:', n);
await page.evaluate(() => window.getSelection().removeAllRanges());
await new Promise(r => setTimeout(r, 300));
await elemShot(page, P, join(OUT, 'wiki-p-after.png'));

// Also: capture selection state (text highlighted) for the "select text" step graphic
await page.close();

// ynet main headline close-up before/after
try {
    const p2 = await browser.newPage();
    await p2.setUserAgent(UA);
    await p2.setViewport({width: 1440, height: 900, deviceScaleFactor: 3});
    await p2.goto('https://www.ynet.co.il/home/0,7340,L-8,00.html',
        {waitUntil: 'networkidle2', timeout: 90000}).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    // find the biggest headline element
    const sel = await p2.evaluate(() => {
        const cands = [...document.querySelectorAll('h1, h2, .slotTitle, [class*="MainTitle"], [class*="mainTitle"]')];
        let best = null, bestArea = 0;
        for (const el of cands) {
            const r = el.getBoundingClientRect();
            const heb = (el.textContent.match(/[א-ת]/g) || []).length;
            if (heb > 15 && r.width * r.height > bestArea && r.top > 0 && r.top < 900) {
                best = el; bestArea = r.width * r.height;
            }
        }
        if (!best) return null;
        best.id = best.id || 'nekudot-shot-target';
        return '#' + best.id;
    });
    console.log('ynet headline selector:', sel);
    if (sel) {
        await elemShot(p2, sel, join(OUT, 'ynet-h-before.png'), 14);
        await p2.evaluate(() => {
            const range = document.createRange();
            range.selectNodeContents(document.body);
            const s = window.getSelection();
            s.removeAllRanges();
            s.addRange(range);
        });
        await invokeOn(p2);
        await waitForStable(p2, 0);
        await p2.evaluate(() => window.getSelection().removeAllRanges());
        await new Promise(r => setTimeout(r, 300));
        await elemShot(p2, sel, join(OUT, 'ynet-h-after.png'), 14);
    }
    await p2.close();
} catch (e) { console.error('ynet closeup failed:', e.message); }

await browser.close();
console.log('done');
