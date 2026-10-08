# T-00 / T-01 시험 보고서

실행일: 2026-10-08 (Asia/Seoul). Windows / Chrome 154.0.8037.98 headless / Node 24.15.0 / Codex 번들 Playwright. 시험 출처는 일회성 localhost의 `/repo/` 하위 경로이며 운영용 서버를 추가하지 않았다.

## 실행과 입력

- 명령: `node tests/run.cjs`. 초기 개발 중 브라우저 모듈 구문 오류·번들 XLSX의 Node 파일 쓰기 방식·미설치 headless 브라우저 경로를 수정했다. 최종 실행은 종료 코드 0, 페이지 오류 0건이다. 기존 오류를 성공으로 집계하지 않았다.
- 가상 100개 게시물, 섹션 10개 CSV/XLSX. 한글·쉼표·따옴표·목록·빈 줄·123이라는 수치·날짜/제목/작성자 결측·XSS 시도 포함. XLSX는 복수 시트와 원문 셀 하이퍼링크 포함.
- 가상 첨부 ZIP: 실제 바이트가 있는 두 파일, 누락 참조 하나, 경로가 다른 동일 이름 파일 두 개, 실행하지 않는 미연결 SVG 하나. 링크 하나는 linked_only로 보관.
- 추가 성능 입력: 100개 게시물 본문 약 1MiB, 30개 파일 합계 약 50MiB. 시험에서 생성하는 대용량 파일은 test-results에만 있고 Git에서 제외한다.
- 테스트 키는 `FICTIONAL_KEY_LEAK_PROBE` / `TEST_SECRET`라는 가상 식별 문자열이며 실제 자격정보가 아니다. API 응답은 mock이며 패들렛 보드 수집 성공이 아니다.

## 관찰 결과

최종 로그와 상세 assertion은 `TEST_RESULTS.json`에 기록했다. 일반 CSV 가져오기 171ms, XLSX 137ms, 본문 약 1MiB + 첨부 약 50MiB 가져오기 852ms. 이는 기준 PC 한 회 측정이며 모든 브라우저/규모의 성능 보장은 아니다.

| 검수 | 상태 | 실제 관찰 |
|---|---|---|
| AC-01 상대경로 | PASS (개발 출처) / 실제 Pages NOT_RUN | `/repo/index.html`에서 JS/CSS/vendor/Worker 로드. 실제 Pages 배포는 미수행 |
| AC-02/03 입력·본문·출처 | PASS | 100개 CSV와 XLSX, 셀 하이퍼링크·섹션·줄바꿈·결측 보존 |
| AC-04/05 API 오류 | PASS (mock) | 세 공급자 코드 각각 구분, HTTP 401이어도 NOT_ADMIN은 관리자 권한 안내. 네트워크 실패 원인 미확정 |
| AC-06 부분 확보 | PASS (로컬 입력) | 세 참조 중 두 파일 확보·하나 미확보. 누락이 본문/다른 첨부 처리를 막지 않음 |
| AC-07 폴더 쓰기 | PASS (mock) / 실제 OS NOT_RUN | close 이후 saved, 쓰기/하위 폴더 생성 실패는 failed. 실제 picker 승인/디스크 미시험 |
| AC-08 ZIP | PASS | 다운로드 이벤트 수신, 자동 시험이 ZIP을 저장하여 독립 해제. 앱은 ‘다운로드 시작’만 안내 |
| AC-09 취소 | PASS (mock) | 폴더 취소 안내, 기존 100개 자료 유지 |
| AC-10 키 | PASS (시험 범위) / 실제 키 NOT_RUN | 가상 키가 내보내기 전체 파일/스토리지에 없음. 허용 출처·GET·헤더·redirect error 모의 검사 |
| AC-11 XSS/경로/CSV | PASS (시험 범위) | script/onerror 실행·원격 이미지 요청 0, 위험 URL/탈출 경로 거부, Windows 예약명/NFC 정규화, CSV 위험 셀 앞 작은따옴표 |
| AC-12 ZIP bomb | PASS (축소 예산 회귀) | 실제 출력 10,000바이트 ZIP을 100바이트 예산으로 해제하여 중단. 실제 바이트 계수 사용. malformed ZIP/심볼릭 링크 거부 |
| AC-13 이름 충돌 | PASS | 같은 이름 두 후보를 ambiguous로 유지하고 수동 연결 후 user_confirmed. 임의 연결 없음 |
| AC-14/15 범위·원문 | PASS | 내보내기 파일 기준·전체 건수 unknown. raw 본문 유지, 정리본 별도, 없는 날짜를 만들지 않음 |
| AC-16/17 발췌·재창작 | NOT_RUN | T-03 범위, 미구현 |
| AC-18 로컬 네트워크 | PASS | 자산/Worker 로딩 후 로컬 가져오기·정리·출력 데이터 요청 0건. 독립 읽기 HTML은 오프라인에서 본문 표시·원격 요청 0건 |
| AC-19 실제 API | NOT_RUN / UNVERIFIED | 승인된 실계정·키·보드·Pages 출처 시험 없음 |
| AC-20 진실성 | 기록 완료 | 실제/API/mock/개발 출처를 구분하고 미실행을 NOT_RUN으로 표시 |

검색·섹션·자료유형 필터, 수동 연결, 표준 JSON, 0바이트 첨부, 비표준 열 수동 매핑 필요 상태, 390px 화면 가로 넘침 없음도 PASS. 50MiB 첨부 결과 ZIP을 독립 해제하여 30개 첨부와 미확보 0개를 확인했다.

최종 실행의 FAIL assertion은 없다. native 폴더 선택/사용자 승인, 실제 Pages 출처, 실제 API, Firefox/Safari, 최대 예산 전체 및 모든 회귀 조합은 시험하지 않았으며 PASS로 주장하지 않는다. 앱이 저장된 디스크 ZIP을 확인한 것이 아니라 개발 시험 도구가 파일을 받아 검증한 것이다.

## 재현

`node tests/run.cjs`를 실행한다. 번들 Playwright 경로가 다른 개발 PC는 tests/run.cjs 상단 경로를 조정한다. Chrome이 필요하다. 결과는 test-results/result.zip, large-result.zip, results.json, app-desktop.png, app-mobile.png에 생성된다. 테스트 서버는 명령 종료와 함께 종료되며 앱의 실행 의존성이 아니다.

실제 폴더 검수는 Pages를 Chrome/Edge로 열어 비식별 CSV/ZIP을 가져온 다음, 기존 파일이 있는 폴더를 선택한다. 기존 파일이 그대로인지, 새 작업 하위 폴더만 생성되는지, manifest의 saved/write-complete와 바이트 수가 실제 파일과 일치하는지 확인한다. 취소·권한 거부·디스크 쓰기 실패를 별도 시험한다. 다음 API 시험 조건은 FEASIBILITY.md에 있다.

## 이번 변경 파일

index.html, .nojekyll, .gitignore, assets/css/app.css, assets/js/{app,config,security,local-import,padlet-api,export,import-worker,worker-client}.js, assets/vendor의 고정 라이브러리/라이선스, tests/run.cjs 및 가상 fixtures, README.md, TASKS.md, ACCEPTANCE.md 기록, THIRD_PARTY_NOTICES.md, docs의 검증/개인정보/해시/시험 기록.

AGENTS.md와 PRD.md의 제품 제약은 유지했다. 금지된 서비스·원격 수집 서버·외부 AI·확장 설치는 추가하지 않았다. Git origin 연결만 수행했으며 커밋/푸시/공개 배포는 하지 않았다.
