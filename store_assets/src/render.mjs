// Generic HTML -> PNG renderer. Usage:
//   node render.mjs <html-file> <out.png> <width> <height> [dpr] [selector]
// With a selector, screenshots just that element; otherwise the viewport.
import puppeteer from 'puppeteer';

const [html, out, w, h, dpr = '2', selector] = process.argv.slice(2);
const browser = await puppeteer.launch({headless: true, args: ['--font-render-hinting=none']});
const page = await browser.newPage();
await page.setViewport({width: +w, height: +h, deviceScaleFactor: +dpr});
await page.goto('file://' + html, {waitUntil: 'networkidle0', timeout: 60000});
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 500));
if (selector) {
    const el = await page.$(selector);
    await el.screenshot({path: out, type: 'png'});
} else {
    await page.screenshot({path: out, type: 'png'});
}
await browser.close();
console.log('rendered', out);
