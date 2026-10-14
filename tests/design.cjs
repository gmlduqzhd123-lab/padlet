// Developer-only visual and navigation checks; fictional fixtures, no live API.
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const { chromium } = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/repo\//, '');
  const file = path.resolve(root, name || 'index.html');
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
  fs.readFile(file, (error, bytes) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(bytes);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless:true, channel:'chrome' });
  const checks = [];
  try {
    const page = await browser.newPage({ viewport:{width:1440, height:1050} });
    const base = process.env.PADLET_DESIGN_URL || `http://127.0.0.1:${server.address().port}/repo/index.html`;
    const origin = new URL(base).origin;
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).origin !== origin) external.push(request.url()); });
    await page.goto(base);
    await page.waitForFunction(() => !document.getElementById('dataFile').disabled);
    fs.mkdirSync(path.join(root,'test-results'), {recursive:true});
    await page.screenshot({path:path.join(root,'test-results/archive-home.png')});
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, '#collect');
    checks.push('keyboard skip link');
    await page.locator('#installApp').click();
    assert(await page.locator('#installDialog').isVisible());
    await page.locator('#installDialog .install-close').click();
    await page.locator('#qrApp').click();
    assert(await page.locator('#qrDialog').isVisible());
    await page.locator('#qrDialog .install-close').click();
    checks.push('existing install guidance and QR dialogs preserved');
    await page.locator('.route-links a[href="#import"]').click();
    assert.equal(new URL(page.url()).hash, '#import');
    await page.locator('#dataFile').setInputFiles(path.join(__dirname,'fixtures/가상100.csv'));
    await page.locator('#attachments').setInputFiles(path.join(__dirname,'fixtures/가상첨부.zip'));
    await page.locator('#importButton').click();
    await page.waitForFunction(() => document.querySelectorAll('.post').length === 100);
    await page.locator('.nav-item[href="#materials"]').click();
    await page.locator('#search').fill('가상 게시물 1');
    await page.locator('.post button').nth(1).click();
    assert.equal(await page.locator('.post.active').count(), 1);
    checks.push('file route, fictional import, filter and active record');
    await page.locator('#materials').screenshot({path:path.join(root,'test-results/archive-materials.png')});
    await page.locator('.nav-item[href="#save"]').click();
    await page.waitForFunction(() => document.querySelector('.nav-item[aria-current="step"]').hash === '#save');
    assert.match(await page.locator('#saveResult').textContent(), /실제 저장 확인 0개/);
    checks.push('save navigation and accurate unsaved state');
    for (const width of [390, 768, 1024]) {
      await page.setViewportSize({width, height:844});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('.nav-item[href="#collect"]').click();
      assert.equal(new URL(page.url()).hash, '#collect');
      checks.push(`navigation and no horizontal overflow at ${width}px`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => scrollTo(0,0));
    await page.screenshot({path:path.join(root,'test-results/archive-mobile.png')});
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    checks.push('zero page errors and zero external requests');
    fs.writeFileSync(path.join(root,`test-results/${process.env.PADLET_DESIGN_URL ? 'design-pages-results' : 'design-results'}.json`), JSON.stringify({date:'2026-10-15', url:base, status:'PASS', browser:await browser.version(), input:'fictional CSV and ZIP', checks},null,2));
    for (const check of checks) console.log('PASS '+check);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode=1; });
