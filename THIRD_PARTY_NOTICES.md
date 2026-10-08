# 포함 라이브러리

검토일 2026-10-08. 런타임 CDN 요청 없음. 아래 제작자 배포본을 assets/vendor에 포함하고 버전을 고정했다. DOMPurify는 넣지 않았다. 원문 HTML은 inert DOM으로 텍스트만 추출하고 화면은 textContent, 출력 HTML은 escaping하여 실행 태그/원격 리소스를 넣지 않는다.

| 라이브러리 | 버전 | 라이선스 | 공급 경로 |
|---|---|---|---|
| SheetJS CE | 0.20.3 | Apache-2.0 | https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js |
| fflate | 0.8.2 | MIT | https://registry.npmjs.org/fflate/-/fflate-0.8.2.tgz 의 package/umd/index.js |

제작자 문서: https://docs.sheetjs.com/docs/getting-started/installation/standalone/ 및 https://github.com/101arrowz/fflate . 라이선스 전문은 vendor의 xlsx-LICENSE.txt와 fflate-LICENSE.txt에 보관했다. XLSX 수식/매크로를 실행하지 않는다. fflate의 streaming Unzip으로 실제 해제 바이트를 센다. 전체 자료는 메모리에 보관되며 대용량 무제한 지원을 의미하지 않는다.

SHA-256은 동봉 파일 기준이며 docs/vendor-hashes.json에 기록한다. 검토는 배포 출처·라이선스·고정 버전·실제 동작 시험 범위이며 보안 감사 인증이 아니다.
