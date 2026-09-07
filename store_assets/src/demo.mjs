// Record the ~15s product demo (MP4 + looping GIF) of whole-page nikud on the
// Hebrew Wikipedia "עברית" article. Drives the built extension in real Chrome
// via puppeteer (same rig as capture.mjs), captures a fixed-cadence screenshot
// loop (CDP screencast is unreliable in headless), then encodes with ffmpeg.
//
// Prereqs: `npm run build` first (loads dist/); ffmpeg on PATH; run from the
// repo so puppeteer/sharp resolve. Fix REPO/OUT/FRAMES below, then:
//   node store_assets/src/demo.mjs
import {readFile, writeFile, mkdtemp, cp, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer';

const REPO = '/Users/giladamar/PycharmProjects/Nekudot';
const OUT = join(REPO, 'store_assets');          // demo.mp4 + demo.gif land here
const FRAMES = join(tmpdir(), 'nekudot-demo-frames');
const MARKS = '\\u05B0-\\u05BC\\u05C1\\u05C2';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await rm(FRAMES, {recursive: true, force: true});
await mkdir(FRAMES, {recursive: true});

// extension copy with host permissions so automation can inject (activeTab
// alone needs a real user gesture puppeteer can't produce)
const extDir = await mkdtemp(join(tmpdir(), 'nekudot-demo-'));
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

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36');
await page.setViewport({width: 1280, height: 800, deviceScaleFactor: 1}); // dpr1: light frames/gif
await page.goto('https://he.wikipedia.org/wiki/%D7%A2%D7%91%D7%A8%D7%99%D7%AA',
    {waitUntil: 'networkidle2', timeout: 60000});
await page.evaluate(() => {
    const kill = ['[id*="cookie" i]', '[class*="consent" i]', '.mw-banner-container',
        '#siteNotice', '[class*="sticky-ad" i]'];
    for (const s of kill) document.querySelectorAll(s).forEach(e => e.remove());
    const st = document.createElement('style');
    st.textContent = '*{animation:none!important;transition:none!important}';
    document.head.appendChild(st);
    window.scrollTo(0, 0);
});
await sleep(1200);

const markCount = () => page.evaluate((MARKS) =>
    (document.body.innerText.match(new RegExp(`[${MARKS}]`, 'g')) || []).length, MARKS);
const invoke = async (file) => {
    const target = decodeURIComponent(page.url());
    await sw.evaluate(async (target, file) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => decodeURIComponent(t.url || '') === target);
        await chrome.scripting.executeScript({target: {tabId: tab.id, allFrames: true}, files: [file]});
    }, target, file);
};

let i = 0;
const stamps = [];
async function grab() {
    const name = 'f' + String(i++).padStart(4, '0') + '.jpg';
    await page.screenshot({path: join(FRAMES, name), type: 'jpeg', quality: 88, optimizeForSpeed: true}).catch(() => {});
    stamps.push(Date.now());
}
async function grabFor(ms, gap = 45) {
    const t = Date.now();
    while (Date.now() - t < ms) { await grab(); await sleep(gap); }
}

await grabFor(1200);              // hold "before"
await invoke('content_page.js');  // whole-page nikud
let last = 0, stable = 0;
const start = Date.now();
while (Date.now() - start < 14000) {
    await grab();
    const n = await markCount().catch(() => last);
    stable = (n === last && n > 0) ? stable + 1 : 0;
    last = n;
    if (stable >= 8 && n >= 15000 && Date.now() - start > 8000) break; // genuinely done streaming
    await sleep(45);
}
console.log('demo marks:', last);
await grabFor(1600);              // hold "after"
await browser.close();

// concat file with the real per-frame wall-clock durations, so ffmpeg -vf fps
// resamples to a constant rate while preserving real-time pacing
const dur = (stamps[stamps.length - 1] - stamps[0]) / 1000;
let lines = '';
for (let k = 0; k < stamps.length; k++) {
    const d = k < stamps.length - 1 ? (stamps[k + 1] - stamps[k]) / 1000 : 0.1;
    lines += `file 'f${String(k).padStart(4, '0')}.jpg'\nduration ${Math.max(0.02, d).toFixed(3)}\n`;
}
lines += `file 'f${String(stamps.length - 1).padStart(4, '0')}.jpg'\n`;
await writeFile(join(FRAMES, 'concat.txt'), lines);
console.log(`captured ${stamps.length} frames over ${dur.toFixed(1)}s`);

// --- encode (ffmpeg) ---
const ff = (args) => execFileSync('ffmpeg', args, {cwd: FRAMES, stdio: 'ignore'});
ff(['-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
    '-vf', 'fps=30,scale=1280:800:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'veryslow', '-movflags', '+faststart',
    join(OUT, 'demo.mp4')]);
ff(['-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
    '-vf', 'fps=12,scale=760:-1:flags=lanczos,palettegen=stats_mode=diff', join(FRAMES, 'pal.png')]);
ff(['-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-i', join(FRAMES, 'pal.png'),
    '-lavfi', "fps=12,scale=760:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3",
    join(OUT, 'demo.gif')]);
console.log('wrote', join(OUT, 'demo.mp4'), 'and', join(OUT, 'demo.gif'));
