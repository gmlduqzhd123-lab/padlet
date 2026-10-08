import { plainText, organize, safeUrl, utf8 } from "./security.js";
import { kind } from "./local-import.js";
import { LIMITS } from "./config.js";
import { abortError } from "./api-client.js";
import { normalizeAttachmentData, publicViewUrl } from "./attachment-info.js";
import { attachmentUrl } from "./attachment-download.js";

const candidateUrls = new WeakMap();
export function boardPath(id) {
  if (!/^[a-zA-Z0-9]{16,22}$/.test(id)) throw Error("보드 ID를 확인하세요.");
  return "/v1/boards/" + id + "?include=posts,sections";
}
function nextPage(value, id) {
  if (!value) return null;
  const href = typeof value === "string" ? value : value.href;
  const u = new URL(href, "https://api.padlet.dev");
  if (
    u.origin !== "https://api.padlet.dev" ||
    u.username ||
    u.password ||
    u.pathname !== "/v1/boards/" + id
  )
    throw Error("다음 페이지의 API 출처/보드가 일치하지 않습니다.");
  return u.href;
}
export function mapBoard(pages, id) {
  const board = pages[0]?.data;
  if (!board || board.type !== "board" || board.id !== id)
    throw Error("응답의 보드 ID 또는 JSON:API 구조가 일치하지 않습니다.");
  const included = new Map(),
    expected = new Set();
  let known = false;
  for (const page of pages) {
    if (page.data?.id !== id || page.data?.type !== "board")
      throw Error("응답 보드 불일치");
    if (!Array.isArray(page.included ?? []))
      throw Error("included 배열 구조가 잘못되었습니다.");
    for (const obj of page.included ?? [])
      included.set(obj.type + ":" + obj.id, obj);
    const rel = page.data.relationships?.posts?.data;
    if (Array.isArray(rel)) {
      known = true;
      for (const ref of rel) if (ref.type === "post") expected.add(ref.id);
    }
  }
  const rawPosts = [...included.values()]
    .filter((x) => x.type === "post" && (!known || expected.has(x.id)))
    .sort(
      (a, b) => (a.attributes?.sortIndex ?? 0) - (b.attributes?.sortIndex ?? 0),
    );
  if (rawPosts.length > LIMITS.entries) throw Error("게시물 5,000개 예산 초과");
  const rawSections = [...included.values()]
    .filter((x) => x.type === "section")
    .sort(
      (a, b) => (a.attributes?.sortIndex ?? 0) - (b.attributes?.sortIndex ?? 0),
    );
  const sections = rawSections.map((s, i) => ({
    id: "S-" + String(i + 1).padStart(3, "0"),
    sourceSectionId: s.id,
    name: s.attributes?.title ?? "",
  }));
  let total = 0;
  const attachments = [],
    candidates = new Map();
  const posts = rawPosts.map((raw, i) => {
    if (typeof raw.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id))
      throw Error("게시물 ID 구조 미확인");
    if (
      raw.relationships?.board?.data?.id &&
      raw.relationships.board.data.id !== id
    )
      throw Error("게시물의 원본 보드 관계가 일치하지 않습니다.");
    const attr = raw.attributes ?? {},
      content = attr.content ?? {};
    const original = content.bodyHtml ?? "";
    if (typeof original !== "string")
      throw Error("지원하지 않는 게시물 본문 구조");
    const bytes = utf8(original).length;
    total += bytes;
    if (bytes > LIMITS.post || total > LIMITS.text)
      throw Error("본문 예산 초과");
    const sectionId = raw.relationships?.section?.data?.id;
    let section = sections.find(
      (x) => x.sourceSectionId === (sectionId ?? null),
    );
    if (!section) {
      section = {
        id: "S-" + String(sections.length + 1).padStart(3, "0"),
        sourceSectionId: sectionId ?? null,
        name: sectionId ? "섹션 정보 미확보" : "",
      };
      sections.push(section);
    }
    const pid = "P-" + String(i + 1).padStart(4, "0");
    const source = publicViewUrl(attr.webUrl?.live);
    const p = {
      id: pid,
      sourcePostId: raw.id,
      sectionId: section.id,
      titleOriginal:
        typeof content.subject === "string" ? content.subject : null,
      bodyOriginal: original,
      bodyPlain: plainText(original),
      bodyOrganized: organize(plainText(original)),
      createdAtOriginal: attr.createdAt ?? null,
      authorOriginal: attr.author?.fullName ?? attr.author?.shortName ?? null,
      sourceUrl: source,
      provenance: {
        sourceObjectId: raw.id,
        sourceFile: "공식 API 응답",
        sheet: "board " + id,
        row: i + 1,
      },
      sourceStatus: attr.status ?? null,
      selected: attr.status === "approved",
      attachmentIds: [],
      warnings: [],
    };
    if (attr.status !== "approved")
      p.warnings.push("승인 상태가 아니거나 상태 미확인: 기본 선택 제외");
    if (sectionId && !rawSections.some((s) => s.id === sectionId))
      p.warnings.push("섹션 정보 미확보");
    if (/<(table|math|del|s|strike)\b/i.test(original))
      p.warnings.push("서식 변환 주의: 원문 확인");
    if (content.attachment?.url || content.attachment?.poll) {
      const url = safeUrl(content.attachment.url),
        type = url ? kind(url) : "unknown";
      const a = {
        id: "A-" + String(attachments.length + 1).padStart(4, "0"),
        postIds: [pid],
        reference: source || "원문 링크 미확보",
        originalName: "첨부정보 확인 필요",
        originalStatus: "unverified",
        type: "unknown",
        mediaKind: type,
        sourceUrl: null,
        assetId: null,
        match: { status: "unmatched", evidence: "공식 첨부정보 읽기 전" },
        status: "manual_required",
        bytesReceived: 0,
        hash: null,
        integrity: "not-checked",
        failure: null,
      };
      attachments.push(a);
      p.attachmentIds.push(a.id);
      candidates.set(a.id, { url, poll: !!content.attachment.poll });
    }
    return p;
  });
  const missing = known
    ? [...expected].filter((x) => !rawPosts.some((p) => p.id === x))
    : [];
  const project = {
    schemaVersion: "1.0",
    projectId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    sourceMode: "api",
    board: {
      id,
      title: board.attributes?.title ?? "",
      sourceUrl: publicViewUrl(board.attributes?.webUrl?.live),
      provenance: "api-response",
    },
    coverage: {
      basis: "api-response",
      expectedPosts: known ? expected.size : null,
      observedPosts: posts.length,
      selectedPosts: posts.filter((x) => x.selected).length,
      status: missing.length
        ? "partial"
        : known
          ? "checked-within-source"
          : "unknown",
      missingPostIds: missing,
      warnings: known
        ? ["가져온 API 응답 범위만 확인했습니다."]
        : ["게시물 관계 목록이 없어 원본 범위 미확인"],
    },
    sections,
    posts,
    attachments,
  };
  candidateUrls.set(project, candidates);
  return project;
}
export async function collectBoard(
  id,
  request,
  { signal, onProgress = () => {}, onPartial = () => {} } = {},
) {
  let path = boardPath(id);
  const seen = new Set(),
    pages = [];
  let bytes = 0;
  while (path) {
    if (signal?.aborted) throw abortError();
    if (seen.has(path) || seen.size >= 100)
      throw Error("다음 페이지 반복 또는 100페이지 예산 초과");
    seen.add(path);
    let page;
    try {
      page = await request(path);
    } catch (error) {
      if (!pages.length) throw error;
      const partial = mapBoard(pages, id);
      partial.coverage.status = "partial";
      partial.coverage.warnings.push(
        signal?.aborted
          ? "읽기 취소: 확보한 응답만 보존"
          : "후속 페이지 실패: 확보한 응답만 보존",
      );
      return partial;
    }
    bytes += utf8(JSON.stringify(page)).length;
    if (bytes > LIMITS.text) throw Error("API 응답 예산 초과");
    pages.push(page);
    const partial = mapBoard(pages, id);
    onPartial(partial);
    onProgress({ phase: "board", posts: partial.posts.length });
    try {
      path = nextPage(page.links?.next, id);
    } catch {
      partial.coverage.status = "partial";
      partial.coverage.warnings.push(
        "검증되지 않은 다음 페이지를 차단했습니다.",
      );
      return partial;
    }
  }
  return mapBoard(pages, id);
}
export async function collectAttachmentInfo(
  project,
  request,
  ephemeral,
  { signal, onProgress = () => {} } = {},
) {
  for (const post of project.posts) {
    if (!post.attachmentIds.length) continue;
    if (signal?.aborted) break;
    const a = project.attachments.find((x) =>
      post.attachmentIds.includes(x.id),
    );
    try {
      const response = await request(
        "/v1/posts/" +
          encodeURIComponent(post.sourcePostId) +
          "/attachmentData",
      );
      const info = normalizeAttachmentData(
        response,
        candidateUrls.get(project)?.get(a.id),
      );
      Object.assign(a, info.metadata);
      a.match.evidence =
        "공식 첨부정보 해석 · 원본 주소 미확인 · " + info.metadata.type;
      if (info.candidate) ephemeral.set(a.id, info.candidate);
      a.status =
        info.metadata.type === "external_view"
          ? "linked_only"
          : "manual_required";
      if (info.candidate) {
        try {
          attachmentUrl(
            info.candidate,
            new Set([new URL(info.candidate).hostname]),
          );
        } catch (error) {
          a.status =
            error.category === "host" ? "unsupported_host" : "manual_required";
          a.failure = {
            category: error.category || "format",
            message: error.message,
          };
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        a.status = "cancelled";
        break;
      }
      a.status = "failed";
      a.failure = {
        category: "metadata",
        httpStatus: error.httpStatus ?? null,
        providerCode: error.providerCode ?? null,
        message:
          "첨부정보 읽기 실패 · " + error.message + " · 원문에서 수동 확인",
      };
    } finally {
      candidateUrls.get(project)?.delete(a.id);
    }
    onProgress({ phase: "attachment-info", id: a.id, status: a.status });
  }
  candidateUrls.delete(project);
  if (signal?.aborted)
    for (const a of project.attachments)
      if (a.match.evidence === "공식 첨부정보 읽기 전") a.status = "cancelled";
}
