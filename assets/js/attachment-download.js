import { LIMITS } from "./config.js";
import { abortError } from "./api-client.js";
export const SUPPORTED_ATTACHMENT_HOSTS = new Set(["cdn.padlet.dev"]);
const extensions = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "mp4",
  "webm",
  "mov",
  "mp3",
  "wav",
  "m4a",
  "pdf",
  "hwpx",
  "hwp",
  "docx",
  "xlsx",
  "pptx",
  "txt",
  "csv",
  "zip",
]);
export function attachmentUrl(value, allowedHosts) {
  const u = new URL(value);
  const host = u.hostname.toLowerCase();
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !SUPPORTED_ATTACHMENT_HOSTS.has(host) ||
    !allowedHosts.has(host)
  )
    throw Error("승인되지 않은 첨부 호스트 또는 안전하지 않은 주소");
  const name = decodeURIComponent(u.pathname.split("/").at(-1)),
    ext = name.split(".").at(-1).toLowerCase();
  if (!extensions.has(ext))
    throw Error(
      "직접 파일 형식을 확인할 수 없습니다. 외부 보기 링크는 수동 확인하세요.",
    );
  return u;
}
// Deliberately separate from requestApi: never accepts a key or any caller headers.
export async function fetchAttachment(
  value,
  allowedHosts,
  {
    fetcher = fetch,
    signal,
    budget = { received: 0 },
    onBytes = () => {},
  } = {},
) {
  const u = attachmentUrl(value, allowedHosts);
  const response = await fetcher(u.href, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok) throw Error("첨부 HTTP 응답 실패");
  if (response.redirected) throw Error("첨부 리다이렉트 차단");
  if (response.type === "opaque") throw Error("첨부 응답을 읽을 수 없습니다.");
  const mime = response.headers.get("content-type") || "";
  if (/text\/html|application\/json|javascript|image\/svg/i.test(mime))
    throw Error("로그인 HTML·오류 JSON 또는 지원하지 않는 실행 형식 응답");
  const ext = u.pathname.split(".").at(-1).toLowerCase();
  const expected = /^(png|jpe?g|gif|webp)$/.test(ext)
    ? "image/"
    : /^(mp4|webm|mov)$/.test(ext)
      ? "video/"
      : /^(mp3|wav|m4a)$/.test(ext)
        ? "audio/"
        : ext === "pdf"
          ? "application/pdf"
          : null;
  if (
    expected &&
    mime &&
    !mime.startsWith("application/octet-stream") &&
    !mime.startsWith(expected)
  )
    throw Error("기대 파일 유형과 응답 MIME이 다릅니다.");
  const declared = Number(response.headers.get("content-length"));
  if (declared > LIMITS.file) throw Error("첨부 개별 크기 예산 초과");
  const reader = response.body?.getReader();
  if (!reader) throw Error("파일 응답 스트림 미지원: 수동 확보 필요");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      if (signal?.aborted) throw abortError();
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.length;
      budget.received += chunk.length;
      if (size > LIMITS.file || budget.received > LIMITS.expanded)
        throw Error("첨부 실제 바이트 예산 초과");
      chunks.push(chunk);
      onBytes(size);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const start = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart();
    if (/^(?:<!doctype\s+html|<html|<head|<body|<script)/i.test(start))
      throw Error("파일 대신 HTML이 반환되었습니다.");
    // Fetch may expose decoded bytes while Content-Length describes compressed wire bytes.
    // Use actual bytes for budgets; never infer an integrity check from this header.
    return bytes;
  } catch (error) {
    try {
      await reader.cancel();
    } catch {}
    throw error;
  } finally {
    reader.releaseLock();
  }
}
export async function downloadAttachments(
  project,
  assets,
  ephemeral,
  approved,
  { signal, fetcher = fetch, onProgress = () => {} } = {},
) {
  const chosen = project.attachments.filter(
    (a) =>
      !a.assetId &&
      approved.has(a.id) &&
      project.posts.some((p) => p.selected && a.postIds.includes(p.id)),
  );
  const groups = new Map();
  for (const a of chosen) {
    const url = ephemeral.get(a.id);
    if (!url) continue;
    try {
      attachmentUrl(url, new Set([approved.get(a.id)]));
    } catch {
      a.status = "manual_required";
      a.failure = { category: "host", message: "직접 파일과 호스트 확인 필요" };
      continue;
    }
    if (!groups.has(url)) groups.set(url, []);
    groups.get(url).push(a);
    a.status = "queued";
  }
  const jobs = [...groups],
    budget = { received: assets.reduce((n, f) => n + f.bytes.length, 0) };
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const [url, refs] = jobs[cursor++];
      if (signal?.aborted) {
        refs.forEach((a) => (a.status = "cancelled"));
        continue;
      }
      refs.forEach((a) => {
        a.status = "downloading";
        a.failure = null;
      });
      try {
        const bytes = await fetchAttachment(
          url,
          new Set(refs.map((a) => approved.get(a.id))),
          {
            fetcher,
            signal,
            budget,
            onBytes: (n) =>
              onProgress({ phase: "download", id: refs[0].id, bytes: n }),
          },
        );
        const asset = {
          id: "F-api-" + String(assets.length + 1).padStart(4, "0"),
          input: "사용자 확인 직접 첨부",
          path: refs[0].originalName,
          bytes,
        };
        assets.push(asset);
        refs.forEach((a) => {
          a.assetId = asset.id;
          a.bytesReceived = bytes.length;
          a.status = "discovered";
          a.match = {
            status: "user_confirmed",
            evidence:
              "사용자 원본/호스트 확인 + 파일 바이트 확보 (아직 저장 확인 아님)",
          };
        });
      } catch (error) {
        refs.forEach((a) => {
          a.status = signal?.aborted ? "cancelled" : "failed";
          a.failure = {
            category: signal?.aborted ? "cancelled" : "download",
            message: signal?.aborted
              ? "내려받기 취소"
              : "파일 바이트 미확보: 원문/호스트/CORS/파일 형식 확인",
          };
        });
      }
      onProgress({
        phase: "download-result",
        id: refs[0].id,
        status: refs[0].status,
      });
    }
  }
  await Promise.all([worker(), worker()]);
}
