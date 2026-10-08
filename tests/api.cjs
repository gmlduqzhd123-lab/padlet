const fs = require("fs"),
  path = require("path"),
  http = require("http"),
  assert = require("assert");
const {
  chromium,
} = require("C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const fflate = require("../assets/vendor/fflate-0.8.2.js");
const root = path.resolve(__dirname, ".."),
  output = path.join(root, "test-results");
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const name = new URL(req.url, "http://localhost").pathname.replace(
    /^\/repo\//,
    "",
  );
  const target = path.resolve(root, name || "index.html");
  if (!target.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(target, (err, data) => {
    res.writeHead(err ? 404 : 200, {
      "content-type": target.endsWith(".js")
        ? "text/javascript"
        : target.endsWith(".css")
          ? "text/css"
          : "text/html",
    });
    res.end(err ? "missing" : data);
  });
});
const boardId = "abcdefghijklmnop";
const fixture = {
  data: {
    type: "board",
    id: boardId,
    attributes: {
      title: "가상 API 보드",
      webUrl: { live: "https://padlet.com/mock/board-" + boardId },
    },
    relationships: {
      posts: {
        data: [1, 2, 3, 4].map((i) => ({ type: "post", id: "post_" + i })),
      },
    },
  },
  included: [
    {
      type: "section",
      id: "sec_1",
      attributes: { title: "가상 섹션", sortIndex: 1 },
    },
    ...[1, 2, 3].map((i) => ({
      type: "post",
      id: "post_" + i,
      attributes: {
        status: i === 3 ? "pending_moderation" : "approved",
        sortIndex: i,
        title: null,
        content: {
          subject: "가상 API 게시물 " + i,
          bodyHtml: "<p>가상 본문 " + i + " · 123 유지</p>",
          attachment:
            i < 3
              ? {
                  url:
                    "https://cdn.padlet.dev/uploads/file" +
                    i +
                    ".txt?signature=EPHEMERAL_PROBE",
                }
              : null,
        },
        webUrl: {
          live: "https://padlet.com/mock/board-" + boardId + "/wish/" + i,
        },
      },
      relationships: {
        section: { data: { type: "section", id: "sec_1" } },
        board: { data: { type: "board", id: boardId } },
      },
    })),
  ],
};
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(15000);
    const errors = [],
      apiRequests = [],
      fileRequests = [],
      results = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const consoleMessages = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    const pass = (name) => {
      results.push({ name, status: "PASS" });
      console.log("PASS", name);
    };
    let boardDelay = 0;
    let fixSecond = false,
      denyApi = false;
    await page.route("https://api.padlet.dev/**", async (route) => {
      const req = route.request();
      apiRequests.push({ url: req.url(), headers: req.headers() });
      assert.equal(req.headers()["x-api-key"], "FICTIONAL_API_KEY");
      if (boardDelay && req.url().includes("/boards/"))
        await new Promise((r) => setTimeout(r, boardDelay));
      if (denyApi) {
        await route.fulfill({
          status: 403,
          contentType: "application/vnd.api+json",
          body: JSON.stringify({ errors: [{ code: "NOT_ADMIN" }] }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.api+json",
        body: JSON.stringify(
          req.url().includes("/boards/")
            ? fixture
            : {
                data: {
                  type: "attachmentData",
                  attributes: {
                    previewImageUrl:
                      "https://padlet-artifacts.storage.googleapis.com/virtual-preview.jpg",
                    embedCode: "",
                    poll: null,
                  },
                },
              },
        ),
      });
    });
    await page.route("https://cdn.padlet.dev/**", async (route) => {
      const req = route.request();
      fileRequests.push(req.headers());
      assert(!req.headers()["x-api-key"]);
      assert(!req.headers().authorization);
      assert(!req.headers().cookie);
      assert(!req.headers().referer);
      await route.fulfill({
        status: 200,
        contentType:
          req.url().includes("file2") && !fixSecond
            ? "text/html"
            : "text/plain",
        body:
          req.url().includes("file2") && !fixSecond
            ? "<html>가상 로그인 페이지</html>"
            : "가상 실제 바이트",
      });
    });
    await page.goto(
      `http://127.0.0.1:${server.address().port}/repo/index.html`,
    );
    await page.waitForFunction(
      () => !document.getElementById("dataFile").disabled,
    );
    await page.locator("#advancedDiagnostics").evaluate((n) => (n.open = true));
    await page
      .locator("#boardUrl")
      .fill("https://padlet.com/mock/board-" + boardId);
    await page.locator("#diagnose").click();
    assert.match(
      await page.locator("#diagnosis").textContent(),
      /API 연결 검사 안 함/,
    );
    assert.equal(
      await page.locator("#apiConnection").evaluate((n) => n.open),
      true,
    );
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "apiKey",
    );
    await page.locator("#apiBoard").click();
    await page.locator("#collectApi").click();
    assert.equal(apiRequests.length, 0);
    assert.equal(fileRequests.length, 0);
    pass(
      "URL check opens key guidance; no-key diagnosis and collection make zero remote requests",
    );
    await page.locator("#apiKey").fill("FICTIONAL_API_KEY");
    await page.locator("#apiBoard").click();
    await page.waitForFunction(
      () => !document.getElementById("apiBoard").disabled,
    );
    assert.match(
      await page.locator("#diagnosis").textContent(),
      /GET 응답 읽기 성공/,
    );
    assert.match(await page.locator("#diagnosis").textContent(), /현재 출처/);
    assert.match(
      await page.locator("#diagnosis").textContent(),
      /이 검사에서는 수행하지 않음/,
    );
    assert.equal(await page.locator("#apiKey").inputValue(), "");
    pass(
      "mock successful connection reports current-origin response only; no attachment or save claim",
    );
    denyApi = true;
    await page.locator("#apiKey").fill("FICTIONAL_API_KEY");
    await page.locator("#apiBoard").click();
    await page.waitForFunction(
      () => !document.getElementById("apiBoard").disabled,
    );
    assert.match(
      await page.locator("#diagnosis").textContent(),
      /API 연결 검사 실패.*NOT_ADMIN.*HTTP 403/,
    );
    pass(
      "mock permission failure gives concrete provider error instead of blanket unverified",
    );
    denyApi = false;
    apiRequests.length = 0;
    await page.locator("#boardId").fill(boardId);
    await page.locator("#collectApi").click();
    await page.waitForFunction(() =>
      document.getElementById("stats").textContent.includes("가져옴 3"),
    );
    await page.waitForFunction(
      () => !document.getElementById("collectApi").disabled,
    );
    assert.equal(apiRequests.length, 3);
    assert.equal(fileRequests.length, 0);
    assert.match(await page.locator("#stats").textContent(), /선택 2/);
    assert.match(await page.locator("#coverage").textContent(), /post_4/);
    assert.equal(await page.locator("#apiKey").inputValue(), "");
    assert.match(
      await page.locator("#diagnosis").textContent(),
      /API 게시물 응답 읽음 · 3개/,
    );
    pass(
      "mock board/section/posts and missing ID; pending excluded; metadata only",
    );
    pass(
      "tab key reused after connection diagnostics without reentry; input empty",
    );
    await page.locator("#detail input[type=checkbox]").check();
    await page.locator(".post button").nth(1).click();
    await page.locator("#detail input[type=checkbox]").check();
    await page.locator("#downloadRemote").click();
    await page.waitForFunction(
      () => !document.getElementById("downloadRemote").disabled,
    );
    assert.match(
      await page.locator("#stats").textContent(),
      /서로 다른 확보 파일 1/,
    );
    assert.match(await page.locator("#stats").textContent(), /미확보 1/);
    assert.equal(fileRequests.length, 2);
    pass(
      "explicit direct-file/host approval; attachment requests have no key/cookies/referrer; login HTML fails independently",
    );
    await page.locator("#confirmSave").check();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#saveZip").click();
    await (await downloadPromise).saveAs(path.join(output, "api-result.zip"));
    const zip = fflate.unzipSync(
      fs.readFileSync(path.join(output, "api-result.zip")),
    );
    const original = JSON.parse(
      fflate.strFromU8(zip["01_원문/원문데이터.json"]),
    );
    assert.equal(original.sourceMode, "api");
    assert.equal(original.posts.length, 2);
    assert.equal(original.coverage.basis, "api-response");
    assert(
      Object.values(zip).every(
        (b) =>
          !fflate.strFromU8(b).includes("FICTIONAL_API_KEY") &&
          !fflate.strFromU8(b).includes("EPHEMERAL_PROBE"),
      ),
    );
    assert.equal(
      Object.keys(zip).filter((n) => n.startsWith("03_첨부자료/")).length,
      1,
    );
    pass(
      "API ZIP contains actual bytes and failure/coverage ledger; key and signed URL absent",
    );
    fixSecond = true;
    await page.locator("#downloadRemote").click();
    await page.waitForFunction(
      () => !document.getElementById("downloadRemote").disabled,
    );
    assert.match(
      await page.locator("#stats").textContent(),
      /서로 다른 확보 파일 2/,
    );
    assert.equal(fileRequests.length, 3);
    pass("manual retry only failed attachment; prior bytes retained");
    const priorBody = await page.locator("#original").textContent();
    await page
      .locator("#supplementalFiles")
      .setInputFiles(path.join(__dirname, "fixtures", "가상첨부.zip"));
    await page.locator("#addLocalAssets").click();
    await page.waitForFunction(
      () => !document.getElementById("addLocalAssets").disabled,
    );
    assert.match(
      await page.locator("#importStatus").textContent(),
      /로컬 첨부 5개 추가/,
    );
    assert.equal(await page.locator("#original").textContent(), priorBody);
    const addedId = await page
      .locator("#detail select option")
      .evaluateAll(
        (opts) => opts.find((o) => o.value.startsWith("F-local-")).value,
      );
    await page.locator("#detail select").selectOption(addedId);
    assert.match(
      await page.locator("#detail").textContent(),
      /사용자 수동 연결/,
    );
    pass(
      "API project supplemental local ZIP added and manually linked with unique IDs; original body preserved",
    );
    boardDelay = 700;
    const countBeforeDisconnect = apiRequests.length;
    await page.locator("#collectApi").click();
    await page.waitForFunction(
      () => document.getElementById("collectApi").disabled,
    );
    assert.equal(await page.locator("#saveZip").isDisabled(), true);
    assert.equal(await page.locator("#boardUrl").isDisabled(), true);
    await page.locator("#clearKey").click();
    await page.waitForFunction(
      () => !document.getElementById("collectApi").disabled,
    );
    assert.match(
      await page.locator("#connectionStatus").textContent(),
      /키 없음/,
    );
    assert.equal(await page.locator("#original").textContent(), priorBody);
    const afterDisconnect = apiRequests.length;
    await page.locator("#collectApi").click();
    assert.equal(apiRequests.length, afterDisconnect);
    assert.match(
      await page.locator("#diagnosis").textContent(),
      /API 연결 검사 안 함/,
    );
    boardDelay = 0;
    pass(
      "disconnect cancels collection, clears session auth, keeps existing body/assets and prevents subsequent request; conflicting controls locked",
    );
    const unit = await page.evaluate(async () => {
      const c = await import("./assets/js/api-client.js"),
        m = await import("./assets/js/api-collection.js"),
        d = await import("./assets/js/attachment-download.js"),
        info = await import("./assets/js/attachment-info.js"),
        session = (
          await import("./assets/js/api-session.js")
        ).createApiSession();
      const result = [];
      const check = (name, value) => {
        if (!value) throw Error(name);
        result.push(name);
      };
      const schema = {
        data: {
          type: "attachmentData",
          attributes: {
            previewImageUrl:
              "https://padlet-artifacts.storage.googleapis.com/mock.jpg?signature=PREVIEW_SECRET",
            embedCode: "<script>window.bad=99</script>",
            poll: null,
            downloadUrl: "https://evil.example/guessed.pdf",
          },
        },
      };
      const normalized = info.normalizeAttachmentData(schema, {
        url: "https://cdn.padlet.dev/mock.pdf?signature=DOWNLOAD_SECRET",
      });
      check(
        "official preview/embed interpreted; guessed downloadUrl ignored; candidate from post is unverified",
        normalized.metadata.hasPreview &&
          normalized.metadata.hasEmbed &&
          normalized.metadata.originalStatus === "unverified" &&
          normalized.candidate.includes("mock.pdf") &&
          !JSON.stringify(normalized.metadata).includes("SECRET"),
      );
      const previewOnly = info.normalizeAttachmentData(schema, {
        url: schema.data.attributes.previewImageUrl,
      });
      check(
        "preview never promoted to original/download candidate",
        previewOnly.candidate === null &&
          previewOnly.metadata.type === "preview_only",
      );
      check(
        "meaningful external view query preserved",
        info.normalizeAttachmentData(schema, {
          url: "https://www.youtube.com/watch?v=virtual123",
        }).metadata.sourceUrl === "https://www.youtube.com/watch?v=virtual123",
      );
      check(
        "sensitive view token excluded; original and preview addresses excluded from exported metadata",
        info.publicViewUrl("https://example.com/view?id=1&token=PRIVATE") ===
          null &&
          !JSON.stringify(normalized.metadata).includes("DOWNLOAD_SECRET"),
      );
      check(
        "transformed post image is not an original candidate",
        info.normalizeAttachmentData(schema, {
          url: "https://cdn.padlet.dev/mock.jpg?resize=20,20",
        }).candidate === null,
      );
      check(
        "poll classified without invented filename or original",
        info.normalizeAttachmentData(
          {
            data: {
              type: "attachmentData",
              attributes: { poll: { question: "virtual" } },
            },
          },
          {},
        ).metadata.type === "poll",
      );
      let schemaRejected = false;
      try {
        info.normalizeAttachmentData(
          { data: { type: "wrong", attributes: {} } },
          {},
        );
      } catch {
        schemaRejected = true;
      }
      check("unknown attachment response schema rejected", schemaRejected);
      const csp = document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        .content.split(";")
        .find((s) => s.trim().startsWith("connect-src"))
        .trim()
        .split(/\s+/)
        .slice(1);
      check(
        "CSP and download host allowlist agree without wildcard or entire HTTPS",
        csp.includes("https://api.padlet.dev") &&
          csp
            .filter((s) => s !== "'self'" && s !== "https://api.padlet.dev")
            .sort()
            .join(",") ===
            [...d.SUPPORTED_ATTACHMENT_HOSTS]
              .map((h) => "https://" + h)
              .sort()
              .join(","),
      );
      session.set("VIRTUAL");
      session.clear();
      let afterClear = 0;
      try {
        await c.createApiClient(() => session.get(), {
          wait: async () => {},
          fetcher: async () => {
            afterClear++;
            return new Response("{}");
          },
        })("/v1/boards/abcdefghijklmnop");
      } catch {}
      check(
        "cleared session key cannot be reused by previously created client",
        !session.has() && afterClear === 0,
      );
      const failedInfoProject = m.mapBoard(
        [
          {
            data: { id: "abcdefghijklmnop", type: "board" },
            included: [1, 2].map((i) => ({
              id: "post_" + i,
              type: "post",
              attributes: {
                status: "approved",
                content: {
                  bodyHtml: "preserved " + i,
                  attachment: {
                    url:
                      i === 1
                        ? "https://cdn.padlet.dev/one.pdf"
                        : "https://unsupported.example/two.pdf",
                  },
                },
              },
            })),
          },
        ],
        "abcdefghijklmnop",
      );
      const ephemeral = new Map();
      let metaCall = 0;
      await m.collectAttachmentInfo(
        failedInfoProject,
        async () => {
          if (metaCall++ === 0)
            throw Object.assign(Error("virtual metadata"), { httpStatus: 403 });
          return schema;
        },
        ephemeral,
      );
      check(
        "metadata failure preserves all posts and subsequent unsupported host is explicit",
        failedInfoProject.posts.length === 2 &&
          failedInfoProject.posts[0].bodyOriginal === "preserved 1" &&
          failedInfoProject.attachments[0].failure.httpStatus === 403 &&
          failedInfoProject.attachments[1].status === "unsupported_host",
      );
      let cspCategory;
      try {
        await d.fetchAttachment(
          "https://cdn.padlet.dev/csp.pdf",
          new Set(["cdn.padlet.dev"]),
          {
            fetcher: async () => {
              document.dispatchEvent(
                new SecurityPolicyViolationEvent("securitypolicyviolation", {
                  effectiveDirective: "connect-src",
                  blockedURI: "https://cdn.padlet.dev",
                }),
              );
              throw TypeError("virtual CSP");
            },
          },
        );
      } catch (e) {
        cspCategory = e.category;
      }
      check(
        "observed mock CSP violation distinguished from unknown network",
        cspCategory === "csp",
      );
      for (const [name, fetcher, expected] of [
        [
          "expired HTTP",
          async () => new Response("expired", { status: 403 }),
          "http",
        ],
        [
          "JSON error MIME",
          async () =>
            new Response('{"error":"virtual"}', {
              headers: { "content-type": "application/problem+json" },
            }),
          "format",
        ],
        [
          "JSON error disguised as bytes",
          async () =>
            new Response('{"error":"virtual"}', {
              headers: { "content-type": "application/octet-stream" },
            }),
          "format",
        ],
        [
          "unknown network",
          async () => {
            throw TypeError("virtual network");
          },
          "network",
        ],
      ]) {
        let category;
        try {
          await d.fetchAttachment(
            "https://cdn.padlet.dev/failure.pdf",
            new Set(["cdn.padlet.dev"]),
            { fetcher },
          );
        } catch (e) {
          category = e.category;
        }
        check("attachment reason " + name, category === expected);
      }
      let clock = 0,
        calls = 0;
      const waits = [];
      const client = c.createApiClient("VIRTUAL", {
        now: () => clock,
        wait: async (n) => {
          waits.push(n);
          clock += n;
        },
        fetcher: async () => {
          calls++;
          if (calls === 1)
            return {
              ok: false,
              status: 429,
              headers: new Headers({ "Retry-After": "2" }),
              json: async () => ({ errors: [{ code: "RATE_LIMIT_EXCEEDED" }] }),
            };
          if (calls === 2)
            return {
              ok: false,
              status: 503,
              headers: new Headers(),
              json: async () => {
                throw Error("HTML");
              },
            };
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: { id: "ok" } }),
          };
        },
      });
      await client("/v1/boards/abcdefghijklmnop");
      check(
        "429 Retry-After + non-JSON 503 bounded retry + 1 second pace mock",
        calls === 3 && waits.some((n) => n >= 2000),
      );
      check(
        "Retry-After fallback/date",
        c.retryDelay(null) === 60000 &&
          c.retryDelay(
            "Thu, 08 Oct 2026 00:01:00 GMT",
            Date.parse("2026-10-08T00:00:00Z"),
          ) === 60000,
      );
      let attempts = 0;
      try {
        await c.createApiClient("VIRTUAL", {
          wait: async () => {},
          fetcher: async () => {
            attempts++;
            return {
              ok: false,
              status: 401,
              json: async () => ({ errors: [{ code: "NOT_ADMIN" }] }),
            };
          },
        })("/v1/boards/abcdefghijklmnop");
      } catch {}
      check("authorization error not retried", attempts === 1);
      attempts = 0;
      try {
        await c.createApiClient("VIRTUAL", {
          wait: async () => {},
          fetcher: async () => {
            attempts++;
            return {
              ok: false,
              status: 429,
              headers: new Headers(),
              json: async () => ({ errors: [] }),
            };
          },
        })("/v1/boards/abcdefghijklmnop");
      } catch {}
      check("429 retries bounded", attempts === 3);
      const ac = new AbortController();
      const pending = c.delay(60000, ac.signal);
      ac.abort();
      let cancelled = false;
      try {
        await pending;
      } catch (e) {
        cancelled = e.name === "AbortError";
      }
      check("waiting cancels immediately", cancelled);
      const board = {
        data: {
          id: "abcdefghijklmnop",
          type: "board",
          attributes: {},
          relationships: { posts: { data: [] } },
        },
        included: [],
        links: { next: "https://evil.example/next" },
      };
      const project = await m.collectBoard(
        "abcdefghijklmnop",
        async () => board,
      );
      check(
        "foreign pagination blocked and partial preserved",
        project.coverage.status === "partial",
      );
      let blocked = false;
      try {
        m.mapBoard(
          [{ ...board, data: { ...board.data, id: "other" } }],
          "abcdefghijklmnop",
        );
      } catch {
        blocked = true;
      }
      check("board identity mismatch rejected", blocked);
      const first = {
        data: {
          id: "abcdefghijklmnop",
          type: "board",
          relationships: { posts: { data: [{ id: "post_1", type: "post" }] } },
        },
        included: [
          {
            id: "post_1",
            type: "post",
            attributes: { status: "approved", content: { bodyHtml: "가상 1" } },
          },
        ],
        links: {
          next: "https://api.padlet.dev/v1/boards/abcdefghijklmnop?cursor=from-response",
        },
      };
      const second = {
        data: {
          id: "abcdefghijklmnop",
          type: "board",
          relationships: { posts: { data: [{ id: "post_2", type: "post" }] } },
        },
        included: [
          {
            id: "post_2",
            type: "post",
            attributes: { status: "approved", content: { bodyHtml: "가상 2" } },
          },
        ],
      };
      let paths = [];
      const multi = await m.collectBoard("abcdefghijklmnop", async (path) => {
        paths.push(path);
        return paths.length === 1 ? first : second;
      });
      check(
        "documented response pagination exact URL; posts union; sectionless group preserved",
        paths[1] === first.links.next &&
          multi.posts.length === 2 &&
          multi.sections.length === 1,
      );
      let count = 0;
      const partial = await m.collectBoard("abcdefghijklmnop", async () => {
        if (count++ === 0) return first;
        throw Error("mock failure");
      });
      check(
        "next page failure preserves acquired post",
        partial.posts.length === 1 && partial.coverage.status === "partial",
      );
      const stop = new AbortController();
      let cancelledRefs = [
        {
          id: "A-1",
          postIds: ["P-1"],
          originalName: "cancel.txt",
          assetId: null,
          status: "manual_required",
        },
      ];
      const cancelProject = {
        posts: [{ id: "P-1", selected: true }],
        attachments: cancelledRefs,
      };
      await d.downloadAttachments(
        cancelProject,
        [],
        new Map([["A-1", "https://cdn.padlet.dev/cancel.txt"]]),
        new Map([["A-1", "cdn.padlet.dev"]]),
        {
          signal: stop.signal,
          fetcher: async () => new Response("virtual bytes"),
          onProgress: () => stop.abort(),
        },
      );
      check(
        "download cancellation leaves cancelled reference and no saved claim",
        cancelledRefs[0].status === "cancelled" && !cancelledRefs[0].assetId,
      );
      let refList = [1, 2].map((i) => ({
          id: "A-" + i,
          postIds: ["P-1"],
          originalName: "shared.txt",
          assetId: null,
          status: "manual_required",
        })),
        unique = [],
        downloads = 0;
      await d.downloadAttachments(
        { posts: [{ id: "P-1", selected: true }], attachments: refList },
        unique,
        new Map(
          refList.map((a) => [a.id, "https://cdn.padlet.dev/shared.txt"]),
        ),
        new Map(refList.map((a) => [a.id, "cdn.padlet.dev"])),
        {
          fetcher: async () => {
            downloads++;
            return new Response("shared");
          },
        },
      );
      check(
        "same URL attachment bytes deduplicated and references kept",
        downloads === 1 &&
          unique.length === 1 &&
          refList[0].assetId === refList[1].assetId,
      );
      for (const url of [
        "https://127.0.0.1/a.txt",
        "https://cdn.padlet.dev.evil.example/a.txt",
        "https://cdn.padlet.dev/a.html",
        "https://api.padlet.dev/a.txt",
        "https://u@cdn.padlet.dev/a.txt",
      ]) {
        blocked = false;
        try {
          d.attachmentUrl(url, new Set([new URL(url).hostname]));
        } catch {
          blocked = true;
        }
        check("unsafe/unsupported attachment URL rejected", blocked);
      }
      blocked = false;
      try {
        await d.fetchAttachment(
          "https://cdn.padlet.dev/a.pdf",
          new Set(["cdn.padlet.dev"]),
          {
            fetcher: async () =>
              new Response("x", { headers: { "content-type": "image/png" } }),
          },
        );
      } catch {
        blocked = true;
      }
      check("explicit MIME mismatch rejected", blocked);
      blocked = false;
      try {
        await d.fetchAttachment(
          "https://cdn.padlet.dev/a.txt",
          new Set(["cdn.padlet.dev"]),
          {
            budget: { received: 500 * 1024 ** 2 },
            fetcher: async () =>
              new Response("x", { headers: { "content-type": "text/plain" } }),
          },
        );
      } catch {
        blocked = true;
      }
      check("actual attachment byte budget enforced", blocked);
      let empty = await d.fetchAttachment(
        "https://cdn.padlet.dev/a.txt",
        new Set(["cdn.padlet.dev"]),
        { fetcher: async () => new Response(new Uint8Array(0)) },
      );
      check(
        "zero byte attachment accepted without fake size",
        empty.length === 0,
      );
      return result;
    });
    unit.forEach(pass);
    assert.equal(errors.length, 0);
    assert.equal(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
      0,
    );
    pass("no page errors; storage empty");
    assert(
      !consoleMessages.some(
        (message) =>
          message.includes("FICTIONAL_API_KEY") ||
          message.includes("EPHEMERAL_PROBE"),
      ),
    );
    assert.equal(
      await page.evaluate(async () =>
        indexedDB.databases ? (await indexedDB.databases()).length : 0,
      ),
      0,
    );
    assert.equal(
      await page.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
      0,
    );
    assert.equal(await page.evaluate(() => window.bad), undefined);
    pass(
      "fictional key and signed URL absent from browser console; no IndexedDB/service worker or embed execution",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await page.waitForFunction(
      () => !document.getElementById("dataFile").disabled,
    );
    assert.equal(
      await page.locator("#advancedDiagnostics").evaluate((n) => n.open),
      false,
    );
    await page
      .locator("#boardUrl")
      .fill("https://padlet.com/mock/board-" + boardId);
    const requestCount = apiRequests.length;
    await page.locator("#collectApi").click();
    assert.match(
      await page.locator("#diagnosis").textContent(),
      /API 연결 검사 안 함/,
    );
    assert.equal(apiRequests.length, requestCount);
    pass(
      "reload forgets key; default primary flow requests first key without advanced diagnostics or remote request",
    );
    await page.screenshot({
      path: path.join(output, "api-desktop.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(output, "api-results.json"),
      JSON.stringify(
        {
          date: "2026-10-09",
          browser: await browser.version(),
          source: "localhost/mock only",
          results,
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
