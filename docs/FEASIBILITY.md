# 연결 가능성 검증 · T-00

검증일: 2026-10-08 (Asia/Seoul). Windows, Chrome 154.0.8037.98 / Playwright headless. 출처: 개발 시험의 `http://127.0.0.1:<임시포트>/repo/`. 데이터: 생성한 가상·비식별 자료만 사용. 실제 보드·API 키는 제공되지 않았다.

## 공식 문서 대조

- [Get board by id](https://docs.padlet.dev/reference/get-board-by-id): GET api.padlet.dev/v1/boards/{id}, include=posts,sections, x-api-key 헤더, 보드 소유자/관리자 접근, 엔드포인트 ID 길이 16–22.
- [Board object](https://docs.padlet.dev/reference/board-object): 보드 URL 끝 ID는 16 또는 20자. URL은 이 형식의 후보만 해석하고 추측으로 마지막 16자를 잘라내지 않는다. 형식이 다른 경우 Developer 메뉴에서 확인하도록 안내한다.
- [Attachment data](https://docs.padlet.dev/reference/get-post-attachment-data): GET api.padlet.dev/v1/posts/{id}/attachmentData. 메타데이터 읽기와 파일 바이트 확보는 별도다.
- [Authentication](https://docs.padlet.dev/reference/authentication): 키/계정 자격을 실제 계정으로 시험해야 한다.

2026-10-08 공식 문서 페이지를 조회했다. 문서의 존재와 curl 응답은 실제 Pages 브라우저 CORS 허용 증거가 아니다. 공식 문서의 일부 .md 주소는 조회 도구에서 접근 실패했으며 일반 문서 페이지를 근거로 사용했다.

## 실제 환경과 로컬 시험

| 항목 | 상태 | 근거/제약 |
|---|---|---|
| 링크 형식·ID 후보 | PASS | 실제 브라우저 주소 입력 + 유사 도메인/사용자정보/위험 프로토콜 거부 |
| API 이용 자격 / 키 유효성 | NOT_RUN | 사용자 실계정·키 없음 |
| 대상 보드 관리자 권한 | NOT_RUN | 승인된 실보드 없음 |
| localhost의 실제 API 읽기 | NOT_RUN | 실제 키 없음; 무인 인증 요청하지 않음 |
| 실제 GitHub Pages API/CORS | NOT_RUN | 공개 배포/실계정 시험 미수행 |
| API 게시물·섹션 관계 수집 | NOT_RUN | T-02 범위이며 T-00 진단은 실제 자동 가져오기를 하지 않음 |
| 실제 첨부정보 읽기 | NOT_RUN | 진단 어댑터만 구현 |
| 원격 첨부 파일 바이트 확보 | NOT_RUN | 첨부 호스트를 추정하지 않음, 원격 파일 수집 미구현 |
| showDirectoryPicker 기능 탐지 | PASS | 브라우저에서 지원 감지, 미지원 시 ZIP 안내 |
| 실제 OS 폴더 승인·쓰기 | NOT_RUN | 네이티브 선택창과 사용자 승인은 자동 시험하지 않음 |
| CSV/XLSX 열 매핑·본문·출처 | PASS | 가상 게시물 100개씩, XLSX 하이퍼링크·복수 시트 |
| ZIP 첨부 연결 | PASS | 실제 파일 바이트/모호한 후보/누락/미연결 구분 |
| 원문과 정리본 분리 | PASS | 원문 유지, 사본에서만 문단 정돈, 결측값 유지 |
| ZIP 다운로드·해제 | PASS | Chrome 다운로드 이벤트 → 시험 파일 저장 → 독립 ZIP 해제, 50MiB 첨부 roundtrip |
| 로컬 데이터 네트워크 요청 | PASS | 자산/Worker 준비 후 전체 로컬 흐름 요청 0건 |
| 가상 키 유출 확인 | PASS (제한 범위) | 출력 파일·브라우저 스토리지에 가상 키 없음, mock에서 허용 출처/헤더/리다이렉트 차단 확인 |

## 모의 시험 (실제 패들렛 성공 아님)

INVALID_API_KEY / NOT_ADMIN / NOT_PAYING_USER 응답과 일반 fetch 오류 안내는 PASS. 일반 네트워크 실패를 CORS라고 확정하지 않는다. 폴더 스트림 close 이후 saved, 쓰기 실패, 폴더 취소 후 자료 보존은 mock PASS이다. 실제 OS 폴더 저장은 위와 같이 NOT_RUN이다.

## 판정과 다음 조건

T-00 로컬/모의 검증 및 진단 구현 완료. T-01 로컬 ZIP 결과물 경로 PASS. 공식 API 자동 수집은 **UNVERIFIED**, 실보드 성공 건수는 보고하지 않는다.

다음 실연동 시험은 승인된 비식별 보드, 이용 자격과 관리자 권한이 확인된 사용자, 본인 세션의 키, 실제 Pages 출처가 필요하다. Pages에서 보드 GET/첨부정보 GET/파일 바이트 확보/폴더 쓰기 종료를 각각 관찰해야 한다. 키는 문서·저장소·로그에 기록하지 않는다. 제한이 있으면 로컬 내보내기를 계속 사용한다.
