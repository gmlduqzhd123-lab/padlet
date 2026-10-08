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
const $ = (id) => document.getElementById(id);
let table = null,
  project = null,
  assets = [],
  active = null,
  controller = null,
  busy = false;
let remoteUrls = new Map(),
  approvedHosts = new Map();
function installProject(next, nextAssets = []) {
  project = next;
  assets = nextAssets;
  active = project.posts[0]?.id;
  approvedHosts = new Map();
  $("confirmSave").checked = false;
  $("sectionFilter").replaceChildren(node("option", "모든 섹션"));
  $("sectionFilter").firstChild.value = "";
  for (const s of project.sections) {
    const o = node("option", s.name || "섹션 없음");
    o.value = s.id;
    $("sectionFilter").append(o);
  }
  $("search").value = "";
  $("typeFilter").value = "";
  text("saveResult", "새 자료 가져옴 · 실제 저장 확인 0개");
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
  for (const id of [
    "collectApi",
    "downloadRemote",
    "apiBoard",
    "apiAttachment",
    "saveZip",
  ])
    $(id).disabled = value;
  $("importButton").disabled = value || !table;
  capabilities();
  if (value) $("saveFolder").disabled = true;
  $("dataFile").disabled = value;
}
async function importApi() {
  if (busy) return;
  if (!requireApiKey()) return;
  let key = $("apiKey").value;
  let partial = null;
  const candidates = new Map();
  controller = new AbortController();
  const signal = controller.signal;
  setRemoteBusy(true);
  $("apiKey").value = "";
  try {
    const id =
      $("boardId").value.trim() || parseBoardUrl($("boardUrl").value).id;
    const request = createApiClient(key, { signal, onProgress: apiProgress });
    const next = await collectBoard(id, request, {
      signal,
      onProgress: apiProgress,
      onPartial: (p) => (partial = p),
    });
    await collectAttachmentInfo(next, request, candidates, {
      signal,
      onProgress: apiProgress,
    });
    remoteUrls = candidates;
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
    key = "";
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
const text = (id, s) => ($(id).textContent = s);
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
  if ($("apiKey").value.trim()) return true;
  $("apiConnection").open = true;
  text(
    "diagnosis",
    "API 연결 검사 안 함 · API 키가 입력되지 않았습니다.\n아래 키 입력 후 ‘보드 연결 검사’ 또는 ‘게시물 가져오기’를 누르세요.\n키가 없다면 ‘API 키 없이 CSV / XLSX · 첨부 ZIP 가져오기’를 이용하세요.",
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
        ($("apiKey").value.trim()
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
  let key = $("apiKey").value;
  $("apiKey").value = "";
  try {
    const id =
      type === "board"
        ? $("boardId").value.trim() || parseBoardUrl($("boardUrl").value).id
        : $("postId").value.trim();
    const j = await (type === "board" ? readBoard : readAttachment)(id, key, {
      signal: controller.signal,
    });
    text(
      "diagnosis",
      (type === "board" ? "보드" : "첨부정보") +
        " GET 응답 읽기 성공 · HTTP 200\n" +
        (j.data ? "data 필드 있음" : "data 필드 없음: 스키마 확인 필요") +
        "\n현재 출처에서 이번 요청의 응답을 읽었습니다. 다른 보드·계정·출처의 연결은 확인하지 않았습니다.\n" +
        (type === "board"
          ? "게시물 정리는 키를 다시 입력한 후 ‘공식 API로 게시물 가져오기’를 누르세요.\n"
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
    key = "";
    controller = null;
    setRemoteBusy(false);
  }
}
$("apiBoard").onclick = () => diagnoseApi("board");
$("apiAttachment").onclick = () => diagnoseApi("attachment");
$("clearKey").onclick = () => {
  $("apiKey").value = "";
  controller?.abort();
  text("diagnosis", "키 입력 지움 · 진행 중 진단 중지");
};
$("cancel").onclick = () => controller?.abort();
$("cancelLocal").onclick = () => {
  $("dataFile").disabled = true;
  cancelLocal(() => {
    $("dataFile").disabled = false;
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
      "파일 읽기 완료 · 시트와 열 연결을 확인하세요. 아직 가져오기를 적용하지 않았습니다.",
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
$("importButton").onclick = async () => {
  if (busy) return;
  if (!table) return;
  const button = $("importButton");
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
    $("confirmSave").checked = false;
    text("saveResult", "새 자료 가져옴 · 실제 저장 확인 0개");
    $("sectionFilter").replaceChildren(node("option", "모든 섹션"));
    $("sectionFilter").firstChild.value = "";
    for (const s of project.sections) {
      const o = node("option", s.name || "섹션 없음");
      o.value = s.id;
      $("sectionFilter").append(o);
    }
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
};
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
  text(
    "unlinked",
    "미연결 파일: " +
      assets
        .filter((f) => !project.attachments.some((a) => a.assetId === f.id))
        .map((f) => f.input + " / " + f.path)
        .join(" · "),
  );
  $("posts").replaceChildren();
  const q = $("search").value.toLowerCase(),
    section = $("sectionFilter").value,
    type = $("typeFilter").value;
  for (const p of project.posts) {
    const refs = project.attachments.filter((a) => a.postIds.includes(p.id));
    if (
      (section && p.sectionId !== section) ||
      (q &&
        !(String(p.titleOriginal) + " " + p.bodyPlain)
          .toLowerCase()
          .includes(q)) ||
      (type === "body" && !p.bodyOriginal) ||
      (type === "unresolved" &&
        !refs.some((a) => !a.assetId && a.status !== "linked_only")) ||
      (type &&
        !["body", "unresolved"].includes(type) &&
        !refs.some((a) => a.mediaKind === type))
    )
      continue;
    const card = node("div");
    card.className = "post";
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
    b.onclick = () => {
      active = p.id;
      renderDetail();
    };
    card.append(
      label,
      b,
      node("p", p.bodyPlain.slice(0, 90)),
      node(
        "small",
        `첨부 ${refs.length} · ${project.sections.find((s) => s.id === p.sectionId)?.name || "섹션 없음"}`,
      ),
    );
    $("posts").append(card);
  }
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
  $("detail").append(
    node("h3", p.titleOriginal || "[제목 없음]"),
    node("pre", p.bodyPlain || "[본문 없음]"),
    node(
      "p",
      `원문 위치: ${p.provenance.sourceFile} / ${p.provenance.sheet} / 행 ${p.provenance.row}`,
    ),
    node("p", p.warnings.join("\n")),
  );
  if (safeUrl(p.sourceUrl)) {
    const a = node("a", "원문 링크 열기 (사용자 동작)");
    a.href = safeUrl(p.sourceUrl);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    $("detail").append(a);
  }
  for (const a of project.attachments.filter((x) => x.postIds.includes(p.id))) {
    const d = node("div");
    d.className = "attachment";
    if (a.failure) d.append(node("p", a.failure.message));
    if (remoteUrls.has(a.id) && !a.assetId && a.status !== "linked_only") {
      const candidate = remoteUrls.get(a.id);
      const host = new URL(candidate).hostname;
      const label = node("label"),
        confirm = node("input");
      confirm.type = "checkbox";
      confirm.checked = approvedHosts.has(a.id);
      confirm.setAttribute("aria-label", a.id + " 직접 원본/호스트 확인");
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
          ` 직접 원본 파일과 호스트 ${host}를 확인했습니다${confirm.disabled ? " (현재 미지원 호스트/형식: 수동 확보 필요)" : ""}`,
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
  }
};
$("saveFolder").onclick = async () => {
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
  }
};
window.addEventListener("beforeunload", (e) => {
  if (project) {
    e.preventDefault();
    e.returnValue = "";
  }
});
