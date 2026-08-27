// Download the real-page test fixtures (full homepage snapshots).
// Fixtures are gitignored — they are third-party content and change daily —
// so tests that use them skip cleanly when they are absent.
// Usage: npm run fixtures
//
// Sites with bot protection reset plain HTTP clients, so when a direct
// fetch fails this falls back to rendering the page in headless Chrome.
import {writeFile, mkdir} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FIXTURES} from './fixtures_list.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
await mkdir(dir, {recursive: true});

let browser = null;
async function fetchViaBrowser(url) {
    const puppeteer = (await import('puppeteer')).default;
    browser ??= await puppeteer.launch({
        headless: true,
        args: process.env.CI ? ['--no-sandbox'] : [],
    });
    const page = await browser.newPage();
    try {
        // headless Chrome's default UA says "HeadlessChrome", which
        // bot protection (e.g. Cloudflare) blocks outright
        await page.setUserAgent(UA);
        await page.goto(url, {waitUntil: 'networkidle2', timeout: 60000});
        return await page.content();
    } finally {
        await page.close();
    }
}

// A Hebrew news homepage has thousands of Hebrew letters; a bot-protection
// interstitial has a handful. Refuse to save what is clearly not the site.
function looksLikeRealPage(html) {
    return (html.match(/[א-ת]/g) || []).length >= 500;
}

for (const {name, url} of FIXTURES) {
    if (!url) continue; // committed fixture, nothing to download
    let html = null;
    try {
        // bot-protection tarpits accept the connection and then stall; without
        // a timeout `npm run fixtures` would hang the whole CI job
        const res = await fetch(url, {
            headers: {'user-agent': UA},
            signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
        if (!looksLikeRealPage(html)) throw new Error('looks like a block page');
    } catch (e) {
        console.warn(`direct fetch of ${url} failed (${e.message}); trying headless Chrome`);
        try {
            html = await fetchViaBrowser(url);
        } catch (e2) {
            // Best-effort: CI runners may be blocked; dependent tests will skip.
            console.warn(`could not fetch ${url}: ${e2.message}`);
            html = null;
        }
    }
    if (html && !looksLikeRealPage(html)) {
        console.warn(`skipping ${url}: response looks like a block page, not the site`);
        html = null;
    }
    if (html) {
        const path = join(dir, name);
        await writeFile(path, html);
        console.log(`fetched ${url} -> ${path} (${html.length} chars)`);
    }
}

if (browser) await browser.close();
