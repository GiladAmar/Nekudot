import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(repoRoot, 'manifest.json'), 'utf8'));

describe('manifest', () => {
    test('is manifest v3 with a service worker', () => {
        assert.equal(manifest.manifest_version, 3);
        assert.equal(manifest.background.service_worker, 'background.js');
    });

    test('content script is injected on demand only, not on every page', () => {
        assert.equal(manifest.content_scripts, undefined,
            'always-on content_scripts waste memory on every tab and run against an empty selection');
    });

    test('model files are not web-accessible (fingerprinting surface)', () => {
        assert.equal(manifest.web_accessible_resources, undefined,
            'only the extension itself fetches model/*; exposing it lets sites detect the extension');
    });

    test('permissions stay minimal', () => {
        assert.deepEqual([...manifest.permissions].sort(),
            ['activeTab', 'scripting']);
    });

    test('CSP allows WebAssembly for the wasm backend', () => {
        assert.match(manifest.content_security_policy.extension_pages,
            /'wasm-unsafe-eval'/);
    });
});
