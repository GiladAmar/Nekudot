// Download the real-page test fixture (a full ynet homepage snapshot).
// The fixture is gitignored — it is third-party content and changes daily —
// so tests that use it skip cleanly when it is absent.
// Usage: npm run fixtures
import {writeFile, mkdir} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const URL = 'https://www.ynet.co.il/home/0,7340,L-8,00.html';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
await mkdir(dir, {recursive: true});

try {
    const res = await fetch(URL, {headers: {'user-agent': UA}});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const path = join(dir, 'ynet-home.html');
    await writeFile(path, html);
    console.log(`fetched ${URL} -> ${path} (${html.length} chars)`);
} catch (e) {
    // Best-effort: CI runners may be blocked; dependent tests will skip.
    console.warn(`could not fetch fixture: ${e.message}`);
}
