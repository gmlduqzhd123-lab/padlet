# GitHub Pages 배포 검수 · 2026-10-09

공개 주소: https://gmlduqzhd123-lab.github.io/padlet/

사용자의 ‘배포까지 해줘’ 요청에 따라 기존 원격 main 커밋 f51d37f의 이력을 보존하는 별도 Git 체크아웃에서 배포했다. 앱 변경 커밋 6ce5de51d36148aeb9d46ed7529cd181f38661ad를 origin main에 일반 push했다. 강제 push는 하지 않았다. [Pages 작업](https://github.com/gmlduqzhd123-lab/padlet/actions/runs/37853250879)의 build/deploy 성공과 실제 공개 새 화면을 확인했다.

배포 변경: index.html, assets/js/app.js·padlet-api.js·export.js, 신규 api-client.js·api-collection.js·attachment-download.js, tests/api.cjs 및 요구/검수/연동/개인정보 문서. 후속 검수 기록으로 tests/pages.cjs와 이 보고서를 추가한다. 사용자 학생자료·원문·키·새 시험 이미지/결과 ZIP은 추가하지 않았다. 이전 원격 업로드에 있던 가상 시험 이미지와 사용자 지침 문서는 보존했다.

구현 기능: 주소 형식 검사와 실제 API 연결 검사 분리, 키 없는 다음 단계 안내, 조건부 공식 API 게시물/섹션 읽기, 확인한 지원 호스트 첨부의 별도 바이트 확보, 원문/정리본/저장/미확보 구분. 로컬 CSV/XLSX·첨부 ZIP은 API 키 없이 동작한다.

Windows/Chrome/Playwright 공개 출처에서 `node tests/pages.cjs` 실행: 5개 PASS.

1. 실제 공개 URL HTTP 200, 제목/새 버튼 확인, Worker 준비 완료.
2. 가상 링크의 주소 확인과 키 없는 연결/가져오기에서 안내 표시, 원격 데이터 요청 0.
3. 가상100.csv 실제 로컬 가져오기, 게시물 100개/원문 숫자/미확보 항목 확인.
4. 가상100.xlsx와 첨부 ZIP 실제 로컬 가져오기 및 동일 기준 확인.
5. ZIP 다운로드를 시험 도구로 저장하고 독립 압축 해제. 원문 JSON/정리 HTML 존재, 앱의 다운로드 시작/디스크 저장 미확인 구분, 스크립트 오류 0/실패 자산 요청 0/로컬 자료 관련 원격 요청 0.

입력은 모두 생성한 가상·비식별 자료다. 가상 학생자료조차 앱을 통해 서버로 업로드하지 않는다. ZIP 저장 검수는 자동화 도구가 다운로드 파일을 읽은 결과이며, 앱 자체는 사용자 디스크 저장을 확인했다고 표시하지 않는다. 이전 로컬 검수 `node tests/api.cjs` 27개 mock PASS / `node tests/run.cjs` 39개 PASS 기록도 유지한다.

초기 공개 시험은 Pages 반영 전의 이전 버튼을 확인해 FAIL이었다. 배포 대기 후 재실행은 5개 모두 PASS다. Pages builds REST 엔드포인트는 인증 없는 호출에서 404여서 Actions 공개 실행 상태 및 실제 화면으로 검수했다. 최종 공개 시험 실패 항목은 없다.

NOT_RUN: 실제 사용자 API 자격/키/관리자 권한, 실제 인증 API의 Pages CORS, 실제 원격 첨부 원본 바이트, 실제 OS 폴더 사용자 승인. 키/승인된 비식별 실보드가 제공되지 않았으며 가상 성공을 실제 패들렛 수집 성공으로 표시하지 않는다.

사용 순서: 공개 URL 열기 → 주소 확인 → 본인 브라우저에 API 키 입력 후 연결 검사/게시물 가져오기. 키가 없으면 CSV/XLSX와 첨부 ZIP → 열 연결 적용 → 자료/원문 확인 → 폴더 또는 ZIP 출력. 예전 버튼이 보이면 Ctrl+F5로 새로고침한다. 키는 채팅·GitHub에 올리지 않는다. 다음 실연동 시험에는 API 자격/관리자 권한이 있는 승인된 비식별 보드와 사용자 브라우저 세션의 키가 필요하다.
