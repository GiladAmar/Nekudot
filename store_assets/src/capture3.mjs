// Recapture the ynet main-headline close-up with generous padding.
import {readFile, writeFile, mkdtemp, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from 'puppeteer';

const REPO = '/Users/giladamar/PycharmProjects/Nekudot/.claude/worktrees/fix-large-selection-crash';
const OUT = '/private/tmp/claude-501/-Users-giladamar-PycharmProjects-Nekudot--claude-worktrees-fix-large-selection-crash/6f710472-beda-4d41-987b-fd3d79db7149/scratchpad/raw';

const extDir = await mkdtemp(join(tmpdir(), 'nekudot-shots3-'));
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
const MARKS = '\\u05B0-\\u05BC\\u05C1\\u05C2';

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36');
await page.setViewport({width: 1440, height: 900, deviceScaleFactor: 3});
await page.goto('https://www.ynet.co.il/home/0,7340,L-8,00.html',
    {waitUntil: 'networkidle2', timeout: 90000}).catch(() => {});
await new Promise(r => setTimeout(r, 1500));

const sel = await page.evaluate(() => {
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
    // give the marks room: extra line-height so clip padding shows them fully
    best.style.padding = '18px 8px';
    return '#' + best.id;
});
console.log('selector:', sel);

async function elemShot(name) {
    const el = await page.$(sel);
    const box = await el.boundingBox();
    await page.screenshot({path: join(OUT, name), type: 'png',
        clip: {x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4),
               width: box.width + 8, height: box.height + 8}});
    console.log('saved', name);
}

await elemShot('ynet-h-before.png');
await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
});
const target = decodeURIComponent(page.url());
await sw.evaluate(async (target) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(t => decodeURIComponent(t.url || '') === target);
    await chrome.scripting.executeScript({
        target: {tabId: tab.id, allFrames: true}, files: ['content.js'],
    });
}, target);
let last = 0, stable = 0;
const deadline = Date.now() + 150000;
while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    const n = await page.evaluate((MARKS) =>
        (document.body.innerText.match(new RegExp(`[${MARKS}]`, 'g')) || []).length, MARKS);
    stable = (n === last && n > 0) ? stable + 1 : 0;
    last = n;
    if (stable >= 5) break;
}
console.log('marks:', last);
await page.evaluate(() => window.getSelection().removeAllRanges());
await new Promise(r => setTimeout(r, 300));
await elemShot('ynet-h-after.png');
await browser.close();
console.log('done');
