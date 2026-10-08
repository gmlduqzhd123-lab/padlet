# T-02 첨부정보·연결 흐름 수정 검수

검수일: 2026-10-09 (Asia/Seoul). 기존 앱을 유지하며 수정했다. 지정한 다음 작업 문서와 AGENTS.md/PRD.md/TASKS.md/ACCEPTANCE.md를 읽었다. **이번 작업에서 커밋·원격 푸시·배포를 수행하지 않았다.** 공개 앱은 이전 배포본이다. 핵심 발췌·재창작 신규 기능은 추가하지 않았다.

## 확인한 기존 문제

- collectAttachmentInfo는 response.data 존재만 확인하고 게시물 URL을 사용했다. previewImageUrl/embedCode/poll 해석이 없고 원본·미리보기 구분이 없었다.
- 원본으로 확인되지 않은 주소에 사용자 원본 확인이라는 표현을 사용했다. 외부 보기 링크의 쿼리를 모두 제거해 ?v=/?id= 등의 의미를 잃을 수 있었다.
- 입력창과 함수의 키를 매번 지워 같은 작업의 다음 요청에 재입력이 필요했다. 연결 해제는 세션 키 삭제를 관리하는 객체가 없었다.
- 주소 확인/GET 검사/게시물 수집이 기본 동선에 섞였으며, API 게시물에 로컬 첨부를 추가하는 독립 경로가 없었다.
- 첨부 실패 이유가 호스트/CSP/HTTP/MIME/네트워크를 구분하지 못했고, 폴더 저장 중 다른 작업이 프로젝트를 변경할 수 있었다.

## 수정 파일과 구현

| 파일 | 수정 내용 |
|---|---|
| assets/js/attachment-info.js (추가) | 공식 첨부정보 정규화, 미리보기/투표/임베드 존재/외부 보기/파일 후보 구분, 외부 보기 URL 정책 |
| assets/js/api-collection.js | 정규화 어댑터 사용, 원본 미확인 상태 유지, 미지원 호스트 명시, 메타데이터 실패 시 본문·다른 파일 유지 |
| assets/js/attachment-download.js | 호스트/CSP 관찰/HTTP/형식/MIME/원인 미확정 네트워크 오류 구분, 오류 JSON 바이트 탐지, 원본 미확인 후보 표시 |
| assets/js/api-session.js (추가), api-client.js | 탭 메모리 키 객체, 요청 시 최신 키 조회, 연결 해제된 키 재사용 차단 |
| assets/js/app.js | 기본 게시물 가져오기, 키 재사용/연결 해제, 충돌 작업 잠금, API 프로젝트에 로컬 첨부 추가·고유 ID·수동 연결 |
| index.html | 링크/파일 두 경로, 주 수집 버튼, 접힌 고급 진단, 자료 선택·첨부 확보 → 글 정리 → 저장 흐름 |
| assets/js/export.js | 대조표/미확보 CSV에 상태·실패 사유·분류·HTTP·공급자 코드·원본 확인 수준 추가 |
| tests/api.cjs, tests/run.cjs | 실제 실행한 가상/로컬 회귀, 키 재사용/삭제/새로고침·첨부 스키마·오류·CSP/호스트 일치 등 |
| tests/pages.cjs | 향후 별도 배포 검수의 버튼 기대값을 새 흐름으로 갱신. 이번에는 실행하지 않음 |
| README.md, PRD.md, TASKS.md, ACCEPTANCE.md, docs/PRIVACY.md, FEASIBILITY.md | 최신 로컬 동작과 이전 배포 상태 구분, 현재 세션/첨부 정책 갱신 |
| docs/ATTACHMENT_SCHEMA_REVIEW.json, T02_FIX_API_RESULTS.json, T02_FIX_LOCAL_RESULTS.json, 이 보고서 | 공식 계약 검토와 이번 실행 결과의 별도 기록 |

테스트 러너는 기존 가상 fixtures를 재생성한다. 사용자 원문·실제 학생자료를 사용하지 않았다. 과거 검수 파일은 삭제하지 않았다. test-results의 다운로드 ZIP/이미지는 Git 제외 상태를 유지한다.

## 공식 스키마와 호스트 근거

2026-10-09 [첨부정보 GET 문서](https://docs.padlet.dev/reference/get-post-attachment-data)의 HTML에 포함된 공개 OpenAPI를 직접 읽었다. data.type=attachmentData와 attributes.previewImageUrl/embedCode/poll을 확인했다. downloadUrl/원본 파일명/원본 다운로드 필드는 확인되지 않았다. Markdown 주소와 별도 attachment-data-object 주소는 조회 도구에서 실패했지만 일반 문서 HTML의 공개 스키마를 확인했다. 검토 필드와 원문 HTML 해시는 ATTACHMENT_SCHEMA_REVIEW.json에 남겼다.

[게시물 객체](https://docs.padlet.dev/reference/post-object)의 content.attachment.url은 별도 주소다. 미리보기와 같은 origin/path 주소 또는 명시적인 크기/품질 변환 쿼리는 파일 후보로 승격하지 않는다. 기타 파일 확장자의 게시물 URL도 **원본 미확인 후보**일 뿐이다. 사용자 선택·지원 호스트·MIME/응답 바이트 검사를 통과해도 원본 동일성은 unverified로 유지한다. embedCode는 실행하거나 HTML로 삽입하지 않고 존재 여부만 기록한다. 미리보기 URL은 요청·출력하지 않는다.

[댓글 객체의 업로드 예시](https://docs.padlet.dev/reference/comment-object)에서 cdn.padlet.dev를 다시 확인했다. 이 예시는 모든 첨부의 호스트/CORS/원본 제공을 증명하지 않는다. 이번에는 다운로드 허용 호스트를 확대하지 않았다. 공식 첨부정보 예시의 padlet-artifacts.storage.googleapis.com은 미리보기 출처이므로 추가하지 않았다. 다른 호스트는 unsupported_host와 로컬 첨부 추가·수동 연결 안내로 남긴다.

CSP connect-src는 기존 `'self' https://api.padlet.dev https://cdn.padlet.dev`를 유지했다. 코드 Set과 CSP의 정확한 일치를 시험했다. 와일드카드/전체 https:를 허용하지 않았다. [connect-src 문서](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src)도 대조했다. CSP 오류는 실제 violation 이벤트가 관찰된 경우에만 분류한다. 일반 fetch 실패는 CORS라고 단정하지 않는다.

후보 형식: PNG/JPG/JPEG/GIF/WebP, MP4/WebM/MOV, MP3/WAV/M4A, PDF/HWP/HWPX/DOCX/XLSX/PPTX/TXT/CSV/ZIP. 확장자만으로 원본 여부를 보장하지 않는다. HTML/오류 JSON/JS/SVG 응답과 명백한 MIME 불일치, 개별 50MiB/전체 500MiB 바이트 예산 초과를 거부한다. 리다이렉트 추적/쿠키/인증 헤더/Padlet 키를 첨부 요청에 사용하지 않는다.

의미 있는 외부 보기 쿼리는 보존한다. 알려진 token/signature/credential/auth/key/만료·서명 계열 매개변수가 있으면 주소를 출력하지 않고 게시물 출처를 남긴다. 다운로드 후보/미리보기 주소는 일시 메모리로만 처리하며 내보내기 모델에 포함하지 않는다. 알려지지 않은 임의 매개변수의 비밀성을 모두 판별하는 것은 보장하지 않는다.

## 직접 실행한 시험

Windows, Chrome 154.0.8037.98, Codex 번들 Playwright와 Node. 개발 시험용 임시 localhost `/repo/`만 사용했다. 앱 운영에 서버/Node/빌드는 필요하지 않다.

| 명령/시험 | 결과 | 범위 |
|---|---|---|
| `node tests/api.cjs` | **47 PASS / 0 FAIL**, page error 0 | 공식 필드에 맞춘 가상 응답과 가상 CDN 바이트. 실제 패들렛 수집 성공 아님 |
| `node tests/run.cjs` | **39 PASS / 0 FAIL**, page error 0, 로컬 데이터 요청 0 | 가상 100개 CSV/XLSX·첨부 ZIP/JSON, 실제 브라우저 다운로드와 독립 ZIP 해제 |
| `git diff --check` | PASS | 변경 파일 공백 검사 |
| 브라우저 스크린샷 검토 | PASS (검토 범위) | 기본 링크/최초 키/고급 진단/첨부·정리·저장 구역. 모바일 가로 넘침 회귀도 통과 |
| `npx --yes --package prettier@3.6.2 prettier --write ...` | 완료 | 수정한 HTML/JS와 테스트의 개발용 포맷 정리. 실행 의존성 추가 아님 |

API 시험은 미리보기/임베드/투표/외부 보기/원본 후보 없음/미지원 호스트/잘못된 응답, 의미 있는 쿼리 보존과 민감 쿼리 제외, 만료 403/HTML/오류 JSON/MIME/네트워크/모의 CSP를 포함한다. 개별 실패/부분 본문 보존/취소/실패 항목 재시도/같은 URL 중복 처리도 확인했다.

진단 후 빈 키 입력창 상태로 수집해 같은 키가 허용 API 헤더에만 들어가는 것을 확인했다. 연결 해제 중 요청 취소·기존 본문/파일 유지·추가 요청 없음, 새로고침 후 키 없음, 충돌 버튼 잠금을 검수했다. 가상 키/서명 주소가 첨부 요청 헤더·ZIP·스토리지·브라우저 콘솔에 없는지 검사했다. IndexedDB/Service Worker 없음, 임베드 스크립트 실행 없음도 확인했다. ZIP의 대조표에는 실제 실패 상태와 원본 미확인 수준이 남는다.

로컬 회귀는 시트/열/하이퍼링크·원문 숫자/줄바꿈/결측값, 검색/선택/수동 연결, 악성 ZIP 경로/심볼릭 링크/실제 해제 예산/XSS/CSV 수식, 폴더 writer close/실패/취소 mock, 오프라인 글 읽기를 포함했다. 1MiB 본문·30개 약 50MiB 첨부 가져오기는 최종 실행 1,298ms였다. 50MiB 첨부 ZIP을 내려받고 독립 해제했다. API 프로젝트에 로컬 첨부 ZIP을 추가·고유 ID로 수동 연결해도 원문이 유지됐다.

최종 assertion 실패는 없다. 일부 파일의 failed 상태는 의도한 가상 실패 입력의 기대 결과이며 시험 FAIL이 아니다.

## 실제 연동과 남은 제약

| 항목 | 판정 | 이유 |
|---|---|---|
| 실제 API 이용 자격/키/관리자 권한 | NOT_RUN | 실제 키와 승인된 비식별 보드 없음 |
| 최신 수정본의 실제 Pages API/CORS | NOT_RUN | 이번 수정 배포 금지, 실계정 없음. localhost mock으로 대체 판정하지 않음 |
| 최신 수정본의 `node tests/pages.cjs` | NOT_RUN | 공개 사이트는 이전 버전이고 이번에는 배포하지 않았음. 별도 배포 후 실행 |
| 실제 원격 파일 바이트/원본 해상도/해시 동일성 | NOT_RUN / UNVERIFIED | 실파일과 비교 원본 없음. 문서에 원본 다운로드 필드 없음 |
| 실제 OS 폴더 승인·디스크 쓰기 | NOT_RUN | 이번에는 네이티브 사용자 승인 시험 없이 mock writer만 검수 |
| 실제 연동 PASS | 없음 | 가상 성공과 구분 |

키는 탭의 JS 세션 객체만 사용한다. 연결 해제 시 세션 키를 제거하고 AbortController로 요청을 취소한다. 이미 송신한 헤더를 취소로 되돌리거나 브라우저 내부 복사본을 즉시 소거할 수 있다고 주장하지 않는다. 다운로드 후보와 바이트는 메모리 처리다. 응답 예산 검사는 JSON 역직렬화 후 수행하며, 대용량 스트리밍 고도화는 이번 범위에 포함하지 않았다. 첨부정보에 원본 URL이 없는 경우 자동 원본 확보 완료를 보장하지 않는다.

## 최소 실연동 검수와 사용 순서

별도 배포 요청 후 승인된 비식별 보드에 텍스트/JPG/PDF 각 1개를 준비한다. API 자격·관리자 권한이 있는 사용자가 본인 Pages 브라우저에 키를 입력한다. 키를 채팅/저장소에 올리지 않는다. 링크 → 최초 키 → 게시물 가져오기 → 자료 선택·후보/호스트 선택·첨부 확보 → 글 원문/정리본 확인 → 폴더 또는 ZIP 저장 순으로 확인한다. 고급 GET 검사 후 키 재입력은 필요 없다. 연결 해제/새로고침 후에는 다시 입력한다.

본문 응답, 첨부정보 유형, 실제 받은 MIME/바이트, ZIP 해제 또는 폴더 쓰기 종료를 각각 관찰한다. 원본 비교 파일이 있을 때만 해시/크기 동일성을 검사한다. 원본 주소/호스트가 미지원이면 원문에서 파일을 확보해 ‘로컬 첨부 추가 후 수동 연결’로 이어간다. API가 불가능하면 CSV/XLSX·첨부 ZIP의 기존 로컬 경로로 같은 정리·출력을 사용할 수 있다.
