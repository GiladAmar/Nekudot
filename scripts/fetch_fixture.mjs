// Download the real-page test fixtures (full homepage snapshots).
// Fixtures are gitignored — they are third-party content and change daily —
// so tests that use them skip cleanly when they are absent.
// Usage: npm run fixtures
import {writeFile, mkdir} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const FIXTURES = [
    {name: 'ynet-home.html', url: 'https://www.ynet.co.il/home/0,7340,L-8,00.html'},
    {name: 'hebrewnews-home.html', url: 'https://www.hebrewnews.com/'},
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
await mkdir(dir, {recursive: true});

for (const {name, url} of FIXTURES) {
    try {
        const res = await fetch(url, {headers: {'user-agent': UA}});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const path = join(dir, name);
        await writeFile(path, html);
        console.log(`fetched ${url} -> ${path} (${html.length} chars)`);
    } catch (e) {
        // Best-effort: CI runners may be blocked; dependent tests will skip.
        console.warn(`could not fetch ${url}: ${e.message}`);
    }
}
