import { LIMITS } from "./config.js";
import { validPath, plainText, organize, safeUrl, utf8 } from "./security.js";
export const fields = {
  title: "제목",
  body: "본문",
  section: "섹션",
  author: "작성자",
  date: "작성일",
  source: "원문 링크",
  attachment: "첨부 경로/링크",
  id: "원본 ID",
};
const aliases = {
  title: ["제목", "title", "subject"],
  body: ["본문", "body", "content", "text", "내용", "bodyhtml"],
  section: ["섹션", "section", "column", "group"],
  author: ["작성자", "author", "name"],
  date: ["작성일", "date", "createdat", "created at"],
  source: ["원문 링크", "post url", "source", "url", "permalink"],
  attachment: [
    "첨부",
    "첨부파일",
    "첨부 경로/링크",
    "attachment",
    "attachments",
    "attachment url",
  ],
  id: ["id", "post id", "게시물 id"],
};
export function suggest(headers) {
  return Object.fromEntries(
    Object.keys(fields).map((f) => [
      f,
      headers.findIndex((h) =>
        aliases[f].includes(String(h).trim().toLowerCase()),
      ),
    ]),
  );
}
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cell = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quote || cell === "") quote = !quote;
      else cell += c;
    } else if (c === "," && !quote) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quote) throw Error("CSV 큰따옴표가 닫히지 않았습니다.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
// Stream decompression: count actual emitted bytes; never use unzipSync on untrusted archives.
export function unzipChecked(bytes, limits = LIMITS) {
  if (bytes.length > limits.input) throw Error("ZIP 입력 크기 초과");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (view.getUint32(p, true) === 0x06054b50) {
      end = p;
      break;
    }
  if (end < 0) throw Error("ZIP 중앙 디렉터리 없음");
  const count = view.getUint16(end + 10, true);
  if (count > limits.entries) throw Error("ZIP 항목 수 초과");
  let pos = view.getUint32(end + 16, true);
  const seen = new Set();
  for (let n = 0; n < count; n++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50)
      throw Error("ZIP 디렉터리 오류");
    const nameLen = view.getUint16(pos + 28, true),
      extra = view.getUint16(pos + 30, true),
      comment = view.getUint16(pos + 32, true);
    const name = new TextDecoder().decode(
      bytes.subarray(pos + 46, pos + 46 + nameLen),
    );
    validPath(name.replace(/\/$/, ""));
    if (seen.has(name.normalize("NFC"))) throw Error("ZIP 중복 경로");
    seen.add(name.normalize("NFC"));
    if (view.getUint16(pos + 8, true) & 1) throw Error("암호화 ZIP 미지원");
    const mode = view.getUint32(pos + 38, true) >>> 16;
    if ((mode & 0xf000) === 0xa000) throw Error("ZIP 심볼릭 링크 차단");
    pos += 46 + nameLen + extra + comment;
  }
  const files = [];
  let total = 0,
    items = 0;
  const unzip = new fflate.Unzip((file) => {
    if (++items > limits.entries) throw Error("ZIP 항목 수 초과");
    const path = validPath(file.name.replace(/\/$/, ""));
    const chunks = [];
    let size = 0;
    file.ondata = (err, data, final) => {
      if (err) throw err;
      size += data.length;
      total += data.length;
      if (size > limits.file || total > limits.expanded)
        throw Error("ZIP 실제 해제 바이트 예산 초과");
      chunks.push(data);
      if (final && !file.name.endsWith("/")) {
        const content = new Uint8Array(size);
        let offset = 0;
        for (const c of chunks) {
          content.set(c, offset);
          offset += c.length;
        }
        files.push({ path, bytes: content });
      }
    };
    file.start();
  });
  unzip.register(fflate.UnzipInflate);
  for (let i = 0; i < bytes.length; i += 4096)
    unzip.push(bytes.subarray(i, i + 4096), i + 4096 >= bytes.length);
  return files;
}
export async function readTable(file, encoding = "utf-8") {
  if (file.size > LIMITS.input) throw Error("입력 파일 100MiB 초과");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.csv$/i.test(file.name))
    return {
      sheets: [
        {
          name: "CSV",
          rows: parseCsv(
            new TextDecoder(encoding, { fatal: true }).decode(bytes),
          ),
          links: {},
        },
      ],
      sourceFile: file.name,
    };
  if (/\.xlsx$/i.test(file.name)) {
    unzipChecked(bytes);
    const wb = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellFormula: false,
      cellHTML: false,
    });
    return {
      sourceFile: file.name,
      sheets: wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
          defval: "",
          blankrows: true,
        });
        const links = {};
        for (const addr of Object.keys(ws)) {
          if (addr.startsWith("!")) continue;
          if (ws[addr].l?.Target) {
            const c = XLSX.utils.decode_cell(addr);
            links[c.r + ":" + c.c] = ws[addr].l.Target;
          }
        }
        return { name, rows, links };
      }),
    };
  }
  if (/\.json$/i.test(file.name)) {
    const j = JSON.parse(new TextDecoder().decode(bytes));
    if (j.schemaVersion !== "1.0" || !Array.isArray(j.posts))
      throw Error("지원 JSON: schemaVersion 1.0 + posts 배열만 허용");
    const rows = [Object.keys(fields)];
    for (const p of j.posts) {
      if (typeof p.bodyOriginal !== "string")
        throw Error("JSON bodyOriginal 문자열 필수");
      rows.push([
        p.titleOriginal ?? "",
        p.bodyOriginal,
        p.sectionName ??
          j.sections?.find((s) => s.id === p.sectionId)?.name ??
          "",
        p.authorOriginal ?? "",
        p.createdAtOriginal ?? "",
        p.sourceUrl ?? "",
        (
          p.attachmentRefs ??
          j.attachments
            ?.filter((a) => p.attachmentIds?.includes(a.id))
            .map((a) => a.reference || a.originalName || a.sourceUrl) ??
          []
        ).join("\n"),
        p.sourcePostId ?? "",
      ]);
    }
    return {
      sourceFile: file.name,
      sheets: [{ name: "표준 JSON", rows, links: {} }],
    };
  }
  throw Error("CSV, XLSX, 표준 JSON만 지원합니다.");
}
export async function readAssets(inputs) {
  const assets = [];
  let total = 0;
  for (const file of inputs) {
    if (file.size > LIMITS.input) throw Error("첨부 입력 크기 초과");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const list = /\.zip$/i.test(file.name)
      ? unzipChecked(bytes)
      : [{ path: validPath(file.name), bytes }];
    for (const a of list) {
      if (a.bytes.length > LIMITS.file) throw Error("개별 첨부 50MiB 초과");
      total += a.bytes.length;
      if (total > LIMITS.expanded || assets.length >= LIMITS.entries)
        throw Error("첨부 총 예산 초과");
      assets.push({
        ...a,
        id: "F-" + String(assets.length + 1).padStart(4, "0"),
        input: file.name,
      });
    }
  }
  return assets;
}
export function kind(ref) {
  if (/\.(png|jpe?g|gif|webp)(?:$|\?)/i.test(ref)) return "image";
  if (/\.(mp4|webm|mov)(?:$|\?)/i.test(ref)) return "video";
  if (/\.(mp3|wav|m4a)(?:$|\?)/i.test(ref)) return "audio";
  if (/\.(pdf|hwpx?|docx?|xlsx?|pptx?|txt|csv|zip)(?:$|\?)/i.test(ref))
    return "document";
  return safeUrl(ref) ? "link" : "unknown";
}
export function normalize(table, sheetIndex, mapping, assets) {
  const sheet = table.sheets[sheetIndex],
    posts = [],
    attachments = [],
    sections = [];
  let textBytes = 0;
  if (mapping.body < 0 && mapping.title < 0 && mapping.attachment < 0)
    throw Error("본문, 제목 또는 첨부 열을 연결해 주세요.");
  for (let r = 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row.some((x) => String(x) !== "")) continue;
    const value = (f) => String(row[mapping[f]] ?? "");
    const raw = value("body");
    textBytes += utf8(raw).length;
    if (utf8(raw).length > LIMITS.post || textBytes > LIMITS.text)
      throw Error("본문 크기 예산 초과");
    const sectionName = value("section");
    let section = sections.find((s) => s.name === sectionName);
    if (!section) {
      section = {
        id: "S-" + String(sections.length + 1).padStart(3, "0"),
        name: sectionName,
      };
      sections.push(section);
    }
    const id = "P-" + String(posts.length + 1).padStart(4, "0");
    const p = {
      id,
      sourcePostId: value("id") || null,
      sectionId: section.id,
      titleOriginal: value("title") || null,
      bodyOriginal: raw,
      bodyPlain: plainText(raw),
      bodyOrganized: organize(plainText(raw)),
      createdAtOriginal: value("date") || null,
      authorOriginal: value("author") || null,
      sourceUrl:
        sheet.links[r + ":" + mapping.source] || value("source") || null,
      provenance: {
        sourceFile: table.sourceFile,
        sheet: sheet.name,
        row: r + 1,
      },
      attachmentIds: [],
      selected: true,
      warnings: /<(table|math|del|s|strike)\b/i.test(raw)
        ? ["서식 변환 주의: 원문에서 표·수식·삭제 표시 확인"]
        : [],
    };
    const refs = (
      sheet.links[r + ":" + mapping.attachment] || value("attachment")
    )
      .split(/\r?\n|\s*;\s*/)
      .filter(Boolean);
    for (const ref of refs) {
      const a = {
        id: "A-" + String(attachments.length + 1).padStart(4, "0"),
        postIds: [id],
        reference: ref,
        originalName: ref.split("/").at(-1),
        mediaKind: kind(ref),
        sourceUrl: safeUrl(ref),
        assetId: null,
        match: { status: "unmatched", evidence: "파일 없음" },
        status: "manual_required",
        bytesReceived: 0,
        hash: null,
        integrity: "not-checked",
      };
      let candidates = assets.filter(
        (f) => f.path.normalize("NFC") === ref.normalize("NFC"),
      );
      if (!candidates.length) {
        let name = ref.split("/").at(-1);
        try {
          name = decodeURIComponent(new URL(ref).pathname.split("/").at(-1));
        } catch {}
        candidates = assets.filter(
          (f) =>
            f.path.split("/").at(-1).normalize("NFC") === name.normalize("NFC"),
        );
      }
      if (candidates.length === 1) {
        a.assetId = candidates[0].id;
        a.match = {
          status: "exact",
          evidence: "유일한 정확 경로 또는 원본 파일명",
        };
        a.status = "discovered";
        a.bytesReceived = candidates[0].bytes.length;
      } else if (candidates.length > 1)
        a.match = {
          status: "ambiguous",
          evidence: "동일 이름 후보 " + candidates.length + "개",
        };
      else if (a.mediaKind === "link") {
        a.status = "linked_only";
        a.match.evidence = "외부 보기 링크만 보관";
      }
      p.attachmentIds.push(a.id);
      attachments.push(a);
    }
    posts.push(p);
  }
  return {
    schemaVersion: "1.0",
    projectId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    sourceMode: "local",
    board: { title: table.sourceFile, provenance: "export-file" },
    coverage: {
      basis: "export-file",
      expectedPosts: null,
      observedPosts: posts.length,
      status: "unknown",
      warnings: ["원본 보드 전체 여부는 확인하지 않았습니다."],
    },
    sections,
    posts,
    attachments,
  };
}
