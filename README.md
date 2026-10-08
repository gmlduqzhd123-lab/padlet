# 엽쌤의 패들렛 정리함

GitHub Pages용 HTML/CSS/Vanilla JavaScript 정적 앱. T-00 진단, T-01 로컬 정리 MVP, T-02 조건부 공식 API 수집 경로를 구현했다. Node 서버·빌드·확장 설치·외부 DB·생성형 AI API는 앱 실행에 필요하지 않다.

## 실행과 사용

2026-10-09 T-02 후속 수정본 배포 완료: 기본 버튼은 ‘게시물 가져오기’이며 최초 입력한 키를 현재 탭에서 유지한다. 고급 연결 진단과 첨부정보 해석을 개선했다. 사용자 후속 요청에 따라 main/Pages에 반영했고 공개 출처 가상 파일 가져오기·ZIP 출력 시험 5개가 통과했다. 실제 인증 API/원본 파일 동일성은 미검증이다. 최신 구현·배포 검수는 [T02_FIX_REPORT.md](docs/T02_FIX_REPORT.md)를 따른다.

공개 앱: [엽쌤의 패들렛 정리함](https://gmlduqzhd123-lab.github.io/padlet/). 2026-10-09 T-02 조건부 API 수집과 연결 안내 수정본을 GitHub main에 전송하고 Pages 배포 성공을 확인했다. 공개 출처에서 가상 CSV/XLSX·첨부 ZIP 가져오기와 ZIP 출력 시험 5개가 통과했다. 진입점은 index.html이다. 실제 Pages의 인증 API/첨부 CORS는 NOT_RUN이다. [배포 검수 기록](docs/DEPLOYMENT_REPORT.md).

1. 앱에서 링크를 입력하고 ‘게시물 가져오기’를 누른다. 처음에만 키를 입력하고 다시 누르면 실제 API 수집을 시작한다. 키는 현재 탭에만 유지된다. 보드 ID 직접 입력·주소 형식만 확인·개별 GET 진단은 고급 패널에 있다. 키 없이 사용하려면 CSV/XLSX·첨부 ZIP 가져오기로 이동한다.
2. 패들렛에서 내보낸 CSV/XLSX(게시물 시트) 또는 지원 JSON을 선택한다. CSV가 깨지면 EUC-KR/CP949를 선택한다.
3. 제목·본문·섹션·작성자·작성일·원문 링크·첨부·ID 열을 확인한다. 첨부 ZIP/개별 파일을 선택하고 **열 연결 적용 · 가져오기**를 누른다.
4. 검색·섹션·유형 필터·선택 제외를 사용한다. 동일 이름 첨부는 ambiguous로 남는다. 상세의 파일 선택으로 수동 연결한다. 미연결 파일도 별도 목록과 출력 폴더에 남는다.
5. 원문과 규칙 기반 문단 정리본을 비교한다. 작성자/날짜 옵션은 정리본에만 적용한다.
6. 포함 자료와 개인정보 확인란을 선택한다. Chrome/Edge 지원 환경은 폴더를 선택하여 새 작업 폴더에 쓴다. 그 외에는 ZIP을 다운로드한다.
7. ZIP은 다운로드 목록에서 저장 위치를 확인하고 압축을 풀어 manifest, 대조표, 미확보 목록을 확인한다. **ZIP 생성/다운로드 시작은 디스크 저장 성공을 뜻하지 않는다.**

ES Modules와 Worker를 사용하므로 file://로 index.html을 더블클릭하는 방식은 지원하지 않는다. 사용자에게 로컬 서버 설치를 요구하지 않으며 운영 방식은 GitHub Pages이다. 개발용 자동 시험만 일회성 HTTP 출처를 사용한다.

## 구현 범위

- T-02: API 링크/보드 ID → JSON:API 게시물/섹션 → 공식 첨부정보 해석 → 사용자 후보/지원 호스트 선택 → 별도 파일 바이트 확보 → 폴더/ZIP 저장. 공식 첨부정보 필드는 previewImageUrl/embedCode/poll이며 원본 다운로드 필드는 확인되지 않았다. 게시물 첨부 주소는 원본 미확인 후보로만 취급한다. 현재 파일 후보 호스트는 문서의 업로드 예시에 있는 cdn.padlet.dev만 지원한다. 미리보기용 Google Storage 예시는 다운로드 허용 목록에 추가하지 않았다.
- 초당 1회 API 메타데이터 요청, 429 대기/제한 재시도, 5xx 제한 재시도, 중지/부분 결과 보존, 누락 ID, 검토 대기·예약·미확인 상태 기본 선택 제외. 다음 페이지는 실제 응답의 동일 출처/보드 URL만 따른다.
- API 키·첨부 인증 헤더 분리. 서명 URL은 세션 메모리만 사용한다. 외부 보기 링크/지원하지 않는 호스트/첨부정보 원본 다운로드 스키마 미확인은 수동 확인으로 남긴다. 자세한 범위는 [T-02 보고서](docs/T02_REPORT.md)에 있다.

- HTTPS 패들렛 링크와 16/20자 보드 ID 후보 진단. 지원 도메인은 padlet.com/www.padlet.com이며 팀 커스텀 도메인은 자동 해석하지 않는다.
- 공식 보드/첨부정보 GET 진단은 별도 어댑터. 키는 탭 메모리만 사용하고 요청 직전 입력창을 비운다. 같은 작업의 다음 진단/가져오기에는 재입력이 필요 없다. 연결 해제는 키를 지우고 요청을 취소한다. 응답 원문/키를 로그·출력에 넣지 않는다.
- CSV 따옴표/쉼표/여러 줄 처리, XLSX 시트 선택·셀 하이퍼링크·표시 날짜 보존, 수동 열 매핑, 명시적 JSON 스키마.
- ZIP 경로/심볼릭 링크/중복 경로/암호화/실제 해제 바이트 검사. 정확 경로/유일한 파일명 연결과 수동 연결. 첨부 ID 기반 연결은 파일별 명시 ID 스키마가 없어 미지원이다.
- 원문 JSON/TXT, 정리 TXT/MD/독립 HTML, 섹션별/게시물별 문서, 안전한 CSV 대조표·미확보 자료, 확보 파일·미연결 파일.
- 새 작업 하위 폴더만 쓰고 스트림 close 이후 saved 기록. 일부 쓰기 실패는 목록에 남기며 다른 파일을 계속 처리한다. ZIP 포함은 packed로 구분한다.
- 파일 읽기/해제는 로컬 Worker이며 중지 버튼은 기존 가져온 프로젝트를 보존한다. 로컬 처리 중 원격 이미지·첨부 자동 요청은 없다.

## 지원 JSON 1.0

```json
{"schemaVersion":"1.0","posts":[{"titleOriginal":"가상 제목","bodyOriginal":"가상 본문\n\n123","sectionName":"가상 섹션","authorOriginal":null,"createdAtOriginal":null,"sourceUrl":null,"sourcePostId":null,"attachmentRefs":["자료.txt"]}]}
```

필수는 schemaVersion 1.0, posts 배열, 게시물의 문자열 bodyOriginal이다. 앱의 원문 JSON에 포함된 sections/attachmentIds/attachments 관계도 읽는다. 임의의 JSON/API 응답은 해석하지 않는다. XLSX 댓글 시트는 자동 합치지 않으며 게시물 시트를 직접 선택한다.

## 제한과 검증

실제 API 자격·관리자 권한·Pages CORS·원격 첨부 바이트 확보는 **NOT_RUN/UNVERIFIED**이다. T-02는 조건부 코드/가상 시험 완료이며 실계정 자동 수집 검증 완료가 아니다. T-03 발췌/재창작은 미구현이다. 입력 파일이나 API 응답을 전체 최신 보드 완료라고 표시하지 않는다. 댓글은 이번 단계에서 기본 제외한다.

실제 OS 폴더 선택/승인/디스크 쓰기는 NOT_RUN이며 writer와 취소는 mock 시험이다. Chrome 다운로드를 테스트 도구가 받아 독립 압축 해제한 ZIP 경로는 PASS이다. 모든 해제 바이트를 메모리에 보관하므로 무제한 스트리밍은 아니다. HWP/PPTX 첨부 내부 내용은 분석하지 않는다.

초기 한도: 입력 ZIP/XLSX 100MiB, 개별 첨부 50MiB, 해제 합계 500MiB, ZIP 항목 5,000개, 본문 합계 20MiB/게시물 1MiB, 결과 ZIP 원본 합계 100MiB. ZIP64/암호화/안전하지 않은 경로는 미지원이며 중첩 ZIP은 재귀 해제하지 않는다.

검증 상세: [연결 가능성](docs/FEASIBILITY.md), [시험 보고서](docs/TEST_REPORT.md), [개인정보 정책](docs/PRIVACY.md), [라이브러리 기록](THIRD_PARTY_NOTICES.md).

## 개발 시험

`node tests/api.cjs` — 가상 API/파일 호스트 응답 24개 회귀 시험. 실제 API 요청 성공이 아니다. `docs/T02_API_RESULTS.json`에 검수 snapshot을 기록했다.

`node tests/run.cjs` — Codex에 묶인 Playwright와 설치된 Chrome을 사용한다. 다른 개발 환경에서는 tests/run.cjs의 Playwright 경로를 변경한다. 앱의 필수 실행 의존성은 아니다. 시험은 localhost의 /repo/ 하위 경로를 열고 종료한다.

tests/fixtures에는 생성한 가상 CSV/XLSX/ZIP만 있다. 결과 ZIP·스크린샷·실행 기록은 Git에서 제외한 test-results에 생성된다. 사용자 자료는 저장소 밖에 보관한다.
