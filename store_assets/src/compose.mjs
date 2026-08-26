// Render a shot HTML at 2x and downscale to exact store dimensions,
// flattened to 24-bit PNG (no alpha).
// Usage: node compose.mjs <html> <out.png> [w=1280] [h=800]
import puppeteer from 'puppeteer';
import sharp from 'sharp';

const [html, out, w = '1280', h = '800'] = process.argv.slice(2);
const browser = await puppeteer.launch({headless: true, args: ['--font-render-hinting=none']});
const page = await browser.newPage();
await page.setViewport({width: +w, height: +h, deviceScaleFactor: 2});
await page.goto('file://' + html, {waitUntil: 'networkidle0', timeout: 60000});
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 600));
const buf = await page.screenshot({type: 'png'});
await browser.close();
await sharp(buf)
    .resize(+w, +h, {kernel: 'lanczos3'})
    .flatten({background: '#ffffff'})
    .removeAlpha()
    .png({compressionLevel: 9})
    .toFile(out);
const meta = await sharp(out).metadata();
console.log(out, `${meta.width}x${meta.height}`, 'channels:', meta.channels, 'alpha:', meta.hasAlpha);
