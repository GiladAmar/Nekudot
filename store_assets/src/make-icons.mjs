// Render the final icon at 512px, then downscale to all extension sizes.
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';

const SCRATCH = '/private/tmp/claude-501/-Users-giladamar-PycharmProjects-Nekudot--claude-worktrees-fix-large-selection-crash/6f710472-beda-4d41-987b-fd3d79db7149/scratchpad';
const OUT = SCRATCH + '/final/icons';
await mkdir(OUT, {recursive: true});

const browser = await puppeteer.launch({headless: true, args: ['--font-render-hinting=none']});
const page = await browser.newPage();
await page.setViewport({width: 600, height: 600, deviceScaleFactor: 1});
await page.goto('file://' + SCRATCH + '/icon-final.html', {waitUntil: 'networkidle0'});
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 400));
const el = await page.$('#icon svg');
const png512 = await el.screenshot({type: 'png', omitBackground: true});
await browser.close();

await sharp(png512).png().toFile(OUT + '/aleph_512.png');
for (const s of [128, 48, 32, 16]) {
    await sharp(png512).resize(s, s, {kernel: 'lanczos3'}).png().toFile(`${OUT}/aleph_${s}.png`);
    console.log('wrote', `aleph_${s}.png`);
}
// contact sheet to inspect: 128 + smalls on light and dark
const sizes = [128, 48, 32, 16];
const pad = 20;
const totalW = sizes.reduce((a, s) => a + s + pad, pad);
const maxH = 128 + pad * 2;
for (const [name, bg] of [['sheet-light', {r:255,g:255,b:255}], ['sheet-dark', {r:32,g:33,b:36}]]) {
    let x = pad;
    const comps = [];
    for (const s of sizes) {
        comps.push({input: await sharp(png512).resize(s, s, {kernel: 'lanczos3'}).png().toBuffer(),
                    left: x, top: Math.round((maxH - s) / 2)});
        x += s + pad;
    }
    await sharp({create: {width: totalW, height: maxH, channels: 3, background: bg}})
        .composite(comps).png().toFile(`${OUT}/${name}.png`);
}
console.log('done');
