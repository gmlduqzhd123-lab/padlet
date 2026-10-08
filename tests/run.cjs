// Developer-only runner. No app server or build dependency is shipped.
const fs = require("fs"),
  path = require("path"),
  http = require("http"),
  assert = require("assert");
const {
  chromium,
} = require("C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const XLSX = require("../assets/vendor/xlsx-0.20.3.min.js"),
  fflate = require("../assets/vendor/fflate-0.8.2.js");
const root = path.resolve(__dirname, "..");
const fixture = path.join(__dirname, "fixtures");
const headers = [
  "제목",
  "본문",
  "섹션",
  "작성자",
  "작성일",
  "원문 링크",
  "첨부",
  "id",
];
const rows = [
  headers,
  ...Array.from({ length: 100 }, (_, i) => [
    "가상 게시물 " + i,
    i === 0
      ? '한글, "따옴표"\n\n- 목록\n숫자 123 유지\n\n\n<img src="https://example.com/tracker" onerror="window.bad=1"><script>window.bad=2</script>'
      : "가상 본문 " + i,
    "섹션 " + (i % 10),
    i % 2 ? "가상 작성자" : "",
    "",
    "https://padlet.com/demo/board-abcdefghijklmnop",
    i === 0
      ? "첫째.txt\n둘째.txt\n없음.txt"
      : i === 1
        ? "동일.txt"
        : i === 2
          ? "https://example.com/view"
          : "",
    "source-" + i,
  ]),
];
const csv = rows
  .map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(","))
  .join("\r\n");
fs.writeFileSync(path.join(fixture, "가상100.csv"), "\uFEFF" + csv);
const ws = XLSX.utils.aoa_to_sheet(rows);
ws.F2 = { t: "s", v: "원문 보기", l: { Target: rows[1][5] } };
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "게시물");
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([["댓글"], ["가상 댓글"]]),
  "댓글",
);
fs.writeFileSync(
  path.join(fixture, "가상100.xlsx"),
  XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
);
fs.writeFileSync(
  path.join(fixture, "가상첨부.zip"),
  fflate.zipSync({
    "첫째.txt": fflate.strToU8("가상 파일 1"),
    "둘째.txt": fflate.strToU8("가상 파일 2"),
    "a/동일.txt": fflate.strToU8("A"),
    "b/동일.txt": fflate.strToU8("B"),
    "미연결.svg": fflate.strToU8('<svg onload="alert(1)"></svg>'),
  }),
);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".md": "text/plain",
};
const server = http.createServer((req, res) => {
  let target = decodeURIComponent(req.url.split("?")[0]).replace(
    /^\/repo\//,
    "",
  );
  target = path.join(root, target || "index.html");
  if (!target.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory())
    target = path.join(target, "index.html");
  fs.readFile(target, (e, b) => {
    res.writeHead(e ? 404 : 200, {
      "Content-Type": mime[path.extname(target)] || "application/octet-stream",
    });
    res.end(e ? "missing" : b);
  });
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGEERROR", e.message);
  });
  page.on("request", (r) => requests.push(r.url()));
  const results = [];
  const pass = (name) => {
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/repo/index.html`);
  await page.waitForFunction(() => document.getElementById("diagnose").onclick);
  await page.waitForFunction(
    () => !document.getElementById("dataFile").disabled,
  );
  pass("relative assets at /repo/");
  const initialRequests = requests.length;
  await page
    .locator("#boardUrl")
    .fill("https://padlet.com/demo/board-abcdefghijklmnop");
  await page.locator("#diagnose").click();
  assert.match(
    await page.locator("#diagnosis").textContent(),
    /abcdefghijklmnop/,
  );
  pass("link diagnosis");
  for (const filename of ["가상100.csv", "가상100.xlsx"]) {
    const start = Date.now();
    await page.locator("#dataFile").setInputFiles(path.join(fixture, filename));
    await page.waitForFunction(
      () => !document.getElementById("importButton").disabled,
    );
    await page
      .locator("#attachments")
      .setInputFiles(path.join(fixture, "가상첨부.zip"));
    await page.locator("#importButton").click();
    await page.waitForFunction(() =>
      document.getElementById("stats").textContent.includes("가져옴 100"),
    );
    assert.match(await page.locator("#stats").textContent(), /미확보 2/);
    assert.equal(await page.locator(".post").count(), 100);
    assert.match(
      await page.locator("#original").textContent(),
      /숫자 123 유지/,
    );
    assert.match(
      await page.locator("#organized").textContent(),
      /원본에 정보 없음/,
    );
    assert.match(
      await page.locator("#organized").textContent(),
      /https:\/\/padlet.com/,
    );
    pass(
      filename +
        " 100 posts, missing fields, attachment 2/3, ambiguous, hyperlink " +
        (Date.now() - start) +
        "ms",
    );
  }
  await page.locator("#search").fill("게시물 99");
  assert.equal(await page.locator(".post").count(), 1);
  await page.locator("#search").fill("");
  await page.locator("#sectionFilter").selectOption("S-001");
  assert.equal(await page.locator(".post").count(), 10);
  await page.locator("#sectionFilter").selectOption("");
  await page.locator("#typeFilter").selectOption("unresolved");
  assert.equal(await page.locator(".post").count(), 2);
  await page.locator("#typeFilter").selectOption("");
  pass("search section type filters");
  await page.locator(".post button").nth(1).click();
  assert.match(await page.locator("#detail").textContent(), /ambiguous/);
  await page.locator("#detail select").selectOption("F-0003");
  assert.match(await page.locator("#stats").textContent(), /미확보 1/);
  pass("manual ambiguous match");
  await page.locator("details").evaluate((n) => (n.open = true));
  await page.locator("#apiKey").fill("FICTIONAL_KEY_LEAK_PROBE");
  await page.locator("#confirmSave").check();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#saveZip").click();
  const download = await downloadPromise;
  const output = path.join(root, "test-results");
  fs.mkdirSync(output, { recursive: true });
  await download.saveAs(path.join(output, "result.zip"));
  const zipped = fflate.unzipSync(
    fs.readFileSync(path.join(output, "result.zip")),
  );
  assert(zipped["01_원문/원문데이터.json"]);
  assert(zipped["02_줄글정리/글_읽기.html"]);
  assert.equal(
    JSON.parse(fflate.strFromU8(zipped["01_원문/원문데이터.json"])).posts
      .length,
    100,
  );
  assert.equal(
    JSON.parse(fflate.strFromU8(zipped["00_안내와목록/수집결과.json"]))
      .unresolved,
    1,
  );
  assert.match(
    await page.locator("#saveResult").textContent(),
    /ディスク|디스크 저장 여부/,
  );
  assert.match(
    await page.locator("#saveResult").textContent(),
    /실제 폴더 저장 확인 0/,
  );
  pass("download ZIP independently decompressed and verified");
  assert(
    !Object.values(zipped).some((b) =>
      fflate.strFromU8(b).includes("FICTIONAL_KEY_LEAK_PROBE"),
    ),
  );
  assert.equal(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
    0,
  );
  pass("fictional key absent from exported files and browser storage");
  assert.equal(await page.evaluate(() => window.bad), undefined);
  assert.equal(requests.length, initialRequests);
  assert.equal(errors.length, 0);
  pass("local data requests zero and XSS zero");
  const unit = await page.evaluate(async () => {
    const s = await import("./assets/js/security.js"),
      l = await import("./assets/js/local-import.js"),
      a = await import("./assets/js/padlet-api.js"),
      e = await import("./assets/js/export.js");
    const result = [];
    const check = (name, test) => {
      if (!test) throw Error(name);
      result.push(name);
    };
    for (const path of ["../x", "/x", "C:/x", "a\\b"]) {
      let blocked = false;
      try {
        s.validPath(path);
      } catch {
        blocked = true;
      }
      check("path " + path, blocked);
    }
    check(
      "reserved NFC",
      s.safeName("CON.txt") === "_CON.txt" && s.safeName("가") === "가",
    );
    check("csv formula", s.csv([["=1", "\t@a", "-1"]]).includes("'=1"));
    for (const url of [
      "https://padlet.com.evil/a",
      "javascript:alert(1)",
      "https://a@padlet.com/abcdefghijklmnop",
    ]) {
      let blocked = false;
      try {
        a.parseBoardUrl(url);
      } catch {
        blocked = true;
      }
      check("url reject", blocked);
    }
    for (const code of ["INVALID_API_KEY", "NOT_ADMIN", "NOT_PAYING_USER"]) {
      let msg = "";
      try {
        await a.readBoard("abcdefghijklmnop", "TEST_SECRET", {
          fetcher: async (url, o) => {
            check(
              "key header exact origin",
              url.startsWith("https://api.padlet.dev/") &&
                o.headers["x-api-key"] === "TEST_SECRET" &&
                o.redirect === "error",
            );
            return {
              ok: false,
              status: 401,
              json: async () => ({ errors: [{ code }] }),
            };
          },
        });
      } catch (err) {
        msg = err.message;
      }
      check("API mock " + code, msg.includes(code));
    }
    let msg = "";
    try {
      await a.readBoard("abcdefghijklmnop", "TEST_SECRET", {
        fetcher: async () => {
          throw TypeError();
        },
      });
    } catch (err) {
      msg = err.message;
    }
    check("network cause unknown", msg.includes("원인 미확정"));
    const zip = fflate.zipSync({ "x.txt": new Uint8Array(10000) });
    let blocked = false;
    try {
      l.unzipChecked(zip, {
        input: 1e6,
        file: 100,
        expanded: 100,
        entries: 10,
      });
    } catch {
      blocked = true;
    }
    check("actual unzip byte budget", blocked);
    const badZip = fflate.zipSync({ "../escape.txt": new Uint8Array(1) });
    blocked = false;
    try {
      l.unzipChecked(badZip);
    } catch {
      blocked = true;
    }
    check("zip traversal", blocked);
    const symlink=fflate.zipSync({'link.txt':new Uint8Array([1])});
    const sv=new DataView(symlink.buffer);for(let i=0;i<symlink.length-46;i++){if(sv.getUint32(i,true)===0x02014b50){sv.setUint32(i+38,0xa1ff0000,true);break;}}
    blocked=false;try{l.unzipChecked(symlink);}catch{blocked=true;}check('ZIP symlink rejected',blocked);
    let closed = false;
    const mockDir = {
      getFileHandle: async () => ({
        createWritable: async () => ({
          write: async () => {},
          close: async () => {
            closed = true;
          },
        }),
      }),
    };
    const r = await e.writeFile(mockDir, "x.txt", new Uint8Array(3));
    check("folder mock close then saved", closed && r.status === "saved");
    const fail = await e.writeFile(
      {
        getFileHandle: async () => ({
          createWritable: async () => ({
            write: async () => {
              throw Error();
            },
            abort: async () => {},
          }),
        }),
      },
      "x.txt",
      new Uint8Array(3),
    );
    check("folder mock failure", fail.status === "failed");
    const denied = await e.writeFile(
      {
        getDirectoryHandle: async () => {
          throw Error("denied");
        },
      },
      "dir/x.txt",
      new Uint8Array(1),
    );
    check("directory mock failure recorded", denied.status === "failed");
    const json = await l.readTable(
      new File(
        [
          JSON.stringify({
            schemaVersion: "1.0",
            posts: [
              {
                titleOriginal: null,
                bodyOriginal: "가상 JSON\n\n123",
                attachmentRefs: ["x.txt"],
              },
            ],
          }),
        ],
        "mock.json",
      ),
    );
    const project = l.normalize(json, 0, l.suggest(json.sheets[0].rows[0]), [
      { id: "F-1", path: "x.txt", bytes: new Uint8Array(0) },
    ]);
    check(
      "standard JSON blank title and zero-byte attachment",
      project.posts[0].titleOriginal === null &&
        project.attachments[0].assetId === "F-1" &&
        project.attachments[0].bytesReceived === 0,
    );
    const malformed = new Uint8Array([1, 2, 3]);
    let rejected = false;
    try {
      l.unzipChecked(malformed);
    } catch {
      rejected = true;
    }
    check("malformed ZIP rejected", rejected);
    check(
      "unknown columns require manual map",
      l.suggest(["비표준 본문"]).body === -1,
    );
    return result;
  });
  unit.forEach(pass);
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => {
      throw new DOMException("cancel", "AbortError");
    };
    document.getElementById("saveFolder").disabled = false;
  });
  await page.locator("#saveFolder").click();
  await page.waitForFunction(() =>
    document
      .getElementById("saveResult")
      .textContent.includes("폴더 선택 취소"),
  );
  assert.match(await page.locator("#stats").textContent(), /가져옴 100/);
  pass("folder cancellation mock retains project");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  pass("mobile viewport no overflow");
  await page.screenshot({
    path: path.join(output, "app-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: path.join(output, "app-desktop.png"),
    fullPage: true,
  });
  const largeRows = [
    headers,
    ...Array.from({ length: 100 }, (_, i) => [
      "성능 가상 " + i,
      "가상 본문 123. ".repeat(620),
      "섹션 " + (i % 10),
      "",
      "",
      "",
      i < 30 ? "asset-" + i + ".txt" : "",
      "",
    ]),
  ];
  fs.writeFileSync(
    path.join(output, "large.csv"),
    largeRows.map((r) => r.map((v) => '"' + v + '"').join(",")).join("\r\n"),
  );
  const largeAssets = {};
  for (let i = 0; i < 30; i++)
    largeAssets["asset-" + i + ".txt"] = new Uint8Array(
      Math.floor((50 * 1024 ** 2) / 30),
    );
  fs.writeFileSync(path.join(output, "large.zip"), fflate.zipSync(largeAssets));
  const begin = Date.now();
  await page.locator("#dataFile").setInputFiles(path.join(output, "large.csv"));
  await page.waitForFunction(() =>
    document
      .getElementById("importStatus")
      .textContent.includes("파일 읽기 완료"),
  );
  await page
    .locator("#attachments")
    .setInputFiles(path.join(output, "large.zip"));
  await page.locator("#importButton").click();
  await page.waitForFunction(() =>
    document
      .getElementById("stats")
      .textContent.includes("서로 다른 확보 파일 30"),
  );
  pass(
    "100 posts ~1MiB text + 30 assets ~50MiB import " +
      (Date.now() - begin) +
      "ms",
  );
  await page.locator("#confirmSave").check();
  const largeDownloadPromise = page.waitForEvent("download");
  await page.locator("#saveZip").click();
  const largeDownload = await largeDownloadPromise;
  await largeDownload.saveAs(path.join(output, "large-result.zip"));
  const largeOutput = fflate.unzipSync(
    fs.readFileSync(path.join(output, "large-result.zip")),
  );
  assert.equal(
    Object.keys(largeOutput).filter((x) => x.startsWith("03_첨부자료/")).length,
    30,
  );
  assert.equal(
    JSON.parse(fflate.strFromU8(largeOutput["00_안내와목록/수집결과.json"]))
      .unresolved,
    0,
  );
  pass("50MiB attachment ZIP roundtrip");
  assert.equal(requests.length, initialRequests);
  assert.equal(errors.length, 0);
  fs.writeFileSync(
    path.join(output, "read.html"),
    zipped["02_줄글정리/글_읽기.html"],
  );
  const offline = await browser.newContext({ offline: true });
  const reader = await offline.newPage();
  let external = 0;
  reader.on("request", (r) => {
    if (/^https?:/.test(r.url())) external++;
  });
  await reader.goto(
    require("url").pathToFileURL(path.join(output, "read.html")).href,
  );
  assert.match(await reader.locator("body").textContent(), /숫자 123 유지/);
  assert.equal(external, 0);
  await offline.close();
  pass("standalone read HTML offline and no remote resource requests");
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        date: "2026-10-08",
        browser: await browser.version(),
        results,
        errors,
        localDataRequests: requests.length - initialRequests,
      },
      null,
      2,
    ),
  );
  await browser.close();
  server.close();
})().catch((err) => {
  console.error(err);
  server.close();
  process.exitCode = 1;
});
