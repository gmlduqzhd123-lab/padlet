import { utf8, safeName, csv, escapeHtml } from "./security.js";
import { LIMITS } from "./config.js";
// Reused bytes are written once; the first selected referencing post owns the path.
export function attachmentPath(p, asset, refs) {
  const ref = refs.find((a) => a.assetId === asset.id);
  if (!ref)
    return (
      "99_미연결파일/" + asset.id + "_" + safeName(asset.path.split("/").at(-1))
    );
  const post = p.posts.find((x) => x.selected && ref.postIds.includes(x.id));
  const section = p.sections.find((x) => x.id === post.sectionId);
  return `03_첨부자료/${section.id}_${safeName(section.name)}/${post.id}_${safeName(post.titleOriginal)}/${asset.id}_${safeName(asset.path.split("/").at(-1))}`;
}
export function summary(p, assets, records = []) {
  const posts = p.posts.filter((x) => x.selected),
    refs = p.attachments.filter((a) =>
      posts.some((x) => a.postIds.includes(x.id)),
    );
  return {
    postsObserved: p.posts.length,
    postsSelected: posts.length,
    textProcessed: posts.filter((x) => x.bodyOriginal).length,
    attachmentReferences: refs.length,
    uniqueAssets: new Set(refs.map((a) => a.assetId).filter(Boolean)).size,
    filesSaved: records.filter((x) => x.status === "saved").length,
    filesPacked: records.filter((x) => x.status === "packed").length,
    externalLinks: refs.filter((a) => a.status === "linked_only").length,
    unresolved: refs.filter((a) => !a.assetId && a.status !== "linked_only")
      .length,
    unselected: p.posts.length - posts.length,
  };
}
export function documents(p, assets, options = {}) {
  const files = new Map(),
    posts = p.posts.filter((x) => x.selected),
    refs = p.attachments.filter((a) =>
      posts.some((x) => a.postIds.includes(x.id)),
    ),
    used = new Set(refs.map((x) => x.assetId).filter(Boolean));
  const add = (path, s) => files.set(path, typeof s === "string" ? utf8(s) : s);
  const section = (x) =>
    p.sections.find((s) => s.id === x.sectionId)?.name || "섹션 없음";
  const meta = (x) =>
    `[${x.id}] ${x.titleOriginal || "[제목 없음]"}\n섹션: ${section(x)}\n${options.author !== false ? "작성자: " + (x.authorOriginal || "원본에 정보 없음") + "\n" : ""}${options.date !== false ? "작성일: " + (x.createdAtOriginal || "원본에 정보 없음") + "\n" : ""}출처: ${x.sourceUrl || "원본에 정보 없음"}\n원문 위치: ${x.provenance.sourceFile} / ${x.provenance.sheet} / 행 ${x.provenance.row}\n`;
  const body = (x) =>
    meta(x) + "\n" + (x.bodyOrganized || "[본문 없음]") + "\n";
  const all = posts.map(body).join("\n---\n\n");
  add(
    "01_원문/원문데이터.json",
    JSON.stringify(
      { ...p, posts: posts.map((x) => ({ ...x })), attachments: refs },
      null,
      2,
    ),
  );
  for (const x of posts) {
    add(
      `01_원문/게시물별/${x.id}_${safeName(x.titleOriginal)}.txt`,
      x.bodyOriginal,
    );
    add(
      `02_줄글정리/게시물별/${x.id}_${safeName(x.titleOriginal)}.txt`,
      body(x) +
        "\n첨부 대조:\n" +
        refs
          .filter((a) => a.postIds.includes(x.id))
          .map((a) => a.id + " " + a.reference + " · " + a.match.status)
          .join("\n"),
    );
  }
  add("02_줄글정리/전체_글모음.txt", all);
  add("02_줄글정리/전체_글모음.md", all);
  for (const s of p.sections) {
    const group = posts.filter((x) => x.sectionId === s.id);
    if (group.length)
      add(
        `02_줄글정리/섹션별_글모음/${s.id}_${safeName(s.name)}.md`,
        group.map(body).join("\n---\n"),
      );
  }
  add(
    "02_줄글정리/글_읽기.html",
    '<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>글 읽기</title><style>body{font:16px/1.7 system-ui;max-width:900px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>글 모음 · 내보내기 파일 기준</h1><pre>' +
      escapeHtml(all) +
      "</pre></html>",
  );
  add(
    "00_안내와목록/게시물목록.csv",
    csv([
      ["ID", "제목", "섹션", "작성자", "작성일", "출처", "입력 위치"],
      ...posts.map((x) => [
        x.id,
        x.titleOriginal,
        section(x),
        x.authorOriginal,
        x.createdAtOriginal,
        x.sourceUrl,
        JSON.stringify(x.provenance),
      ]),
    ]),
  );
  add(
    "00_안내와목록/첨부파일대조표.csv",
    csv([
      [
        "첨부ID",
        "게시물ID",
        "원본 참조",
        "연결",
        "근거",
        "확보바이트",
        "출력경로",
      ],
      ...refs.map((a) => [
        a.id,
        a.postIds.join(";"),
        a.reference,
        a.match.status,
        a.match.evidence,
        a.bytesReceived,
        a.assetId
          ? attachmentPath(
              p,
              assets.find((f) => f.id === a.assetId),
              refs,
            )
          : "",
      ]),
    ]),
  );
  add(
    "00_안내와목록/미확보자료.csv",
    csv([
      ["첨부ID", "게시물ID", "참조", "상태", "다음 행동"],
      ...refs
        .filter((a) => !a.assetId && a.status !== "linked_only")
        .map((a) => [
          a.id,
          a.postIds.join(";"),
          a.reference,
          a.match.status,
          "원본에서 파일 확보 후 수동 연결",
        ]),
    ]),
  );
  add(
    "04_외부링크/외부링크목록.md",
    refs
      .filter((a) => a.sourceUrl)
      .map(
        (a) =>
          `${a.id} · ${a.postIds.join(",")} · ${a.sourceUrl} · ${a.status === "linked_only" ? "링크만 보관" : "원격 파일 요청 안 함"}`,
      )
      .join("\n"),
  );
  for (const f of assets) {
    if (used.has(f.id)) add(attachmentPath(p, f, refs), f.bytes);
    else if (!p.attachments.some((a) => a.assetId === f.id))
      add(
        "99_미연결파일/" + f.id + "_" + safeName(f.path.split("/").at(-1)),
        f.bytes,
      );
  }
  add(
    "00_안내와목록/읽어주세요.txt",
    "내보내기 파일 기준이며 전체 보드 수집은 미확인입니다. 원문/정리본/첨부/미확보 목록을 구분합니다. ZIP packed는 ZIP 포함 확인이며 디스크 저장 확인이 아닙니다. HTML·SVG·스크립트·실행파일 첨부는 보관만 하며 앱에서 실행하지 않았습니다.",
  );
  return files;
}
export function finalize(p, assets, files, records, mode) {
  files.set(
    "00_안내와목록/수집결과.json",
    utf8(
      JSON.stringify(
        {
          basis: "export-file",
          mode,
          writeFailures: records.filter((r) => r.status === "failed").length,
          ...summary(p, assets, records),
        },
        null,
        2,
      ),
    ),
  );
  files.set(
    "00_안내와목록/manifest.json",
    utf8(
      JSON.stringify(
        {
          schemaVersion: "1.0",
          projectId: p.projectId,
          mode,
          scope: "export-file",
          diskConfirmed:
            mode === "folder" && records.every((r) => r.status === "saved"),
          records,
        },
        null,
        2,
      ),
    ),
  );
}
export function makeZip(files) {
  let size = 0;
  for (const b of files.values()) size += b.length;
  if (size > LIMITS.zip)
    throw Error(
      "ZIP 원본 데이터 100MiB 초과: 파일을 나누거나 폴더 저장을 사용하세요.",
    );
  const input = Object.create(null);
  for (const [path, bytes] of files) input[path] = bytes;
  return fflate.zipSync(input, { level: 0 });
}
export async function writeFile(root, path, bytes) {
  let stream;
  try {
    const parts = path.split("/");
    let dir = root;
    for (const s of parts.slice(0, -1))
      dir = await dir.getDirectoryHandle(s, { create: true });
    const handle = await dir.getFileHandle(parts.at(-1), { create: true });
    stream = await handle.createWritable();
    await stream.write(bytes);
    await stream.close();
    return {
      path,
      bytes: bytes.length,
      status: "saved",
      integrity: "write-complete",
      hash: null,
    };
  } catch {
    try {
      await stream?.abort();
    } catch {}
    return {
      path,
      bytes: bytes.length,
      status: "failed",
      integrity: "not-checked",
      hash: null,
    };
  }
}
export async function writeFolder(parent, name, files, p, assets) {
  let root;
  for (let i = 0; i < 10; i++) {
    const candidate = name + (i ? "_" + i : "");
    try {
      await parent.getDirectoryHandle(candidate);
      continue;
    } catch (e) {
      if (e.name !== "NotFoundError") throw e;
    }
    root = await parent.getDirectoryHandle(candidate, { create: true });
    name = candidate;
    break;
  }
  if (!root) throw Error("새 작업 폴더를 만들 수 없습니다.");
  const records = [];
  for (const [path, b] of files) records.push(await writeFile(root, path, b));
  const failed = records.filter((r) => r.status === "failed");
  if (failed.length) {
    const missing = files.get("00_안내와목록/미확보자료.csv");
    files.set(
      "00_안내와목록/미확보자료.csv",
      utf8(
        new TextDecoder().decode(missing) +
          "\r\n" +
          csv(
            failed.map((r) => [
              "쓰기 실패",
              "",
              "",
              r.path,
              "권한/디스크 여유 확인 후 새 작업으로 재저장",
            ]),
          ).replace(/^\uFEFF/, ""),
      ),
    );
    records.push(
      await writeFile(
        root,
        "00_안내와목록/미확보자료.csv",
        files.get("00_안내와목록/미확보자료.csv"),
      ),
    );
  }
  finalize(p, assets, files, records, "folder");
  for (const path of [
    "00_안내와목록/수집결과.json",
    "00_안내와목록/manifest.json",
  ])
    records.push(await writeFile(root, path, files.get(path)));
  return { name, records };
}
