# T-02 조건부 공식 API 수집 구현 및 검수

2026-10-09 후속 배포 완료: 조건부 API 코드와 개선한 연결 안내가 공개 Pages에 반영됐다. 아래 미배포 표현은 당시 검수 기록이다. 현재 상태는 [배포 보고서](DEPLOYMENT_REPORT.md)를 따른다. 실계정 API/첨부 검증은 여전히 NOT_RUN이다.

검수일: 2026-10-08, Windows, Chrome 154.0.8037.98, Codex 번들 Playwright / Node 24.15.0. 시험 출처는 localhost `/repo/`이다. **API 응답과 파일 호스트 응답은 모두 가상 mock이다. 실계정 수집 성공이 아니다.**

## 실제 구현

- 공식 board GET의 JSON:API data/included/relationships 매핑. content.subject/bodyHtml, section 관계, author/createdAt 원문, sortIndex, sourceStatus를 보존한다. approved만 기본 선택하고 pending_moderation/scheduled/상태 미확인은 제외한다.
- 보드 ID 직접 입력, 응답 ID 대조, 응답에 실제 존재하는 next 링크만 동일 API 출처·동일 보드 경로에서 따른다. 누락 ID와 페이지 실패/중지의 부분 결과를 남긴다. 전체 최신 보드 완료를 주장하지 않는다.
- 첨부정보 GET을 별도로 수행한다. 문서에서 원본 다운로드 필드의 확정된 스키마를 확인하지 못했으므로 임의 downloadUrl 필드를 추정하지 않는다. 게시물의 content.attachment.url은 메모리 전용 후보이며 첨부정보 응답을 읽었다고 원본 바이트 확보로 처리하지 않는다.
- 후보 중 사용자가 직접 원본·호스트를 확인한 파일만 별도로 내려받는다. 현재 제작자 문서의 업로드 예시에서 확인한 `cdn.padlet.dev` 하나만 CSP/호스트 목록에 포함한다. **이 예시는 실제 호스트의 CORS·원본 해상도 보장이 아니다.** 다른 호스트·보기 링크·원본 여부 미확인 자료는 수동 확보가 필요하다.
- 키/헤더 함수는 첨부 요청과 분리했다. API는 공식 출처만 x-api-key를 받고 redirect error/credentials omit이다. 첨부는 key 인자 자체가 없고 credentials omit/redirect error/no-referrer이다. 서명 URL은 Map/WeakMap에만 두며 내보내기에는 출처 게시물 링크를 사용한다. 외부 링크 목록은 쿼리를 제거한 주소만 보관하므로 원래 보기 주소는 게시물에서 확인한다.
- API 메타데이터 요청은 초당 최대 1회, 429 Retry-After 또는 60초 대기(최대 2회 재시도), 5xx 지수 대기(최대 3회 재시도). 인증·권한·일반 네트워크 원인 미확정 오류는 자동 반복하지 않는다. 429 대기 중에도 중지할 수 있다.
- 첨부 동시 요청 2개, 실제 바이트 기준 한도, 로그인 HTML/오류 JSON/명백한 MIME 불일치 차단, 동일 URL 바이트 중복 방지, 부분 성공·취소·사용자 수동 재시도. 첨부 실패의 자동 재시도는 없으며 사용자가 버튼을 눌러 실패 항목만 다시 요청한다.
- API 응답 기준과 내보내기 파일 기준을 화면과 JSON/읽기 HTML에서 구분한다. ZIP 포함/다운로드 시작과 실제 폴더 쓰기 완료 구분은 유지했다. 로컬 가져오기는 API 키 없이 그대로 사용할 수 있다.

## 공식 문서 검토

2026-10-08 조회: [게시물](https://docs.padlet.dev/reference/post-object), [섹션](https://docs.padlet.dev/reference/section-object), [보드 조회](https://docs.padlet.dev/reference/get-board-by-id), [첨부정보 GET](https://docs.padlet.dev/reference/get-post-attachment-data), [오류·제한](https://docs.padlet.dev/reference/error-handling), [댓글 객체의 업로드 URL 예시](https://docs.padlet.dev/reference/comment-object). 게시물 객체의 related 예시에는 단수 post 경로가 있으나 정식 GET 문서의 복수 posts 경로만 사용했다. 비공개 엔드포인트는 사용하지 않았다. 댓글은 이번 단계에서 기본 제외한다.

## 실행한 명령과 결과

`node tests/api.cjs` — **24개 PASS**, page error 0. 실제 API 호출 대신 Playwright route 가상 응답을 사용했다. API ZIP은 시험 도구로 저장하고 fflate로 독립 해제했다.

`node tests/run.cjs` — 기존 로컬 **39개 PASS**, page error 0, 자산 준비 후 로컬 데이터 요청 0. 가상 100개 CSV/XLSX와 약 1MiB 본문·30개 약 50MiB 파일, 실제 ZIP 다운로드/독립 해제, XSS/경로/수식/ZIP 예산 회귀를 다시 실행했다.

| 항목 | 판정 | 관찰 |
|---|---|---|
| JSON:API 관계/보드 ID/누락/승인 상태 | PASS (mock) | 게시물 3개 관찰, 기본 선택 2개, 누락 ID post_4 표시 |
| 메타데이터와 첨부 분리 | PASS (mock) | 게시물/첨부정보 GET 후 CDN 파일 요청 0, 사용자 체크/버튼 후에만 요청 |
| 키/서명 URL 내보내기 제외 | PASS (가상 키) | ZIP 모든 파일에서 가상 key/signature 문자열 없음, 브라우저 스토리지 0 |
| 첨부 요청 키·쿠키·referrer | PASS (mock) | 세 헤더 없음, 사용자 직접 파일 확인 필요 |
| 로그인 HTML 실패·부분 처리 | PASS (mock) | 두 첨부 중 정상 바이트 하나만 확보, 다른 하나 failed/미확보 유지 |
| 실패 항목만 재시도 | PASS (mock) | 기존 파일을 재요청하지 않고 실패 하나만 다시 확보 |
| 429/503/권한/중지 | PASS (mock, 가상 시계) | Retry-After·기본 60초 계산, 제한 재시도, 401 1회, 대기 즉시 취소 |
| next 링크/부분 페이지 | PASS (mock) | 실제 응답 URL만 사용, 외부 출처 차단, 다음 페이지 실패 시 확보한 본문 보존 |
| 파일 중지·중복·MIME·실제 바이트·0바이트 | PASS (mock) | cancelled에서 saved로 표시하지 않음, 같은 URL 파일 1개, 부적합 응답/예산 거부 |
| 기존 로컬 정리 | PASS | 39개 회귀와 ZIP 압축 해제, 로컬 데이터 요청 0 |
| 실제 사용자 API 자격/키/관리자 권한 | NOT_RUN | 승인된 실계정/키/보드 없음 |
| 실제 Pages에서 API·첨부 CORS | NOT_RUN | 앱의 기존 공개 페이지 존재와 별개로 인증 읽기 미시험 |
| 실제 원격 첨부 바이트/원본 해상도 | NOT_RUN | mock 바이트만 시험, 실제 성공 건수 보고하지 않음 |
| 실제 OS 폴더 승인/쓰기 | NOT_RUN | 기존 mock writer 검증 범위 유지 |

최종 실행의 FAIL assertion은 없다. 개별 요청의 네트워크 대기는 사용자가 중지할 수 있으나 자동 타임아웃은 이번 단계에 추가하지 않았다. 데이터가 큰 응답은 역직렬화 후 전체 응답 20MiB 예산을 검사하므로 무제한 스트리밍 파서가 아니다. 지원하지 않는 구조는 성공을 만들지 않고 수동 확인으로 남긴다.

## 실행 순서와 다음 조건

이번 파일을 Pages에 반영한 뒤 ‘공식 API 연결’ 패널에 링크/ID와 본인 키를 입력 → ‘공식 API로 게시물 가져오기’ → 목록/선택·미확보 확인 → 상세에서 직접 원본 파일·지원 호스트 확인 → 별도 내려받기 → 기존 폴더/ZIP 저장 순서로 사용한다. 키는 입력창에서 요청 직전에 지워지며 다시 진단하려면 재입력한다. 자동 원격 읽기를 원하지 않으면 로컬 가져오기만 사용한다.

실연동 검증에는 API 자격·관리자 권한이 있는 사용자의 승인된 비식별 보드와 실제 Pages 출처가 필요하다. 원본 파일임이 확인된 호스트별 CORS와 파일 응답을 별도 검증한 뒤 호스트 목록을 확대한다. API 키/원문/학생자료는 저장소·시험 로그·공개 문서에 넣지 않는다. T-03 발췌/개인정보 검토/재창작 묶음은 다음 단계이다.

## 변경 파일과 배포 상태

추가: assets/js/api-client.js, api-collection.js, attachment-download.js, tests/api.cjs, docs/T02_REPORT.md, T02_API_RESULTS.json, T02_LOCAL_RESULTS.json.

수정: index.html, assets/js/app.js, padlet-api.js, export.js, README.md, PRD.md 구현 메모, TASKS.md, ACCEPTANCE.md 기록, docs/FEASIBILITY.md·PRIVACY.md.

이번 후속 변경은 로컬 구현/검수까지 수행했으며 커밋·푸시·Pages 갱신은 아직 수행하지 않았다. 사용자가 웹 업로드한 원격 기존 main 기록은 변경하지 않았다.
