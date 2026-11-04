# STEP 66 — 13개 NXT 시세 계약 결손 현황

기준일: 2026-11-04. STEP 65 목록과 비교했다. `PARTIAL`은 일부 관련 정보가 확인됐으나 해당 KIS quote/API 계약을 충족하지 않았다는 뜻이다. 완전 해소는 0개다.

| # | 계약 결손 | STEP 65 | STEP 66 | 신규 공식 근거와 범위 | 완전 해소 | 필요한 추가 자료 | 담당 공급자 | 차단 기능 | 다음 조치 |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | 기준가격 필드·세션 기준 | UNVERIFIED | UNVERIFIED | NXT 홈페이지는 시장 통계에 `기준가 대비`와 AFTER의 `KRX종가 대비` 표시를 구분. KIS H0NXCNT0 일반 base-price field는 확인 안 됨. | 아니오 | KIS 기준가 필드·세션별 기준시각·산식 | KIS | 유효 quote·등락률 | 문의 KIS 2 |
| 2 | 등락률 산식·기준·배율·반올림 | UNVERIFIED | PARTIAL | NXT 홈페이지 집계 문구는 기준시점 대비 시가총액 증감률. 개별 KIS `PRDY_CTRT` 산식/단위와 동일하다는 근거는 아님. | 아니오 | KIS field-level formula, comparator, scale, rounding | KIS | 시세 검증·정확한 TOP10 | 문의 KIS 2 |
| 3 | 현재가 wire type·가격 표현 단위 | UNVERIFIED | UNVERIFIED | 공식 H0NXCNT0 샘플에 `STCK_PRPR` 컬럼 식별자와 순서만 확인. | 아니오 | 타입·부호·호가단위/가격표현 | KIS | quote 생성 | 문의 KIS 1 |
| 4 | 거래대금 단위 및 누적 의미 | UNVERIFIED | PARTIAL | NXT 홈페이지 시장통계는 `거래대금(원)`으로 표시. KIS `ACML_TR_PBMN` wire unit/시장별 누적 범위는 여전히 미확인. | 아니오 | KIS 필드 단위·통화·세션/일별 집계 규칙 | KIS | 거래대금 비교·TOP10 필터 | 문의 KIS 3 |
| 5 | 누적 거래량 집계·리셋 범위 | UNVERIFIED | UNVERIFIED | H0NXCNT0 샘플에서 `CNTG_VOL`, `ACML_VOL` 이름 순서 확인. 기간/세션 리셋은 없음. | 아니오 | PRE→MAIN→AFTER 누적 범위, 리셋 시점 | KIS | 세션별 거래량 순위 | 문의 KIS 3 |
| 6 | 체결시각 형식·시간대·날짜 경계 | UNVERIFIED | UNVERIFIED | `STCK_CNTG_HOUR`, `BSOP_DATE` 컬럼의 존재와 순서만 확인. | 아니오 | 형식, KST/UTC, 휴장일 경계, `observedAt`와의 관계 | KIS | freshness/session gate | 문의 KIS 1 |
| 7 | provider source timestamp | UNVERIFIED | UNVERIFIED | 출력 컬럼 목록에서 독립적인 source-generated timestamp 확인 안 됨. | 아니오 | source timestamp 제공 여부/필드명·정밀도 | KIS | 최신성/지연 판정 | 문의 KIS 1 |
| 8 | 지연 flag/지연 허용 정책 | UNVERIFIED | PARTIAL | NXT 웹사이트는 개별 종목정보를 20분 지연이라고 안내. 이는 KIS H0NXCNT0 payload의 지연 여부나 해당 공급 권리를 설명하지 않음. | 아니오 | KIS feed별 실시간/지연 분류와 timestamp lag policy | KIS, NXT | LIVE 표시·freshness | 문의 KIS 4, NXT 5 |
| 9 | PRE·AFTER 순위 API 범위 | UNVERIFIED | PARTIAL | KIS config는 NXT 선택 `NX`, rank path, count 및 등락률 정렬 parameter를 기록. 세션 분리/결과 coverage 미확인. 공개 예제의 rank sort 값 `0`과 config의 `0000` 표기도 다름. | 아니오 | PRE/AFTER scope, 정확한 parameter, maximum/continuation, rank reference | KIS | session TOP10/전체성 | 문의 KIS 4 |
| 10 | 최신 전체 NXT 유니버스·세션 적격성 | UNVERIFIED | PARTIAL | KIS portal은 KOSPI(NXT)/KOSDAQ(NXT) `.mst` 범주와 다운로드 기능을 문서화. 원본 bytes 미취득. NXT 4분기 공지는 606종목 유지 예정, 첨부 0개; 후속 제외 공지 있음. | 아니오 | 현재 전체 ticker file, 기준일·완전성, PRE/AFTER flags, all deltas | KIS, NXT | NXT TOP10 전체성·eligibility | KIS file semantics 확인, NXT 최신 master 요청 |
| 11 | 거래일 달력·휴장/세션 예외 | UNVERIFIED | PARTIAL | NXT 규칙은 월~금 중 시장휴일 제외, 정부 공휴일·토요일·12/31 등 및 연초/수능일 조정 설명. 날짜별 calendar와 임시휴장 전체 목록은 없음. | 아니오 | 날짜별 authoritative calendar와 exception feed | NXT | 세션/freshness gate | 문의 NXT 4 |
| 12 | 실제 payload authenticity | UNVERIFIED | UNVERIFIED | 공식 예제/문서는 payload identity를 인증하지 않으며 이번 단계 API 미호출. | 아니오 | 승인된 실응답, 원천 식별, 안전한 digest/검증기록 | KIS | LIVE 승격 | 권한 확보 뒤 별도 승인된 격리 검증 |
| 13 | 이용 및 공개 재배포 권한 | UNVERIFIED | BLOCKED | KIS 공개 안내는 개인 시세를 본인 자산 투자목적으로 제한하고 제3자 제공 불가; 제휴 앱 화면표시는 거래소/코스콤 등 별도 정보이용계약 필요로 안내. EDGE NXT 계정별 승인 없음. | 아니오 | 본 서비스·배포범위 명시 계약/권한 확인 | KIS, 거래소/코스콤 | public JSON/Pages actual quote | 문의 KIS 6, 운영 공개 차단 유지 |

## 집계

- 완전 해소: 0 / 13
- 부분 근거 확인: 6 / 13 (2, 4, 8, 9, 10, 11)
- 미해결: 6 / 13 (1, 3, 5, 6, 7, 12)
- BLOCKED: 1 / 13 (13)
- 여기서 부분 근거 6개도 LIVE 판정 통과나 계약 결손 해소로 세지 않는다.

## 공식 출처

- KIS H0NXCNT0 sample: <https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_functions_ws.py>
- KIS ranking config: <https://github.com/koreainvestment/open-trading-api/blob/main/MCP/Kis%20Trading%20MCP/configs/domestic_stock.json>
- KIS sample-call example: <https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_examples.py>
- KIS security master page: <https://apiportal.koreainvestment.com/apiservice-category>
- KIS use restrictions: <https://apiportal.koreainvestment.com/about-open-api>
- NXT current public page and market stats: <https://nextrade.co.kr/main.do>
- NXT 2026 Q4 roster-count notice (zero attachment): <https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=43&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=>
- NXT 2026-09-29 temporary exclusion: <https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=44&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=>
- NXT 2026-10-21 temporary exclusion: <https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=45&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=>
- NXT trading days and sessions: <https://nextrade.co.kr/en/transactionSys/content.do>
- NXT change-history page (previous-trading-day changes; max three-month search): <https://nextrade.co.kr/menu/transactionStatusConclusion/menuList.do>
