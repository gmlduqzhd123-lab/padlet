# 1안 공개 배포 검수 · 2026-10-15

사용자 요청: ‘1안 버전으로 적용해서 배포까지 완료해’.

공개 주소: https://gmlduqzhd123-lab.github.io/padlet/

이번 변경: `index.html`, `assets/css/app.css`, `assets/js/app.js`, `tests/design.cjs`, `PRD.md`, `TASKS.md`, `ACCEPTANCE.md`, 디자인 적용/배포 보고서, README 디자인 안내.

크림·세이지 ‘아카이브 서재’ 화면과 반응형 단계 메뉴·키보드 건너뛰기·게시물 선택 강조를 적용했다. 최신 원격 main 050050b에 추가된 설치·QR 버튼, 설치 안내, QR 이미지, 앱 고유 manifest, 공유 메타데이터 및 하단 문구를 유지했다. 기존 원문·정리본·첨부 바이트·미확보 목록·ZIP/폴더 저장 구분도 유지한다.

검수 명령: `node tests/api.cjs` 47 PASS(모의 API), `node tests/run.cjs` 39 PASS(가상 CSV/XLSX/ZIP), `node tests/design.cjs` 8 PASS(설치 안내·QR 포함), `git diff --check` PASS. 최신 원격의 기존 파일을 보존하는 별도 체크아웃에서 정상 push하며 강제 push는 하지 않는다. 사용자 자료·키·결과 ZIP·새 스크린샷은 배포 커밋에 넣지 않는다.

## 공개 반영 결과

앱 배포 커밋: `c023227ca563183d011f98fc5aec07331013cb5c`. 원격 main에 정상 push했고 [Pages 실행 38611403689](https://github.com/gmlduqzhd123-lab/padlet/actions/runs/38611403689)가 completed/success로 완료됐다. 실제 공개 HTML에 1안 hero와 사이드 메뉴가 있는 것을 확인했다.

- `node tests/pages.cjs`: 공개 출처 5 PASS. HTTP 200/Worker 준비, 키 없는 안내, 가상 CSV/XLSX·첨부 ZIP, ZIP 다운로드와 독립 압축 해제. 스크립트 오류·실패 자산 요청·로컬 자료 원격 요청 0건.
- `$env:PADLET_DESIGN_URL = 'https://gmlduqzhd123-lab.github.io/padlet/'; node tests/design.cjs`: 공개 출처 8 PASS. 키보드, 설치·QR 안내, 가상 파일 가져오기/선택/저장 상태, 390/768/1024px 가로 넘침 없음, 외부 요청·페이지 오류 0건.
- 최종 실패 0건. 실제 공개 사이트에서 시험한 입력은 모두 가상·비식별 자료이며 서버로 업로드하지 않았다.
- `test-results/design-pages-results.json`, 공개 시험 JSON 및 실제 화면 캡처는 로컬 Git 제외 폴더에 보관한다.

ZIP을 시험 도구로 받은 뒤 압축을 확인했으며 앱의 사용자 디스크 저장 확인을 의미하지 않는다. 공개 시험은 실제 API 계정의 연결 성공을 의미하지 않는다.

NOT_RUN: 실제 API 키·승인 보드·인증 API CORS·실첨부 원본, 실제 OS 폴더 승인, 실제 휴대폰의 홈 화면 설치. 설치/QR 시험은 브라우저 안내와 다이얼로그 시험이다.

사용 순서: 공개 URL → 링크와 최초 키 입력 또는 내보낸 CSV/XLSX/JSON·첨부 ZIP → 자료 선택/첨부 확인 → 원문·정리본 비교 → 개인정보 확인 → 폴더/ZIP 저장. 실연동 검수에는 승인된 비식별 보드와 자격 있는 키가 필요하며 키는 사용자 브라우저에만 입력한다.
