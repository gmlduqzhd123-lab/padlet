// Developer-only smoke test of the deployed static app. Fictional local data only.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const {
  chromium,
} = require("C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const fflate = require("../assets/vendor/fflate-0.8.2.js");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(20000);
    const errors = [],
      failed = [],
      requests = [],
      results = [];
    const pass = (name) => {
      results.push({ name, status: "PASS" });
      console.log("PASS", name);
    };
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("requestfailed", (r) => failed.push(r.url()));
    page.on("request", (r) => requests.push(r.url()));
    const response = await page.goto(
      "https://gmlduqzhd123-lab.github.io/padlet/",
    );
    assert.equal(response.status(), 200);
    assert.equal(await page.title(), "엽쌤의 패들렛 정리함");
    await page.waitForFunction(
      () => !document.getElementById("dataFile").disabled,
    );
    assert.equal(
      await page.locator("#diagnose").textContent(),
      "주소 확인 · 연결 안내",
    );
    pass("live Pages HTTP 200, new version and Worker ready");
    const initialRequests = requests.length;
    await page
      .locator("#boardUrl")
      .fill("https://padlet.com/demo/board-abcdefghijklmnop");
    await page.locator("#diagnose").click();
    assert.match(
      await page.locator("#diagnosis").textContent(),
      /API 연결 검사 안 함/,
    );
    assert.equal(
      await page.locator("#apiConnection").evaluate((n) => n.open),
      true,
    );
    await page.locator("#apiBoard").click();
    await page.locator("#collectApi").click();
    assert.equal(requests.length, initialRequests);
    pass("live no-key guidance and zero remote data requests");
    for (const name of ["가상100.csv", "가상100.xlsx"]) {
      await page
        .locator("#dataFile")
        .setInputFiles(path.join(__dirname, "fixtures", name));
      await page.waitForFunction(
        () => !document.getElementById("importButton").disabled,
      );
      await page
        .locator("#attachments")
        .setInputFiles(path.join(__dirname, "fixtures", "가상첨부.zip"));
      await page.locator("#importButton").click();
      await page.waitForFunction(() =>
        document.getElementById("stats").textContent.includes("가져옴 100"),
      );
      assert.equal(await page.locator(".post").count(), 100);
      assert.match(
        await page.locator("#original").textContent(),
        /숫자 123 유지/,
      );
      assert.match(await page.locator("#stats").textContent(), /미확보 2/);
      pass("live fictional " + name + " import with attachment/missing ledger");
    }
    await page.locator("#confirmSave").check();
    const pendingDownload = page.waitForEvent("download");
    await page.locator("#saveZip").click();
    const output = path.resolve(__dirname, "../test-results");
    fs.mkdirSync(output, { recursive: true });
    const zipPath = path.join(output, "pages-result.zip");
    await (await pendingDownload).saveAs(zipPath);
    const zip = fflate.unzipSync(fs.readFileSync(zipPath));
    assert(zip["01_원문/원문데이터.json"]);
    assert(zip["02_줄글정리/글_읽기.html"]);
    assert.match(
      await page.locator("#saveResult").textContent(),
      /다운로드 시작/,
    );
    assert.equal(requests.length, initialRequests);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    pass(
      "live ZIP downloaded and independently decompressed; no disk-saved claim, page errors or data requests",
    );
    await page.screenshot({
      path: path.join(output, "pages-desktop.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(output, "pages-results.json"),
      JSON.stringify(
        {
          date: "2026-10-09",
          url: page.url(),
          browser: await browser.version(),
          results,
          pageErrors: errors,
          failedRequests: failed,
          realPadletApi: "NOT_RUN",
          realFolderPicker: "NOT_RUN",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
