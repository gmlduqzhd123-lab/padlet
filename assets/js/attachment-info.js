import { safeUrl } from "./security.js";
import { kind } from "./local-import.js";

// Reviewed official response schema, 2026-10-09:
// docs.padlet.dev/reference/get-post-attachment-data, embedded OpenAPI.
// attributes: previewImageUrl, embedCode, poll. No original/download/name field.
export function publicViewUrl(value) {
  const url = safeUrl(value);
  if (!url) return null;
  const u = new URL(url);
  if (
    [...u.searchParams.keys()].some((k) =>
      /^(?:.*token.*|.*signature.*|.*credential.*|.*api.?key.*|key|auth.*|x-amz-.*|x-goog-.*|sig|expires)$/i.test(
        k,
      ),
    )
  )
    return null;
  if (
    /token|signature|credential|api.?key|(?:^|[&#])(?:sig|key|auth|expires)=/i.test(
      u.hash,
    )
  )
    return null;
  return url; // Preserve meaningful view parameters, e.g. ?id= or ?v=.
}
export function normalizeAttachmentData(response, postAttachment) {
  const data = response?.data;
  if (
    !data ||
    data.type !== "attachmentData" ||
    !data.attributes ||
    Array.isArray(data.attributes) ||
    typeof data.attributes !== "object"
  )
    throw Error("첨부정보 응답 구조 미확인");
  const attr = data.attributes;
  if (
    attr.poll != null &&
    (typeof attr.poll !== "object" || Array.isArray(attr.poll))
  )
    throw Error("투표 첨부 구조 미확인");
  for (const key of ["previewImageUrl", "embedCode"])
    if (attr[key] != null && typeof attr[key] !== "string")
      throw Error("첨부정보 필드 유형 미확인");
  const preview = safeUrl(attr.previewImageUrl);
  const url = safeUrl(postAttachment?.url);
  const samePreview =
    url &&
    preview &&
    new URL(url).origin === new URL(preview).origin &&
    new URL(url).pathname === new URL(preview).pathname;
  const mediaKind = url ? kind(url) : "unknown";
  const poll =
    !!attr.poll && typeof attr.poll === "object" && !Array.isArray(attr.poll);
  const transformed =
    url &&
    [...new URL(url).searchParams.keys()].some((k) =>
      /^(resize|width|height|quality|format|w|h)$/i.test(k),
    );
  const candidate =
    !poll && url && !samePreview && !transformed && mediaKind !== "link"
      ? url
      : null;
  let name = "원본 주소 미확인";
  if (candidate) {
    try {
      name =
        decodeURIComponent(new URL(candidate).pathname.split("/").at(-1)) ||
        name;
    } catch {}
  }
  return {
    metadata: {
      schema: "official-attachmentData-2026-10-09",
      type: poll
        ? "poll"
        : candidate
          ? "file_candidate"
          : mediaKind === "link"
            ? "external_view"
            : preview
              ? "preview_only"
              : "unknown",
      originalStatus: "unverified",
      originalName: name,
      fileNameBasis: candidate ? "post-url-path-candidate" : "unknown",
      mediaKind,
      hasPreview: !!preview,
      previewHost: preview ? new URL(preview).hostname : null,
      hasEmbed: !!attr.embedCode,
      sourceUrl: mediaKind === "link" ? publicViewUrl(url) : null,
    },
    candidate,
    preview, // Ephemeral only. Never spread this object into exports.
  };
}
