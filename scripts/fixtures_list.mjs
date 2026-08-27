// Test fixtures — real pages run through the extension's exact pipeline.
// Shared by scripts/fetch_fixture.mjs, tests/real_page.test.mjs and
// e2e/extension.test.mjs, so adding one here reaches every test layer.
//
// regression-page.html is COMMITTED: an authored page reproducing every
// construct that has actually broken this extension (nbsp-glued words, a
// token longer than a model row, maqaf, pre-vocalised text, hidden
// subtrees, form controls, Hebrew inside script payloads). Tests and CI
// depend only on it, so runs are deterministic and need no network.
//
// The live news homepages are OPTIONAL and gitignored — third-party
// content that changes daily. `npm run fixtures` downloads them to check
// against today's real markup; every test skips them when absent.
export const FIXTURES = [
    {name: 'regression-page.html'},
    {name: 'ynet-home.html', url: 'https://www.ynet.co.il/home/0,7340,L-8,00.html'},
    {name: 'hebrewnews-home.html', url: 'https://www.hebrewnews.com/'},
    {name: 'zman-home.html', url: 'https://www.zman.co.il/'},
    {name: 'haaretz-home.html', url: 'https://www.haaretz.co.il/'},
];
