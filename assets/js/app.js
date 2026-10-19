import { startWorker, localTask, cancelLocal } from "./worker-client.js";
import { fields, suggest, normalize } from "./local-import.js";
import { parseBoardUrl, readBoard, readAttachment } from "./padlet-api.js";
import {
  summary,
  documents,
  finalize,
  makeZip,
  writeFolder,
} from "./export.js";
import { safeUrl } from "./security.js";
import { createApiClient } from "./api-client.js";
import { collectBoard, collectAttachmentInfo } from "./api-collection.js";
import { downloadAttachments, attachmentUrl } from "./attachment-download.js";
import { createApiSession } from "./api-session.js";

const apiSession = createApiSession();
const $ = (id) => document.getElementById(id);
const stepLinks = [...document.querySelectorAll(".nav-item")];
let pinnedStep = null;
let pinnedTimer = null;

function setActiveStep(stepId) {
  for (const link of stepLinks) {
    const selected = link.hash === `#${stepId}`;
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
  }
}

function updateStepNavigation() {
  if (pinnedStep) {
    setActiveStep(pinnedStep);
    return;
  }
  const sections = ["collect", "materials", "organize", "save"];
  let current = "collect";
  for (const id of sections) {
    const el = id === "collect" ? $("import") || $(id) : $(id);
    if (el && el.getBoundingClientRect().top <= innerHeight * 0.4) current = id;
  }
  if (scrollY + innerHeight >= document.documentElement.scrollHeight - 8)
    current = "save";
  setActiveStep(current);
}

for (const link of stepLinks) {
  link.addEventListener("click", () => {
    const target = link.hash.replace("#", "");
    if (!target) return;
    pinnedStep = target;
    setActiveStep(target);
    clearTimeout(pinnedTimer);
    pinnedTimer = setTimeout(() => {
      pinnedStep = null;
    }, 900);
  });
}

let navigationFrame = null;
window.addEventListener(
  "scroll",
  () => {
    if (navigationFrame !== null) return;
    navigationFrame = requestAnimationFrame(() => {
      navigationFrame = null;
      updateStepNavigation();
    });
  },
  { passive: true },
);

// Step 1 Mode Switcher (Import vs Collect vs Both)
const routeTabs = [...document.querySelectorAll(".route-tab")];
function setRouteMode(mode) {
  const container = $("step1Container");
  if (container) container.dataset.view = mode;
  for (const tab of routeTabs) {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  }
  $("import")?.classList.toggle("card-focused", mode === "import");
  $("collect")?.classList.toggle("card-focused", mode === "collect");
}
for (const tab of routeTabs) {
  tab.addEventListener("click", () => {
    setRouteMode(tab.dataset.mode || "both");
  });
}
if ($("localImportLink")) {
  $("localImportLink").addEventListener("click", () => setRouteMode("import"));
}

let table = null,
  project = null,
  assets = [],
  active = null,
  controller = null,
  busy = false,
  quickFilter = "all",
  detailViewMode = "organized";
let remoteUrls = new Map(),
  approvedHosts = new Map();

function formatPostOrganized(p) {
  const lines = [];
  lines.push(`제목: ${p.titleOriginal || "[제목 없음]"}`);
  if ($("showAuthor")?.checked) {
    lines.push(`작성자: ${p.authorOriginal || "원본에 정보 없음"}`);
  }
  if ($("showDate")?.checked) {
    lines.push(`작성일: ${p.createdAtOriginal || "원본에 정보 없음"}`);
  }
  if (p.sourceUrl) {
    lines.push(`원문 링크: ${p.sourceUrl}`);
  }
  lines.push("");
  const cleaned = String(p.bodyPlain || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  lines.push(cleaned || "[본문 없음]");
  return lines.join("\n");
}

function installProject(next, nextAssets = []) {
  project = next;
  assets = nextAssets;
  active = project.posts[0]?.id;
  approvedHosts = new Map();
  quickFilter = "all";
  $("confirmSave").checked = false;
  $("sectionFilter").replaceChildren(node("option", "📂 모든 섹션"));
  $("sectionFilter").firstChild.value = "";
  for (const s of project.sections) {
    const o = node("option", s.name || "섹션 없음");
    o.value = s.id;
    $("sectionFilter").append(o);
  }
  $("search").value = "";
  $("typeFilter").value = "";
  text("saveResult", "새 자료 가져옴 · 실제 저장 확인 0개");
  document.body.classList.add("has-project");
  render();
}

function apiProgress(progress) {
  if (progress.phase === "waiting")
    text(
      "apiProgress",
      `${progress.reason} · ${Math.ceil(progress.waitMs / 1000)}초 대기 · 중지 가능`,
    );
  else if (progress.phase === "board")
    text(
      "apiProgress",
      `게시물 응답 ${progress.posts}개 읽음 · 아직 첨부 파일 저장 아님`,
    );
  else
    text(
      "apiProgress",
      `${progress.id || ""} · ${progress.status || "받은 바이트 " + (progress.bytes ?? 0)}`,
    );
}

function setRemoteBusy(value) {
  busy = value;
  document.body.classList.toggle("is-busy", value);
  for (const id of [
    "collectApi",
    "downloadRemote",
    "apiBoard",
    "apiAttachment",
    "saveZip",
    "diagnose",
    "boardUrl",
    "boardId",
    "apiKey",
    "attachments",
    "supplementalFiles",
    "addLocalAssets",
    "selectAll",
    "selectNone",
    "search",
    "sectionFilter",
    "typeFilter",
  ])
    $(id).disabled = value;
  $("importButton").disabled = value || !table;
  capabilities();
  if (value) $("saveFolder").disabled = true;
  $("dataFile").disabled = value;
  for (const control of document.querySelectorAll(
    "#posts input, #posts button, #detail input, #detail select, #mapping select, #sheet, #encoding, #showAuthor, #showDate, #confirmSave",
  )) {
    if (value) {
      if (control.dataset.wasDisabled === undefined)
        control.dataset.wasDisabled = String(control.disabled);
      control.disabled = true;
    } else if (control.dataset.wasDisabled !== undefined) {
      control.disabled = control.dataset.wasDisabled === "true";
      delete control.dataset.wasDisabled;
    }
  }
  $("sheet").disabled = value || !table || table.sheets.length < 2;
}

async function importApi() {
  if (busy) return;
  try {
    const id =
      $("boardId").value.trim() || parseBoardUrl($("boardUrl").value).id;
    if (!id || !/^[a-zA-Z0-9]{16,22}$/.test(id)) {
      $("advancedDiagnostics").open = true;
      $("boardId").focus();
      throw Error(
        "보드 ID 미확정: 고급 연결 진단에서 직접 입력하거나 내보낸 파일을 이용하세요.",
      );
    }
  } catch (error) {
    text("diagnosis", error.message);
    return;
  }
  if (!requireApiKey()) return;
  let partial = null;
  const candidates = new Map();
  controller = new AbortController();
  const signal = controller.signal;
  setRemoteBusy(true);
  try {
    const id =
      $("boardId").value.trim() || parseBoardUrl($("boardUrl").value).id;
    const request = createApiClient(() => apiSession.get(), {
      signal,
      onProgress: apiProgress,
    });
    const next = await collectBoard(id, request, {
      signal,
      onProgress: apiProgress,
      onPartial: (p) => (partial = p),
    });
    await collectAttachmentInfo(next, request, candidates, {
      signal,
      onProgress: apiProgress,
    });
    remoteUrls = apiSession.has() ? candidates : new Map();
    installProject(next);
    text(
      "diagnosis",
      `현재 출처에서 API 게시물 응답 읽음 · ${next.posts.length}개\n범위: 가져온 API 응답 기준 (${next.coverage.status})\n첨부 파일 확보와 실제 저장은 아래 결과에서 별도로 확인하세요.`,
    );
    text(
      "apiProgress",
      `${signal.aborted ? "중지: 확보한 본문 보존" : "가져온 API 응답 기준"} · 게시물 ${next.posts.length}개\n첨부정보 읽기와 파일 바이트 확보/저장은 별도입니다.\n${next.coverage.warnings.join("\n")}`,
    );
  } catch (error) {
    text(
      "diagnosis",
      signal.aborted
        ? "API 읽기 중지 · 확보 범위는 아래 자료 확인 참조"
        : "API 가져오기 중단 · " +
            error.message +
            "\n키 없이 내보낸 파일로 계속할 수 있습니다.",
    );
    if (partial) {
      partial.coverage.status = "partial";
      partial.coverage.warnings.push("처리 중단: 확보한 본문만 보존");
      remoteUrls = new Map();
      installProject(partial);
      text("apiProgress", "부분 응답 본문 보존 · 첨부 수동 확인 필요");
    } else
      text(
        "apiProgress",
        signal.aborted
          ? "API 읽기 취소 · 기존 자료 유지"
          : error.message + "\n로컬 내보내기 파일로 계속할 수 있습니다.",
      );
  } finally {
    controller = null;
    setRemoteBusy(false);
  }
}

$("collectApi").onclick = importApi;
$("stopRemote").onclick = () => controller?.abort();
$("downloadRemote").onclick = async () => {
  if (busy) return;
  if (!project || !approvedHosts.size) {
    text(
      "apiProgress",
      "목록 상세에서 직접 원본 파일·호스트를 먼저 확인하세요.",
    );
    return;
  }
  controller = new AbortController();
  setRemoteBusy(true);
  try {
    await downloadAttachments(project, assets, remoteUrls, approvedHosts, {
      signal: controller.signal,
      onProgress: apiProgress,
    });
    render();
    text(
      "apiProgress",
      `파일 바이트 확보 완료/부분 처리 · 확보 ${summary(project, assets).uniqueAssets}개 · 미확보 ${summary(project, assets).unresolved}개\n아직 폴더 저장 또는 ZIP 생성 전입니다.`,
    );
  } finally {
    controller = null;
    setRemoteBusy(false);
  }
};

$("dataFile").disabled = true;
startWorker(() => {
  $("dataFile").disabled = busy;
});

const text = (id, s) => {
  const el = $(id);
  if (el) el.textContent = s;
};
const node = (tag, s) => {
  const n = document.createElement(tag);
  if (s !== undefined) n.textContent = s;
  return n;
};
function announce(e) {
  text("importStatus", e.message || String(e));
}
function capabilities() {
  const folder = !!window.showDirectoryPicker && isSecureContext;
  $("saveFolder").disabled = !folder;
  text(
    "capability",
    folder
      ? "폴더 직접 쓰기 지원 감지 · 실제 사용자 승인 필요"
      : "폴더 직접 쓰기 미지원 · ZIP 다운로드를 사용하세요.",
  );
}
capabilities();

function requireApiKey() {
  if ($("apiKey").value.trim()) {
    apiSession.set($("apiKey").value);
    $("apiKey").value = "";
  }
  if (apiSession.has()) {
    text(
      "connectionStatus",
      "키 준비됨 · 현재 탭 메모리만 사용 · API 권한은 요청 결과로 확인",
    );
    return true;
  }
  $("apiConnection").open = true;
  text(
    "diagnosis",
    "API 연결 검사 안 함 · API 키가 입력되지 않았습니다.\n최초 키 입력 후 ‘게시물 가져오기’를 다시 누르세요. 같은 탭에서는 키를 다시 입력하지 않아도 됩니다.\n키가 없다면 ‘API 키 없이 CSV / XLSX · 첨부 ZIP 가져오기’를 이용하세요.",
  );
  $("apiKey").focus();
  return false;
}

$("diagnose").onclick = () => {
  try {
    const b = parseBoardUrl($("boardUrl").value);
    text(
      "diagnosis",
      "주소 형식 확인 · " +
        (b.id
          ? "보드 ID 후보: " + b.id
          : "보드 ID 미확정: 패들렛 Developer 메뉴에서 확인 필요") +
        "\n주소 형식만 확인했습니다. 이 버튼은 API 요청을 보내지 않습니다.\n" +
        (apiSession.has() || $("apiKey").value.trim()
          ? "키 입력됨 · 아래 ‘보드 연결 검사’ 또는 ‘게시물 가져오기’를 누르세요."
          : "API 연결 검사 안 함 · API 키가 필요합니다. 키 없이 쓰려면 내보낸 파일을 가져오세요.") +
        "\n첨부 파일 확보·실제 저장: 아직 수행하지 않음",
    );
    $("apiConnection").open = true;
    $(b.id ? "apiKey" : "boardId").focus();
  } catch (e) {
    text("diagnosis", e.message);
  }
};

async function diagnoseApi(type) {
  if (busy) return;
  if (!requireApiKey()) return;
  setRemoteBusy(true);
  controller = new AbortController();
  try {
    const id =
      type === "board"
        ? $("boardId").value.trim() || parseBoardUrl($("boardUrl").value).id
        : $("postId").value.trim();
    const j = await (type === "board" ? readBoard : readAttachment)(
      id,
      apiSession.get(),
      {
        signal: controller.signal,
      },
    );
    text(
      "diagnosis",
      (type === "board" ? "보드" : "첨부정보") +
        " GET 응답 읽기 성공 · HTTP 200\n" +
        (j.data ? "data 필드 있음" : "data 필드 없음: 스키마 확인 필요") +
        "\n현재 출처에서 이번 요청의 응답을 읽었습니다. 다른 보드·계정·출처의 연결은 확인하지 않았습니다.\n" +
        (type === "board"
          ? "같은 탭에서 키 재입력 없이 ‘게시물 가져오기’를 누르세요.\n"
          : "") +
        "첨부 파일 바이트 확보·실제 저장: 이 검사에서는 수행하지 않음",
    );
  } catch (e) {
    text(
      "diagnosis",
      (controller.signal.aborted
        ? "API 연결 검사 중지"
        : "API 연결 검사 실패 · " + e.message) +
        "\n키 없이 내보낸 파일로 계속할 수 있습니다.",
    );
  } finally {
    controller = null;
    setRemoteBusy(false);
  }
}

$("apiBoard").onclick = () => diagnoseApi("board");
$("apiAttachment").onclick = () => diagnoseApi("attachment");
$("clearKey").onclick = () => {
  $("apiKey").value = "";
  apiSession.clear();
  controller?.abort();
  remoteUrls.clear();
  approvedHosts.clear();
  text("connectionStatus", "연결 해제 상태 · 키 없음");
  text(
    "diagnosis",
    "연결 해제 · 요청 취소 · 키 지움 · 확보한 자료는 유지됩니다.",
  );
};

$("addLocalAssets").onclick = async () => {
  if (busy) return;
  if (!project) {
    text("importStatus", "먼저 게시물을 가져오세요.");
    return;
  }
  if (!$("supplementalFiles").files.length) {
    text("importStatus", "추가할 로컬 첨부를 선택하세요.");
    return;
  }
  setRemoteBusy(true);
  try {
    const added = await localTask("readAssets", [
      ...$("supplementalFiles").files,
    ]);
    if (
      assets.reduce((n, f) => n + f.bytes.length, 0) +
        added.reduce((n, f) => n + f.bytes.length, 0) >
      500 * 1024 * 1024
    )
      throw Error("전체 파일 바이트 예산 초과");
    for (const file of added) {
      file.id = "F-local-" + crypto.randomUUID();
      assets.push(file);
    }
    $("confirmSave").checked = false;
    render();
    text(
      "importStatus",
      `로컬 첨부 ${added.length}개 추가 · 상세의 파일 선택으로 수동 연결하세요. 본문은 유지됩니다.`,
    );
  } catch (error) {
    announce(error);
  } finally {
    setRemoteBusy(false);
  }
};

$("cancel").onclick = () => controller?.abort();
$("cancelLocal").onclick = () => {
  if (!busy || controller) return;
  $("dataFile").disabled = true;
  cancelLocal(() => {
    $("dataFile").disabled = busy;
  });
};

function mapping() {
  const sheet = table.sheets[Number($("sheet").value)];
  const headers = sheet.rows[0] || [];
  const map = suggest(headers);
  $("mapping").replaceChildren();
  for (const [f, label] of Object.entries(fields)) {
    const l = node("label", label),
      s = node("select");
    s.id = "map-" + f;
    const none = node("option", "사용 안 함");
    none.value = -1;
    s.append(none);
    headers.forEach((h, i) => {
      const o = node("option", h || "빈 열 " + (i + 1));
      o.value = i;
      s.append(o);
    });
    s.value = map[f];
    l.append(s);
    $("mapping").append(l);
  }
  if ($("importOptions") && (map.body === -1 || table.sheets.length > 1)) {
    $("importOptions").open = true;
  }
  $("importButton").disabled = false;
}

$("dataFile").onchange = async () => {
  if (busy) return;
  const file = $("dataFile").files[0];
  if (!file) return;
  setRemoteBusy(true);
  try {
    const next = await localTask("readTable", file, $("encoding").value);
    table = next;
    $("sheet").replaceChildren();
    table.sheets.forEach((s, i) => {
      const o = node("option", s.name);
      o.value = i;
      $("sheet").append(o);
    });
    $("sheet").disabled = table.sheets.length < 2;
    mapping();
    text(
      "importStatus",
      `파일 읽기 완료 (${file.name}) · 시트와 열 연결이 자동 설정되었습니다. ‘열 연결 적용 · 바로 정리하기’를 누르세요.`,
    );
  } catch (e) {
    table = null;
    $("importButton").disabled = true;
    announce(e);
  } finally {
    setRemoteBusy(false);
  }
};

$("encoding").onchange = () => $("dataFile").onchange();
$("sheet").onchange = mapping;

async function executeLocalImport() {
  if (busy) return;
  if (!table) return;
  setRemoteBusy(true);
  try {
    const nextAssets = await localTask("readAssets", [
      ...$("attachments").files,
    ]);
    const map = Object.fromEntries(
      Object.keys(fields).map((f) => [f, Number($("map-" + f).value)]),
    );
    const next = normalize(table, Number($("sheet").value), map, nextAssets);
    assets = nextAssets;
    remoteUrls = new Map();
    approvedHosts = new Map();
    project = next;
    active = project.posts[0]?.id;
    quickFilter = "all";
    $("confirmSave").checked = false;
    text("saveResult", "새 자료 가져옴 · 실제 저장 확인 0개");
    $("sectionFilter").replaceChildren(node("option", "📂 모든 섹션"));
    $("sectionFilter").firstChild.value = "";
    for (const s of project.sections) {
      const o = node("option", s.name || "섹션 없음");
      o.value = s.id;
      $("sectionFilter").append(o);
    }
    document.body.classList.add("has-project");
    render();
    text(
      "importStatus",
      "로컬 가져오기 완료 · 내보내기 파일 기준. 전체 보드 수집 여부는 미확인입니다.",
    );
  } catch (e) {
    announce(e);
  } finally {
    setRemoteBusy(false);
  }
}

$("importButton").onclick = executeLocalImport;

// Idea 3: Unified Drag & Drop Upload Box (#dropZone)
const dropZone = $("dropZone");
if (dropZone) {
  dropZone.addEventListener("click", () => {
    if (!busy && !$("dataFile").disabled) $("dataFile").click();
  });
  dropZone.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !busy && !$("dataFile").disabled) {
      e.preventDefault();
      $("dataFile").click();
    }
  });
  for (const evt of ["dragenter", "dragover"]) {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      if (!busy) dropZone.classList.add("drag-over");
    });
  }
  for (const evt of ["dragleave", "drop"]) {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  }
  dropZone.addEventListener("drop", async (e) => {
    if (busy || $("dataFile").disabled) return;
    const dropped = [...(e.dataTransfer?.files || [])];
    if (!dropped.length) return;
    const dataCandidates = dropped.filter((f) =>
      /\.(csv|xlsx|json)$/i.test(f.name),
    );
    const attachCandidates = dropped.filter(
      (f) => !/\.(csv|xlsx|json)$/i.test(f.name),
    );
    if (dataCandidates.length) {
      const dt = new DataTransfer();
      dt.items.add(dataCandidates[0]);
      $("dataFile").files = dt.files;
    }
    if (attachCandidates.length) {
      const dt = new DataTransfer();
      for (const f of attachCandidates) dt.items.add(f);
      $("attachments").files = dt.files;
    }
    if ($("dataFile").files.length) {
      await $("dataFile").onchange();
      if (table && !$("importButton").disabled) {
        await executeLocalImport();
      }
    }
  });
}

// Idea 8: Dashboard Summary Card Click Quick Filters
for (const card of document.querySelectorAll(".metric-card")) {
  card.addEventListener("click", () => {
    if (!project) return;
    const mode = card.dataset.quickFilter || "all";
    quickFilter = mode;
    if (mode === "unresolved") {
      $("typeFilter").value = "unresolved";
    } else if ($("typeFilter").value === "unresolved") {
      $("typeFilter").value = "";
    }
    render();
  });
}

function options() {
  return { author: $("showAuthor").checked, date: $("showDate").checked };
}

function render() {
  if (!project) return;
  const basis =
    project.coverage.basis === "api-response"
      ? "가져온 API 응답 기준"
      : "내보내기 파일 기준";
  text(
    "modeBadge",
    project.sourceMode === "api"
      ? "공식 API · 조건부"
      : project.sourceMode === "mixed"
        ? "혼합 처리"
        : "로컬 가져오기",
  );
  text(
    "coverage",
    project.coverage.warnings.join("\n") +
      (project.coverage.missingPostIds?.length
        ? "\n누락 게시물 ID: " + project.coverage.missingPostIds.join(", ")
        : ""),
  );
  const stats = summary(project, assets);
  text(
    "stats",
    `${basis} · 가져옴 ${stats.postsObserved} · 선택 ${stats.postsSelected} · 본문 ${stats.textProcessed} · 첨부 참조 ${stats.attachmentReferences} · 서로 다른 확보 파일 ${stats.uniqueAssets} · 링크만 ${stats.externalLinks} · 미확보 ${stats.unresolved}`,
  );

  // Update 4 Summary Dashboard Metric Cards
  text("metricTotal", String(stats.postsObserved));
  text("metricSelected", String(stats.postsSelected));
  text("metricAssets", String(stats.uniqueAssets));
  text("metricUnresolved", String(stats.unresolved));
  for (const card of document.querySelectorAll(".metric-card")) {
    const isUnresolvedFilter = $("typeFilter").value === "unresolved";
    const cardMode = card.dataset.quickFilter;
    const isActive = isUnresolvedFilter
      ? cardMode === "unresolved"
      : quickFilter === cardMode;
    card.classList.toggle("active", isActive);
  }

  const unlinkedList = assets
    .filter((f) => !project.attachments.some((a) => a.assetId === f.id))
    .map((f) => f.input + " / " + f.path);
  text(
    "unlinked",
    unlinkedList.length
      ? "미연결 파일: " + unlinkedList.join(" · ")
      : "미연결 파일: 없음",
  );

  $("posts").replaceChildren();
  const q = $("search").value.toLowerCase(),
    section = $("sectionFilter").value,
    type = $("typeFilter").value;

  for (const p of project.posts) {
    const refs = project.attachments.filter((a) => a.postIds.includes(p.id));
    const hasUnresolved = refs.some(
      (a) => !a.assetId && a.status !== "linked_only",
    );
    const hasResolvedAsset = refs.some((a) => !!a.assetId);

    if (
      (section && p.sectionId !== section) ||
      (q &&
        !(String(p.titleOriginal) + " " + p.bodyPlain)
          .toLowerCase()
          .includes(q)) ||
      (type === "body" && !p.bodyOriginal) ||
      (type === "unresolved" && !hasUnresolved) ||
      (type &&
        !["body", "unresolved"].includes(type) &&
        !refs.some((a) => a.mediaKind === type)) ||
      (quickFilter === "selected" && !p.selected) ||
      (quickFilter === "assets" && !hasResolvedAsset)
    )
      continue;

    const card = node("div");
    card.className = "post" + (p.id === active ? " active" : "");
    card.dataset.status = hasUnresolved
      ? "unresolved"
      : refs.length
        ? "resolved"
        : "text";

    const label = node("label"),
      c = node("input");
    c.type = "checkbox";
    c.checked = p.selected;
    c.onchange = () => {
      p.selected = c.checked;
      $("confirmSave").checked = false;
      render();
    };
    label.append(c, document.createTextNode(" " + p.id + " 포함"));

    const b = node("button", p.titleOriginal || "[제목 없음]");
    b.type = "button";
    b.onclick = () => {
      active = p.id;
      for (const item of $("posts").children) item.classList.remove("active");
      card.classList.add("active");
      renderDetail();
    };

    const sectionName =
      project.sections.find((s) => s.id === p.sectionId)?.name || "섹션 없음";
    const attachStatus = hasUnresolved
      ? `⚠️ 미확보 포함 (첨부 ${refs.length})`
      : refs.length
        ? `📎 첨부 ${refs.length}`
        : "📄 글만 있음";

    card.append(
      label,
      b,
      node("p", p.bodyPlain ? p.bodyPlain.slice(0, 90) : "[본문 없음]"),
      node("small", `${attachStatus} · ${sectionName}`),
    );
    $("posts").append(card);
  }
  if (!$("posts").children.length)
    $("posts").append(
      node(
        "p",
        "조건에 맞는 게시물이 없습니다. 검색이나 필터를 변경하세요.",
      ),
    );
  renderDetail();
  const selected = project.posts.filter((x) => x.selected);
  text(
    "original",
    selected.map((p) => `[${p.id}]\n${p.bodyOriginal}`).join("\n\n"),
  );
  const docs = documents(project, assets, options());
  text(
    "organized",
    new TextDecoder().decode(docs.get("02_줄글정리/전체_글모음.txt")),
  );
}

function renderDetail() {
  const p = project?.posts.find((x) => x.id === active);
  $("detail").replaceChildren();
  if (!p) return;

  const sectionName =
    project.sections.find((s) => s.id === p.sectionId)?.name || "섹션 없음";

  // Top meta & view toggle tabs (using span[role=button] to preserve exact button/input selectors in #detail)
  const headBar = node("div");
  headBar.className = "detail-head-bar";
  const badge = node("span", `📂 ${sectionName} · ${p.id}`);
  badge.className = "detail-section-badge";

  const viewSwitch = node("div");
  viewSwitch.className = "detail-view-switch";
  const tabOrg = node("span", "✨ 정리본 보기");
  tabOrg.className =
    "view-pill" + (detailViewMode === "organized" ? " active" : "");
  tabOrg.setAttribute("role", "button");
  tabOrg.tabIndex = 0;
  const tabOrig = node("span", "📄 원문 보기");
  tabOrig.className =
    "view-pill" + (detailViewMode === "original" ? " active" : "");
  tabOrig.setAttribute("role", "button");
  tabOrig.tabIndex = 0;

  tabOrg.onclick = () => {
    detailViewMode = "organized";
    renderDetail();
  };
  tabOrig.onclick = () => {
    detailViewMode = "original";
    renderDetail();
  };
  viewSwitch.append(tabOrg, tabOrig);
  headBar.append(badge, viewSwitch);

  const bodyText =
    detailViewMode === "organized"
      ? formatPostOrganized(p)
      : p.bodyPlain || "[본문 없음]";

  const provenanceP = node(
    "p",
    `원문 위치: ${p.provenance.sourceFile} / ${p.provenance.sheet} / 행 ${p.provenance.row}`,
  );
  provenanceP.className = "detail-provenance";

  const warnP = node("p", p.warnings.join("\n"));
  warnP.className = "detail-warnings";

  $("detail").append(
    headBar,
    node("h3", p.titleOriginal || "[제목 없음]"),
    node("pre", bodyText),
    provenanceP,
    warnP,
  );

  if (safeUrl(p.sourceUrl)) {
    const a = node("a", "🔗 원문 링크 열기 (사용자 동작)");
    a.className = "detail-source-link";
    a.href = safeUrl(p.sourceUrl);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    $("detail").append(a);
  }

  const postAttachments = project.attachments.filter((x) =>
    x.postIds.includes(p.id),
  );
  if (postAttachments.length) {
    const attachHeading = node("h4", `📎 연결된 첨부 자료 (${postAttachments.length}개)`);
    attachHeading.className = "detail-attach-heading";
    $("detail").append(attachHeading);
  }

  for (const a of postAttachments) {
    const d = node("div");
    d.className = "attachment";
    d.dataset.status = a.assetId
      ? "resolved"
      : a.status === "linked_only"
        ? "linked"
        : "unresolved";
    if (a.failure) {
      const failP = node("p", a.failure.message);
      failP.className = "attach-failure";
      d.append(failP);
    }
    if (a.originalStatus)
      d.append(
        node(
          "p",
          `첨부 유형: ${a.type} · 원본 주소/동일성 미검증${a.hasPreview ? " · 미리보기 있음 (요청·저장하지 않음)" : ""}${a.hasEmbed ? " · 임베드 있음 (실행하지 않음)" : ""}`,
        ),
      );
    if (remoteUrls.has(a.id) && !a.assetId && a.status !== "linked_only") {
      const candidate = remoteUrls.get(a.id);
      const host = new URL(candidate).hostname;
      const label = node("label"),
        confirm = node("input");
      confirm.type = "checkbox";
      confirm.checked = approvedHosts.has(a.id);
      confirm.setAttribute("aria-label", a.id + " 첨부 후보/호스트 선택");
      try {
        attachmentUrl(candidate, new Set([host]));
      } catch {
        confirm.disabled = true;
      }
      confirm.onchange = () => {
        if (confirm.checked) approvedHosts.set(a.id, host);
        else approvedHosts.delete(a.id);
        $("confirmSave").checked = false;
      };
      label.append(
        confirm,
        document.createTextNode(
          ` 원본 미확인 첨부 후보를 ${host}에서 요청하겠습니다${confirm.disabled ? " (현재 미지원 호스트/형식: 로컬 첨부 추가·수동 연결 필요)" : ""}`,
        ),
      );
      d.append(label);
    }
    d.append(
      node(
        "p",
        `${a.reference} · ${a.match.status} · ${a.assetId ? "바이트 확보 " + a.bytesReceived + " (아직 저장 확인 아님)" : a.status === "linked_only" ? "링크만 보관" : "미확보"}\n${a.match.evidence}`,
      ),
    );
    const select = node("select");
    select.setAttribute("aria-label", a.id + " 파일 수동 연결");
    const none = node("option", "파일을 선택해 연결 확인");
    none.value = "";
    select.append(none);
    for (const f of assets) {
      const o = node("option", `${f.input} / ${f.path} (${f.bytes.length} B)`);
      o.value = f.id;
      select.append(o);
    }
    select.value = a.assetId || "";
    select.onchange = () => {
      a.assetId = select.value || null;
      a.match = {
        status: a.assetId ? "user_confirmed" : "unmatched",
        evidence: "사용자 수동 연결",
      };
      a.bytesReceived =
        assets.find((f) => f.id === a.assetId)?.bytes.length || 0;
      a.status = a.assetId ? "discovered" : "manual_required";
      if (a.assetId) a.failure = null;
      render();
    };
    d.append(select);
    $("detail").append(d);
  }
}

for (const id of [
  "search",
  "sectionFilter",
  "typeFilter",
  "showAuthor",
  "showDate",
])
  $(id).oninput = render;

for (const [id, selected] of [
  ["selectAll", true],
  ["selectNone", false],
])
  $(id).onclick = () => {
    project?.posts.forEach((p) => (p.selected = selected));
    $("confirmSave").checked = false;
    render();
  };

function checkSave() {
  if (!project || !project.posts.some((p) => p.selected))
    throw Error("먼저 게시물을 가져와 선택하세요.");
  if (!$("confirmSave").checked)
    throw Error("선택 자료와 개인정보 확인란을 체크하세요.");
}

$("saveZip").onclick = () => {
  if (busy) return;
  setRemoteBusy(true);
  try {
    checkSave();
    const files = documents(project, assets, options());
    const records = [...files].map(([path, b]) => ({
      path,
      bytes: b.length,
      status: "packed",
      integrity: "not-checked",
      hash: null,
    }));
    finalize(project, assets, files, records, "zip");
    const bytes = makeZip(files),
      url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    const a = node("a");
    a.href = url;
    a.download = "패들렛정리_" + project.projectId + ".zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    text(
      "saveResult",
      `ZIP 생성 완료 · ${files.size}개 파일 포함 · ${bytes.length} 바이트\n다운로드 시작 · 디스크 저장 여부/위치는 브라우저에서 확인하세요.\n실제 폴더 저장 확인 0개 · 미확보 ${summary(project, assets).unresolved}개`,
    );
  } catch (e) {
    text("saveResult", e.message);
  } finally {
    setRemoteBusy(false);
  }
};

$("saveFolder").onclick = async () => {
  if (busy) return;
  setRemoteBusy(true);
  try {
    checkSave();
    const parent = await window.showDirectoryPicker({ mode: "readwrite" });
    text("saveResult", "새 작업 폴더에 쓰는 중…");
    const result = await writeFolder(
      parent,
      "패들렛정리_" + Date.now() + "_" + project.projectId,
      documents(project, assets, options()),
      project,
      assets,
    );
    text(
      "saveResult",
      `선택 폴더: ${parent.name}\n새 작업 폴더: ${result.name}\n쓰기 종료 확인 ${result.records.filter((r) => r.status === "saved").length}개 · 실패 ${result.records.filter((r) => r.status === "failed").length}개 · 미확보 ${summary(project, assets).unresolved}개\n해시 검증은 수행하지 않았습니다.`,
    );
  } catch (e) {
    text(
      "saveResult",
      e.name === "AbortError"
        ? "폴더 선택 취소 · 정리 자료는 유지됩니다. 다시 선택하거나 ZIP을 사용하세요."
        : e.message,
    );
  } finally {
    setRemoteBusy(false);
  }
};

window.addEventListener("beforeunload", (e) => {
  if (project) {
    e.preventDefault();
    e.returnValue = "";
  }
});
