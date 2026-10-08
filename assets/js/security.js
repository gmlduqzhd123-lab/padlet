export const utf8 = (s) => new TextEncoder().encode(s);
export function safeName(value) {
  let s = String(value || "이름없음")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 100);
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s)) s = "_" + s;
  return s || "이름없음";
}
export function validPath(path) {
  const s = String(path).normalize("NFC");
  if (
    !s ||
    s.includes("\\") ||
    s.startsWith("/") ||
    /[\x00-\x1f:]/.test(s) ||
    s.split("/").some((x) => x === ".." || x === "." || !x)
  )
    throw Error("안전하지 않은 ZIP 경로");
  return s;
}
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function csv(rows) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((v) => {
            let s = String(v ?? "");
            if (/^[\s\x00-\x1f]*[=+@-]/.test(s) || /^[\x00-\x1f]/.test(s))
              s = "'" + s;
            return '"' + s.replace(/"/g, '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function plainText(raw) {
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;
  const doc = new DOMParser().parseFromString(raw, "text/html");
  doc
    .querySelectorAll("script,style,iframe,object,embed,svg,math")
    .forEach((n) => n.remove());
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc
    .querySelectorAll("p,div,li,tr,h1,h2,h3,blockquote")
    .forEach((n) => n.append("\n"));
  doc.querySelectorAll("s,strike,del").forEach((n) => {
    n.prepend("[삭제 표시: ");
    n.append("]");
  });
  return doc.body.textContent;
}
export const organize = (text) =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((x) => x.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
