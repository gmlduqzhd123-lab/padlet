const ORIGIN = "https://api.padlet.dev";
export function parseBoardUrl(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    !["padlet.com", "www.padlet.com"].includes(u.hostname) ||
    u.port
  )
    throw Error(
      "HTTPS 패들렛 보드 주소만 지원합니다. 사용자정보·유사 도메인은 허용하지 않습니다.",
    );
  const last = u.pathname.split("/").filter(Boolean).at(-1) || "";
  const id = last.match(/(?:^|-)([a-zA-Z0-9]{16}|[a-zA-Z0-9]{20})$/)?.[1];
  return { url: u.href, id: id || null };
}
const messages = {
  INVALID_API_KEY: "API 키가 유효하지 않습니다.",
  NOT_ADMIN: "보드 관리자 권한이 없습니다.",
  NOT_PAYING_USER: "현재 계정에서 API 이용 자격이 확인되지 않습니다.",
  PADLET_ARCHIVED: "보관된 보드입니다.",
  RATE_LIMIT_EXCEEDED: "요청량 제한으로 대기가 필요합니다.",
  NOT_FOUND: "요청한 보드 또는 게시물이 없습니다.",
};
export async function requestApi(path, key, { fetcher = fetch, signal } = {}) {
  if (!key) throw Error("키 없음: 로컬 파일 가져오기를 이용할 수 있습니다.");
  const u = new URL(path, ORIGIN);
  if (
    u.origin !== ORIGIN ||
    u.username ||
    u.password ||
    !u.pathname.startsWith("/v1/")
  )
    throw Error("허용되지 않은 API 출처");
  let r;
  try {
    r = await fetcher(u.href, {
      method: "GET",
      headers: { "x-api-key": key, Accept: "application/vnd.api+json" },
      credentials: "omit",
      redirect: "error",
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw Error(
      "네트워크 또는 브라우저 접근 제한: 원인 미확정. CORS 여부를 단정할 수 없습니다.",
    );
  }
  let j;
  try {
    j = await r.json();
  } catch {
    if (r.ok) throw Error("API JSON 응답을 읽지 못했습니다.");
    j = { errors: [] };
  }
  if (!r.ok) {
    const code = j.errors?.[0]?.code;
    const error = Error(
      (messages[code] || "공식 API 응답 오류") +
        " · " +
        (messages[code] ? code : "알 수 없는 코드") +
        " · HTTP " +
        r.status,
    );
    error.httpStatus = r.status;
    error.providerCode = messages[code] ? code : null;
    error.retryAfter = r.headers?.get("Retry-After") || null;
    throw error;
  }
  return j;
}
export const readBoard = (id, key, options) => {
  if (!/^[a-zA-Z0-9]{16,22}$/.test(id))
    throw Error("Developer 메뉴에서 보드 ID를 확인하세요.");
  return requestApi(
    "/v1/boards/" + id + "?include=posts,sections",
    key,
    options,
  );
};
export const readAttachment = (id, key, options) => {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    throw Error("게시물 ID를 확인하세요.");
  return requestApi(
    "/v1/posts/" + encodeURIComponent(id) + "/attachmentData",
    key,
    options,
  );
};
