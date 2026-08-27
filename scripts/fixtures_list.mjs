// Real-page test fixtures: full homepage snapshots of Hebrew news sites.
// Shared by scripts/fetch_fixture.mjs, tests/real_page.test.mjs and
// e2e/extension.test.mjs. Adding a site here is all that is needed —
// every test layer picks it up automatically.
export const FIXTURES = [
    {name: 'ynet-home.html', url: 'https://www.ynet.co.il/home/0,7340,L-8,00.html'},
    {name: 'hebrewnews-home.html', url: 'https://www.hebrewnews.com/'},
    {name: 'zman-home.html', url: 'https://www.zman.co.il/'},
    {name: 'haaretz-home.html', url: 'https://www.haaretz.co.il/'},
];
