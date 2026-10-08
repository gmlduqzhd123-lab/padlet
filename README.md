# 엽쌤의 패들렛 정리함

GitHub Pages용 HTML/CSS/Vanilla JavaScript 정적 앱. T-00 진단과 T-01 로컬 정리 MVP를 구현했다. Node 서버·빌드·확장 설치·외부 DB·생성형 AI API는 앱 실행에 필요하지 않다.

## 실행과 사용

GitHub 저장소 https://github.com/gmlduqzhd123-lab/padlet.git 를 로컬 origin에 연결했다. 현재 작업에서 커밋·푸시·공개 배포는 수행하지 않았다. 저장소에 앱을 올린 후 Settings → Pages → Deploy from a branch → main / root를 선택하면 진입점은 index.html이다. 실제 Pages 환경은 NOT_RUN이다.

1. Pages에서 앱을 연다. 링크 진단은 선택 사항이다. API 키 없이 로컬 기능을 사용할 수 있다.
2. 패들렛에서 내보낸 CSV/XLSX(게시물 시트) 또는 지원 JSON을 선택한다. CSV가 깨지면 EUC-KR/CP949를 선택한다.
3. 제목·본문·섹션·작성자·작성일·원문 링크·첨부·ID 열을 확인한다. 첨부 ZIP/개별 파일을 선택하고 **열 연결 적용 · 가져오기**를 누른다.
4. 검색·섹션·유형 필터·선택 제외를 사용한다. 동일 이름 첨부는 ambiguous로 남는다. 상세의 파일 선택으로 수동 연결한다. 미연결 파일도 별도 목록과 출력 폴더에 남는다.
5. 원문과 규칙 기반 문단 정리본을 비교한다. 작성자/날짜 옵션은 정리본에만 적용한다.
6. 포함 자료와 개인정보 확인란을 선택한다. Chrome/Edge 지원 환경은 폴더를 선택하여 새 작업 폴더에 쓴다. 그 외에는 ZIP을 다운로드한다.
7. ZIP은 다운로드 목록에서 저장 위치를 확인하고 압축을 풀어 manifest, 대조표, 미확보 목록을 확인한다. **ZIP 생성/다운로드 시작은 디스크 저장 성공을 뜻하지 않는다.**

ES Modules와 Worker를 사용하므로 file://로 index.html을 더블클릭하는 방식은 지원하지 않는다. 사용자에게 로컬 서버 설치를 요구하지 않으며 운영 방식은 GitHub Pages이다. 개발용 자동 시험만 일회성 HTTP 출처를 사용한다.

## 구현 범위

- HTTPS 패들렛 링크와 16/20자 보드 ID 후보 진단. 지원 도메인은 padlet.com/www.padlet.com이며 팀 커스텀 도메인은 자동 해석하지 않는다.
- 공식 보드/첨부정보 GET 진단은 별도 어댑터. 키는 페이지 메모리만 사용하고 요청 직전 입력창을 비운다. 다음 진단에는 다시 입력한다. 응답 원문/키를 로그·출력에 넣지 않는다.
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

실제 API 자격·관리자 권한·Pages CORS·원격 첨부 바이트 확보는 **NOT_RUN/UNVERIFIED**이다. T-02 자동 수집·재시도·첨부 원격 큐, T-03 발췌/재창작은 미구현이다. 입력 파일을 전체 보드 완료라고 표시하지 않는다.

실제 OS 폴더 선택/승인/디스크 쓰기는 NOT_RUN이며 writer와 취소는 mock 시험이다. Chrome 다운로드를 테스트 도구가 받아 독립 압축 해제한 ZIP 경로는 PASS이다. 모든 해제 바이트를 메모리에 보관하므로 무제한 스트리밍은 아니다. HWP/PPTX 첨부 내부 내용은 분석하지 않는다.

초기 한도: 입력 ZIP/XLSX 100MiB, 개별 첨부 50MiB, 해제 합계 500MiB, ZIP 항목 5,000개, 본문 합계 20MiB/게시물 1MiB, 결과 ZIP 원본 합계 100MiB. ZIP64/암호화/안전하지 않은 경로는 미지원이며 중첩 ZIP은 재귀 해제하지 않는다.

검증 상세: [연결 가능성](docs/FEASIBILITY.md), [시험 보고서](docs/TEST_REPORT.md), [개인정보 정책](docs/PRIVACY.md), [라이브러리 기록](THIRD_PARTY_NOTICES.md).

## 개발 시험

`node tests/run.cjs` — Codex에 묶인 Playwright와 설치된 Chrome을 사용한다. 다른 개발 환경에서는 tests/run.cjs의 Playwright 경로를 변경한다. 앱의 필수 실행 의존성은 아니다. 시험은 localhost의 /repo/ 하위 경로를 열고 종료한다.

tests/fixtures에는 생성한 가상 CSV/XLSX/ZIP만 있다. 결과 ZIP·스크린샷·실행 기록은 Git에서 제외한 test-results에 생성된다. 사용자 자료는 저장소 밖에 보관한다.
