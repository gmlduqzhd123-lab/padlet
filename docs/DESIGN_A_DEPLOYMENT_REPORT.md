# 1안 공개 배포 검수 · 2026-10-15

사용자 요청: ‘1안 버전으로 적용해서 배포까지 완료해’.

공개 주소: https://gmlduqzhd123-lab.github.io/padlet/

이번 변경: `index.html`, `assets/css/app.css`, `assets/js/app.js`, `tests/design.cjs`, `PRD.md`, `TASKS.md`, `ACCEPTANCE.md`, 디자인 적용/배포 보고서, README 디자인 안내.

크림·세이지 ‘아카이브 서재’ 화면과 반응형 단계 메뉴·키보드 건너뛰기·게시물 선택 강조를 적용했다. 최신 원격 main 050050b에 추가된 설치·QR 버튼, 설치 안내, QR 이미지, 앱 고유 manifest, 공유 메타데이터 및 하단 문구를 유지했다. 기존 원문·정리본·첨부 바이트·미확보 목록·ZIP/폴더 저장 구분도 유지한다.

검수 명령: `node tests/api.cjs` 47 PASS(모의 API), `node tests/run.cjs` 39 PASS(가상 CSV/XLSX/ZIP), `node tests/design.cjs` 8 PASS(설치 안내·QR 포함), `git diff --check` PASS. 최신 원격의 기존 파일을 보존하는 별도 체크아웃에서 정상 push하며 강제 push는 하지 않는다. 사용자 자료·키·결과 ZIP·새 스크린샷은 배포 커밋에 넣지 않는다.

공개 출처 시험과 Pages 실행 상태는 배포 후 확인하여 이 보고서의 후속 항목에 기록한다. 이 사전 기록만으로 공개 배포 성공을 주장하지 않는다.

NOT_RUN: 실제 API 키·승인 보드·인증 API CORS·실첨부 원본, 실제 OS 폴더 승인, 실제 휴대폰의 홈 화면 설치. 설치/QR 시험은 브라우저 안내와 다이얼로그 시험이다.

사용 순서: 공개 URL → 링크와 최초 키 입력 또는 내보낸 CSV/XLSX/JSON·첨부 ZIP → 자료 선택/첨부 확인 → 원문·정리본 비교 → 개인정보 확인 → 폴더/ZIP 저장. 실연동 검수에는 승인된 비식별 보드와 자격 있는 키가 필요하며 키는 사용자 브라우저에만 입력한다.
