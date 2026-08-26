// Capture real before/after screenshots of the Nekudot extension running on
// live webpages. Run from the repo worktree so puppeteer resolves.
import {readFile, writeFile, mkdtemp, cp, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from 'puppeteer';

const REPO = '/Users/giladamar/PycharmProjects/Nekudot/.claude/worktrees/fix-large-selection-crash';
const OUT = '/private/tmp/claude-501/-Users-giladamar-PycharmProjects-Nekudot--claude-worktrees-fix-large-selection-crash/6f710472-beda-4d41-987b-fd3d79db7149/scratchpad/raw';
await mkdir(OUT, {recursive: true});

const MARKS = '\\u05B0-\\u05BC\\u05C1\\u05C2';

// --- extension copy with host permissions so automation can inject ---------
const extDir = await mkdtemp(join(tmpdir(), 'nekudot-shots-'));
await cp(join(REPO, 'dist'), extDir, {recursive: true});
const manifest = JSON.parse(await readFile(join(extDir, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
await writeFile(join(extDir, 'manifest.json'), JSON.stringify(manifest));

const browser = await puppeteer.launch({
    headless: true,
    args: [
        `--disable-extensions-except=${extDir}`,
        `--load-extension=${extDir}`,
        '--lang=he',
        '--font-render-hinting=none',
    ],
});
const swTarget = await browser.waitForTarget(
    t => t.type() === 'service_worker' && t.url().includes('background.js'),
    {timeout: 30000});
const sw = await swTarget.worker();
const extId = new URL(swTarget.url()).host;
console.log('extension id:', extId);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

async function newPage(w = 1280, h = 800, dpr = 2) {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({width: w, height: h, deviceScaleFactor: dpr});
    return page;
}

const selectAll = (page) => page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
});

const clearSelection = (page) => page.evaluate(() => window.getSelection().removeAllRanges());

const invokeOn = async (page, file = 'content.js') => {
    const target = decodeURIComponent(page.url());
    await sw.evaluate(async (target, file) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => decodeURIComponent(t.url || '') === target);
        if (!tab) throw new Error('tab not found: ' + target);
        await chrome.scripting.executeScript({
            target: {tabId: tab.id, allFrames: true},
            files: [file],
        });
    }, target, file);
};

const markCount = (page) => page.evaluate((MARKS) =>
    (document.body.innerText.match(new RegExp(`[${MARKS}]`, 'g')) || []).length, MARKS);

async function waitForStable(page, baseline, timeoutMs = 150000) {
    let last = baseline, stable = 0;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500));
        const n = await markCount(page).catch(() => last);
        stable = (n === last && n > baseline) ? stable + 1 : 0;
        last = n;
        if (stable >= 5) break;
    }
    return last;
}

// remove floating junk that would spoil a screenshot
const cleanPage = (page) => page.evaluate(() => {
    const kill = [
        '[id*="cookie" i]', '[class*="cookie" i]', '[id*="consent" i]',
        '[class*="consent" i]', '[id*="popup" i]', '[class*="sticky-ad" i]',
        '[id*="taboola" i]', '[class*="taboola" i]', 'iframe[src*="ads"]',
        '[aria-label*="advert" i]',
    ];
    for (const sel of kill) document.querySelectorAll(sel).forEach(el => el.remove());
    // freeze animations for identical before/after framing
    const style = document.createElement('style');
    style.textContent = '*{animation:none!important;transition:none!important}';
    document.head.appendChild(style);
});

async function shoot(page, name) {
    await page.screenshot({path: join(OUT, name), type: 'png'});
    console.log('saved', name);
}

// ---------------------------------------------------------------------------
// 1. Hebrew Wikipedia article — clean typography, great before/after
// ---------------------------------------------------------------------------
try {
    const page = await newPage();
    await page.goto('https://he.wikipedia.org/wiki/%D7%A2%D7%91%D7%A8%D7%99%D7%AA',
        {waitUntil: 'networkidle2', timeout: 60000});
    await cleanPage(page);
    // hide wikipedia banners
    await page.evaluate(() => {
        document.querySelectorAll('.mw-banner-container, #siteNotice, .vector-header-container .mw-ui-button').forEach(e => e.remove());
    });
    await new Promise(r => setTimeout(r, 1000));
    await shoot(page, 'wiki-before.png');
    await selectAll(page);
    await invokeOn(page);
    const n = await waitForStable(page, await markCount(page).catch(() => 0) * 0);
    console.log('wiki marks:', n);
    await clearSelection(page);
    await new Promise(r => setTimeout(r, 300));
    await shoot(page, 'wiki-after.png');
    await page.close();
} catch (e) { console.error('wiki failed:', e.message); }

// ---------------------------------------------------------------------------
// 2. ynet homepage — recognizable real news site
// ---------------------------------------------------------------------------
try {
    const page = await newPage();
    await page.goto('https://www.ynet.co.il/home/0,7340,L-8,00.html',
        {waitUntil: 'networkidle2', timeout: 90000}).catch(() => {});
    await cleanPage(page);
    await new Promise(r => setTimeout(r, 2000));
    await shoot(page, 'ynet-before.png');
    await selectAll(page);
    await invokeOn(page);
    const n = await waitForStable(page, 0);
    console.log('ynet marks:', n);
    await clearSelection(page);
    await new Promise(r => setTimeout(r, 300));
    await shoot(page, 'ynet-after.png');
    await page.close();
} catch (e) { console.error('ynet failed:', e.message); }

// ---------------------------------------------------------------------------
// 3. Paste page — before and after
// ---------------------------------------------------------------------------
try {
    const page = await newPage(1100, 720, 2);
    await page.goto(`chrome-extension://${extId}/paste.html`, {waitUntil: 'load'});
    await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'light'}]);
    const sample = 'החתול הקטן ישב על החלון והביט בגשם. הוא חלם על יום שמש חדש, על ציפורים בשמיים ועל חלב חם בצלחת.';
    await page.evaluate((t) => {
        const input = document.getElementById('input');
        input.value = t;
        input.dispatchEvent(new Event('input', {bubbles: true}));
    }, sample);
    await shoot(page, 'paste-before.png');
    await page.click('#run');
    await page.waitForFunction(() => {
        const out = document.getElementById('output');
        return out && /[ְ-ּ]/.test(out.value);
    }, {timeout: 120000});
    await new Promise(r => setTimeout(r, 3000)); // let it finish fully
    await shoot(page, 'paste-after.png');
    await page.close();
} catch (e) { console.error('paste failed:', e.message); }

await browser.close();
console.log('done');
