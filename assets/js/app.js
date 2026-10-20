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
import { safeUrl, safeName, utf8 } from "./security.js";
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

let table = null,
  project = null,
  assets = [],
  active = null,
  controller = null,
  busy = false,
  quickFilter = "all",
  detailViewMode = "organized",
  autoImportTimer = null,
  isSampleMode = false,
  detailBlobUrls = [];
let remoteUrls = new Map(),
  approvedHosts = new Map();

function clearDetailBlobs() {
  for (const u of detailBlobUrls) {
    try {
      URL.revokeObjectURL(u);
    } catch {}
  }
  detailBlobUrls = [];
}

async function copyTextWithFeedback(value, targetEl, defaultLabel) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  if (targetEl) {
    targetEl.textContent = "✅ 복사 완료!";
    setTimeout(() => {
      targetEl.textContent = defaultLabel;
    }, 1600);
  }
}

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

function showResultView() {
  document.body.classList.add("has-project");
  if ($("startScreen")) $("startScreen").hidden = true;
  if ($("resultScreen")) $("resultScreen").hidden = false;
  if ($("resetProjectBtn")) $("resetProjectBtn").hidden = false;
  if ($("sampleModePill")) $("sampleModePill").hidden = !isSampleMode;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function installProject(next, nextAssets = [], sampleFlag = false) {
  project = next;
  assets = nextAssets;
  isSampleMode = sampleFlag;
  active = project.posts[0]?.id;
  approvedHosts = new Map();
  quickFilter = "all";
  if ($("confirmSave")) $("confirmSave").checked = true;
  $("sectionFilter").replaceChildren(node("option", "📂 모든 섹션(모둠)"));
  $("sectionFilter").firstChild.value = "";
  for (const s of project.sections) {
    const o = node("option", s.name || "섹션 없음");
    o.value = s.id;
    $("sectionFilter").append(o);
  }
  $("search").value = "";
  $("typeFilter").value = "";
  text("saveResult", "");
  showResultView();
  render();
}

function resetProject() {
  if (busy) return;
  clearTimeout(autoImportTimer);
  clearDetailBlobs();
  table = null;
  project = null;
  assets = [];
  active = null;
  isSampleMode = false;
  quickFilter = "all";
  remoteUrls = new Map();
  approvedHosts = new Map();
  document.body.classList.remove("has-project");
  if ($("resultScreen")) $("resultScreen").hidden = true;
  if ($("startScreen")) $("startScreen").hidden = false;
  if ($("resetProjectBtn")) $("resetProjectBtn").hidden = true;
  if ($("sampleModePill")) $("sampleModePill").hidden = true;
  if ($("dataFile")) $("dataFile").value = "";
  if ($("attachments")) $("attachments").value = "";
  if ($("supplementalFiles")) $("supplementalFiles").value = "";
  if ($("exportName")) $("exportName").value = "";
  text("dataFileLabel", "엑셀 · CSV 파일 찾아보기");
  text("attachmentsLabel", "+ 첨부 ZIP · 파일 추가 (선택)");
  if ($("triggerAttachments")) $("triggerAttachments").classList.remove("has-files");
  if ($("sheet")) {
    $("sheet").replaceChildren();
    $("sheet").disabled = true;
  }
  if ($("mapping")) $("mapping").replaceChildren();
  if ($("importOptions")) $("importOptions").open = false;
  if ($("importButton")) $("importButton").disabled = true;
  text("importStatus", "");
  text("modeBadge", "로컬 가져오기");
  text("metricTotal", "0");
  text("metricSelected", "0");
  text("metricAssets", "0");
  text("metricUnresolved", "0");
  text("stats", "내보내기 파일 기준 · 아직 가져온 자료가 없습니다.");
  text("coverage", "");
  text("unlinked", "");
  text("original", "");
  text("organized", "");
  text("saveResult", "");
  $("sectionFilter").replaceChildren(node("option", "📂 모든 섹션(모둠)"));
  $("sectionFilter").firstChild.value = "";
  $("search").value = "";
  $("typeFilter").value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if ($("resetProjectBtn")) $("resetProjectBtn").onclick = resetProject;
if ($("resetWorkspaceBtn")) $("resetWorkspaceBtn").onclick = resetProject;
if ($("brandHomeLink")) {
  $("brandHomeLink").addEventListener("click", (e) => {
    if (project) {
      e.preventDefault();
      resetProject();
    }
  });
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
    "quickCopyAll",
    "diagnose",
    "boardUrl",
    "boardId",
    "apiKey",
    "attachments",
    "triggerDataFile",
    "triggerAttachments",
    "supplementalFiles",
    "addLocalAssets",
    "selectAll",
    "selectNone",
    "search",
    "sectionFilter",
    "typeFilter",
  ])
    if ($(id)) $(id).disabled = value;
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
      ? "크롬·엣지 브라우저에서 폴더 직접 저장이 가능합니다."
      : "현재 브라우저는 ZIP 파일 다운로드를 지원합니다.",
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
    text("saveResult", "먼저 게시물을 가져오세요.");
    return;
  }
  if (!$("supplementalFiles").files.length) {
    text("saveResult", "추가할 첨부파일을 먼저 선택하세요.");
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
    $("confirmSave").checked = true;
    render();
    text(
      "saveResult",
      `✅ 첨부파일 ${added.length}개가 추가되었습니다. 오른쪽 상세 화면에서 파일을 연결해 주세요.`,
    );
  } catch (error) {
    text("saveResult", error.message || String(error));
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
  if ($("importOptions") && map.body === -1) {
    $("importOptions").open = true;
  }
  $("importButton").disabled = false;
  return map;
}

function scheduleAutoImport() {
  clearTimeout(autoImportTimer);
  autoImportTimer = setTimeout(() => {
    autoImportTimer = null;
    if (!busy && table && !$("importButton").disabled) {
      const bodySelect = $("map-body");
      if (!bodySelect || Number(bodySelect.value) !== -1) {
        executeLocalImport();
      }
    }
  }, 150);
}

$("dataFile").onchange = async () => {
  if (busy) return;
  clearTimeout(autoImportTimer);
  const file = $("dataFile").files[0];
  if (!file) {
    text("dataFileLabel", "엑셀 · CSV 파일 찾아보기");
    return;
  }
  text("dataFileLabel", `선택됨: ${file.name}`);
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
    const map = mapping();
    if ($("exportName")) {
      $("exportName").value = file.name.replace(/\.(csv|xlsx|json)$/i, "");
    }
    if (map.body !== -1) {
      text("importStatus", `⏳ '${file.name}' 파일을 정리하고 있습니다...`);
      scheduleAutoImport();
    } else {
      text(
        "importStatus",
        "⚠️ 아래 상세 설정에서 '본문'에 해당하는 열을 선택해 주세요.",
      );
    }
  } catch (e) {
    table = null;
    $("importButton").disabled = true;
    announce(e);
  } finally {
    setRemoteBusy(false);
  }
};

$("attachments").onchange = () => {
  const count = $("attachments").files.length;
  if (count > 0) {
    text("attachmentsLabel", `📎 첨부파일 ${count}개 선택됨 (변경 가능)`);
    if ($("triggerAttachments")) $("triggerAttachments").classList.add("has-files");
  } else {
    text("attachmentsLabel", "+ 첨부 ZIP · 파일 추가 (선택)");
    if ($("triggerAttachments")) $("triggerAttachments").classList.remove("has-files");
  }
  if (table && !busy) {
    scheduleAutoImport();
  } else if (count) {
    text(
      "importStatus",
      `📎 첨부파일 ${count}개가 선택되었습니다. 이제 왼쪽 'STEP 1 · 필수'에서 게시물 파일을 선택하세요!`,
    );
  }
};

$("encoding").onchange = () => $("dataFile").onchange();
$("sheet").onchange = () => {
  mapping();
  scheduleAutoImport();
};

async function executeLocalImport() {
  clearTimeout(autoImportTimer);
  autoImportTimer = null;
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
    remoteUrls = new Map();
    installProject(next, nextAssets, false);
    text("importStatus", "");
  } catch (e) {
    announce(e);
  } finally {
    setRemoteBusy(false);
  }
}

$("importButton").onclick = executeLocalImport;

// ‘✨ 예시 자료로 1초 체험하기’ 버튼 (#loadSampleBtn)
const SAMPLE_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABLSURBVHhe7c6xCQAgDAVRR7H/pnbxEHCQ8JJv5s4c6Nba+wYICBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAgScGt7sB8W6N5nUAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);

if ($("loadSampleBtn")) {
  $("loadSampleBtn").addEventListener("click", () => {
    if (busy) return;
    const sampleRows = [
      ["제목", "본문", "섹션", "작성자", "작성일", "원문 링크", "첨부", "id"],
      [
        "우리 학교 분리배출 캠페인 아이디어",
        "우유팩을 씻어서 말린 뒤 모아두는 전용 수거함을 급식실 앞에 설치하면 좋겠습니다.\n\n- 역할 분담: 환경 동아리\n- 준비물: 안내 포스터와 수거 바구니",
        "1모둠 · 학교 환경 지키기",
        "김하늘",
        "2026-10-18",
        "https://padlet.com/example/board-abcdefghijklmnop",
        "캠페인_포스터_예시.png\n활동계획서_1모둠.txt",
        "sample-1",
      ],
      [
        "교실 일회용품 줄이기 실천 기록",
        "일주일 동안 개인 물병(텀블러) 쓰기 챌린지를 진행했습니다.\n\n학급 전체 참여율이 92%로 높아졌고 쓰레기통이 훨씬 깨끗해졌습니다.",
        "1모둠 · 학교 환경 지키기",
        "이바다",
        "2026-10-19",
        "https://padlet.com/example/board-abcdefghijklmnop",
        "",
        "sample-2",
      ],
      [
        "우리 동네 공원 생태 탐사 보고서",
        "학교 옆 근린공원에서 관찰한 식물과 곤충 목록을 정리했습니다.\n\n단풍나무, 은행나무, 무당벌레, 참새를 관찰하고 특징을 기록했습니다.",
        "2모둠 · 우리 동네 생태 지도",
        "박초록",
        "2026-10-20",
        "https://padlet.com/example/board-abcdefghijklmnop",
        "생태탐사_관찰기록.txt",
        "sample-3",
      ],
    ];
    const sampleTable = {
      sourceFile: "5학년1반_환경수업_예시.csv",
      sheets: [{ name: "게시물", rows: sampleRows, links: {} }],
    };
    const sampleAssets = [
      {
        id: "F-0001",
        input: "예시첨부.zip",
        path: "캠페인_포스터_예시.png",
        name: "캠페인_포스터_예시.png",
        bytes: SAMPLE_PNG_BYTES,
      },
      {
        id: "F-0002",
        input: "예시첨부.zip",
        path: "활동계획서_1모둠.txt",
        name: "활동계획서_1모둠.txt",
        bytes: utf8(
          "[1모둠 활동계획서]\n1. 목표: 우유팩 재활용 수거함 운영\n2. 기간: 10월 3주~4주",
        ),
      },
      {
        id: "F-0003",
        input: "예시첨부.zip",
        path: "생태탐사_관찰기록.txt",
        name: "생태탐사_관찰기록.txt",
        bytes: utf8(
          "[2모둠 생태탐사 기록]\n관찰 장소: 학교 옆 근린공원\n관찰 생물: 단풍나무, 은행나무, 무당벌레",
        ),
      },
    ];
    table = sampleTable;
    $("sheet").replaceChildren(node("option", "게시물"));
    $("sheet").firstChild.value = 0;
    $("sheet").disabled = true;
    const map = mapping();
    const next = normalize(sampleTable, 0, map, sampleAssets);
    remoteUrls = new Map();
    if ($("exportName")) $("exportName").value = "5학년1반_환경수업_예시";
    installProject(next, sampleAssets, true);
  });
}

// 전체 원문 / 전체 정리본 원클릭 복사 버튼
if ($("quickCopyAll")) {
  $("quickCopyAll").addEventListener("click", () => {
    copyTextWithFeedback(
      $("organized")?.textContent || "",
      $("quickCopyAll"),
      "📋 전체 글 한 번에 복사",
    );
  });
}
if ($("copyAllOriginal")) {
  $("copyAllOriginal").addEventListener("click", () => {
    copyTextWithFeedback(
      $("original")?.textContent || "",
      $("copyAllOriginal"),
      "📋 전체 원문 복사",
    );
  });
}
if ($("copyAllOrganized")) {
  $("copyAllOrganized").addEventListener("click", () => {
    copyTextWithFeedback(
      $("organized")?.textContent || "",
      $("copyAllOrganized"),
      "📋 전체 정리본 복사",
    );
  });
}

// Unified Drag & Drop Upload Box (#dropZone & #secondaryZone)
if ($("triggerDataFile")) {
  $("triggerDataFile").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!busy && !$("dataFile").disabled) $("dataFile").click();
  });
}
if ($("triggerAttachments")) {
  $("triggerAttachments").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!busy && !$("attachments").disabled) $("attachments").click();
  });
}

const secondaryZone = $("secondaryZone");
if (secondaryZone) {
  secondaryZone.addEventListener("click", (e) => {
    if (e.target === $("attachments") || e.target.closest("#triggerAttachments")) return;
    if (!busy && !$("attachments").disabled) $("attachments").click();
  });
  for (const evt of ["dragenter", "dragover"]) {
    secondaryZone.addEventListener(evt, (e) => {
      e.preventDefault();
      if (!busy) secondaryZone.classList.add("drag-over");
    });
  }
  for (const evt of ["dragleave", "drop"]) {
    secondaryZone.addEventListener(evt, (e) => {
      e.preventDefault();
      secondaryZone.classList.remove("drag-over");
    });
  }
  secondaryZone.addEventListener("drop", (e) => {
    if (busy || $("attachments").disabled) return;
    const dropped = [...(e.dataTransfer?.files || [])];
    if (!dropped.length) return;
    const dt = new DataTransfer();
    for (const f of dropped) dt.items.add(f);
    $("attachments").files = dt.files;
    $("attachments").onchange();
  });
}

const dropZone = $("dropZone");
if (dropZone) {
  dropZone.addEventListener("click", (e) => {
    if (e.target === $("dataFile") || e.target.closest("#triggerDataFile")) return;
    if (!busy && !$("dataFile").disabled) $("dataFile").click();
  });
  dropZone.addEventListener("keydown", (e) => {
    if (
      (e.key === "Enter" || e.key === " ") &&
      !busy &&
      !$("dataFile").disabled
    ) {
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

// Dashboard Summary Card Click Quick Filters
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

  // 상단 완료 배너 제목 업데이트
  text(
    "resultHeadline",
    isSampleMode
      ? `🎉 예시 게시물 ${stats.postsObserved}개와 첨부파일 ${stats.uniqueAssets}개가 준비되었습니다!`
      : `🎉 총 ${stats.postsObserved}개의 게시물이 깔끔하게 정리되었습니다!`,
  );
  text(
    "resultSubline",
    isSampleMode
      ? "오른쪽 [📦 ZIP 파일로 바로 다운로드]를 눌러보거나, 아래에서 글을 클릭해 확인해 보세요. 끝내려면 [🔄 다른 파일 올리기 (리셋)]를 누르세요."
      : `저장할 게시물 ${stats.postsSelected}개 · 연결된 첨부파일 ${stats.uniqueAssets}개 · 오른쪽 버튼으로 지금 바로 다운로드하거나 글을 복사하세요.`,
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
    .map((f) => f.path);
  text(
    "unlinked",
    unlinkedList.length
      ? "💡 아직 글에 연결되지 않은 추가 파일(ZIP 저장 시 함께 보관됨): " +
          unlinkedList.join(", ")
      : "",
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
      render();
    };
    const authorTag = p.authorOriginal ? ` · ✍️ ${p.authorOriginal}` : "";
    label.append(c, document.createTextNode(` 저장에 포함${authorTag}`));

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
      ? `⚠️ 첨부 확인 필요 (${refs.length}개)`
      : refs.length
        ? `📎 첨부 ${refs.length}개`
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

function getSafeImageMime(pathStr) {
  const lower = String(pathStr || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function renderDetail() {
  clearDetailBlobs();
  const p = project?.posts.find((x) => x.id === active);
  $("detail").replaceChildren();
  if (!p) return;

  const sectionName =
    project.sections.find((s) => s.id === p.sectionId)?.name || "섹션 없음";

  const headBar = node("div");
  headBar.className = "detail-head-bar";
  const badge = node(
    "span",
    `📂 ${sectionName}${p.authorOriginal ? " · ✍️ " + p.authorOriginal : ""}`,
  );
  badge.className = "detail-section-badge";

  const bodyText =
    detailViewMode === "organized"
      ? formatPostOrganized(p)
      : p.bodyPlain || "[본문 없음]";

  const viewSwitch = node("div");
  viewSwitch.className = "detail-view-switch";
  const tabOrg = node("span", "✨ 깔끔한 정리본");
  tabOrg.className =
    "view-pill" + (detailViewMode === "organized" ? " active" : "");
  tabOrg.setAttribute("role", "button");
  tabOrg.tabIndex = 0;
  const tabOrig = node("span", "📄 원문 그대로");
  tabOrig.className =
    "view-pill" + (detailViewMode === "original" ? " active" : "");
  tabOrig.setAttribute("role", "button");
  tabOrig.tabIndex = 0;
  const copyBtn = node("span", "📋 이 글 복사");
  copyBtn.className = "view-pill copy-pill";
  copyBtn.setAttribute("role", "button");
  copyBtn.tabIndex = 0;

  tabOrg.onclick = () => {
    detailViewMode = "organized";
    renderDetail();
  };
  tabOrig.onclick = () => {
    detailViewMode = "original";
    renderDetail();
  };
  copyBtn.onclick = () => {
    copyTextWithFeedback(bodyText, copyBtn, "📋 이 글 복사");
  };
  viewSwitch.append(tabOrg, tabOrig, copyBtn);
  headBar.append(badge, viewSwitch);

  const warnP = node("p", p.warnings.join("\n"));
  warnP.className = "detail-warnings";

  $("detail").append(
    headBar,
    node("h3", p.titleOriginal || "[제목 없음]"),
    node("pre", bodyText),
    warnP,
  );

  if (safeUrl(p.sourceUrl)) {
    const a = node("a", "🔗 패들렛 원문 링크 열기");
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
    const attachHeading = node(
      "h4",
      `📎 첨부파일 (${postAttachments.length}개)`,
    );
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

    if (a.assetId) {
      const matchedAsset = assets.find((f) => f.id === a.assetId);
      const imgMime =
        matchedAsset && getSafeImageMime(matchedAsset.path || matchedAsset.name);
      if (matchedAsset && imgMime && matchedAsset.bytes?.length) {
        const blobUrl = URL.createObjectURL(
          new Blob([matchedAsset.bytes], { type: imgMime }),
        );
        detailBlobUrls.push(blobUrl);
        const img = node("img");
        img.className = "attach-thumb";
        img.src = blobUrl;
        img.alt = `${matchedAsset.name || a.reference} 미리보기`;
        d.append(img);
      }
    }

    const statusLabel = a.assetId
      ? `✅ 연결 완료: ${a.reference}`
      : a.status === "linked_only"
        ? `🔗 외부 링크: ${a.reference}`
        : `⚠️ 파일 확인 필요: ${a.reference} (아래에서 연결할 파일을 선택하세요)`;
    d.append(node("p", statusLabel));

    if (!a.assetId && assets.length > 0 && a.status !== "linked_only") {
      const select = node("select");
      select.setAttribute("aria-label", a.id + " 파일 수동 연결");
      const none = node("option", "연결할 첨부파일 직접 선택...");
      none.value = "";
      select.append(none);
      for (const f of assets) {
        const o = node("option", `${f.path} (${f.bytes.length} B)`);
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
    }
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
    render();
  };

function getExportBaseName() {
  const custom = $("exportName")?.value.trim();
  if (custom) {
    return safeName(custom) + "_패들렛정리";
  }
  return "패들렛정리_" + project.projectId;
}

function checkSave() {
  if (!project || !project.posts.some((p) => p.selected))
    throw Error("먼저 저장할 게시물을 하나 이상 체크해 주세요.");
  if ($("confirmSave") && !$("confirmSave").checked) {
    $("confirmSave").checked = true;
  }
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
    a.download = getExportBaseName() + ".zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    text(
      "saveResult",
      `✅ '${a.download}' 다운로드가 시작되었습니다! (포함된 파일 ${files.size}개 · 브라우저 다운로드 폴더를 확인하세요)`,
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
    text("saveResult", "⏳ 선택한 폴더 안에 새 정리 폴더를 만들고 있습니다…");
    const folderName = getExportBaseName() + "_" + Date.now();
    const result = await writeFolder(
      parent,
      folderName,
      documents(project, assets, options()),
      project,
      assets,
    );
    text(
      "saveResult",
      `✅ '${parent.name}/${result.name}' 폴더에 파일 ${result.records.filter((r) => r.status === "saved").length}개를 저장했습니다!`,
    );
  } catch (e) {
    text(
      "saveResult",
      e.name === "AbortError"
        ? "폴더 선택이 취소되었습니다. 다시 선택하거나 위의 [📦 ZIP 파일로 바로 다운로드]를 눌러주세요."
        : e.message,
    );
  } finally {
    setRemoteBusy(false);
  }
};

window.addEventListener("beforeunload", (e) => {
  if (project && !isSampleMode) {
    e.preventDefault();
    e.returnValue = "";
  }
});
