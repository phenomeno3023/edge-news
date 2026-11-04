# STEP 64 — 공식 NXT 시세 계약 감사

확인일: 2026-11-03 (UTC). 조사 범위는 공식 공개 KIS/NXT 페이지와 KIS가 관리하는 공개 예제 코드다. 계정 로그인, 토큰 사용, 실제 시세 API 호출, 공개 파일 다운로드는 하지 않았다.

## 판정 요약

공식 KIS 예제 코드에서 NXT 실시간 체결 WebSocket `H0NXCNT0`, 종목코드 구독 키 `tr_key`, 응답 컬럼 목록 및 일부 필드 의미 라벨을 확인했다. 이는 **필드 이름/라벨을 문서화한 것**이며, 응답 데이터 타입·단위·기준가격 산식·진위 또는 계정별 접근 권한을 검증한 것은 아니다. 구현한 어댑터는 원시값과 증거를 보존하지만 완전한 quote 객체를 만들지 않고 `unavailable`로 남긴다.

## 공식 자료 및 실제로 확인한 범위

| 자료 | 확인 결과 | 한계 |
|---|---|---|
| [KIS Open API 서비스 목록](https://apiportal.koreainvestment.com/apiservice-category) 및 [API 문서 목록](https://apiportal.koreainvestment.com/apiservice-apiservice) | REST 기본 시세·순위 계열과 NXT WebSocket 체결가 문서 카테고리가 존재 | 동적 상세 API 가이드는 로그인 없이 필요한 NXT 전용 요청·응답 계약을 열람하지 못함 |
| [KIS 공식 API 설정 파일](https://github.com/koreainvestment/open-trading-api/blob/main/MCP/Kis%20Trading%20MCP/configs/domestic_stock.json) | REST 등락률 순위 `/uapi/domestic-stock/v1/ranking/fluctuation`, `NX` NXT 시장 코드, `20170` 등락률 화면, `0000` 전체 종목 선택, `0000` 등락률 정렬, 조회 건수 파라미터와 연속조회 표기 확인 | PRE/AFTER별 구분, 최대 반환 수, 결과 전체성·응답률 필드·기준가 산식은 미확인. API TR ID 미확인 |
| [KIS 공식 Open Trading API NXT 함수](https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_functions_ws.py) | 함수 `ccnl_nxt`, TR ID `H0NXCNT0`, `tr_key` 종목코드, 출력 컬럼 목록 확인 | 공개 예제 코드이며 실제 계정 응답 또는 최신 API 규격 원문은 아님. 값의 wire type, 단위, 오류·지연 동작 미확인 |
| [KIS NXT/시장 분류 안내](https://apiportal.koreainvestment.com/intro) | `H0NXCNT0`의 `MARKET_CLS_CODE` 코드 값 1 PRE, 2 정규, 3 AFTER, 5 종가를 STEP 63 증거와 대조해 유지 | 이 범위는 해당 NXT 실시간 체결 API에 한정. 다른 API에 같은 코드 의미를 전이하지 않음 |
| [NXT 거래제도](https://www.nextrade.co.kr/menu/transactionSys.do) | 공개 시간표는 PRE 08:00–08:50, MAIN 09:00:30–15:20, AFTER 호가접수 15:30–20:00 / 실제 거래 15:40–20:00로 인수 | 페이지별 조회가 일부 403으로 막혔고, 임시 휴장·휴일·종목별 예외의 실제 달력은 확보하지 않음 |
| [NXT 종목 변동 내역](https://nextrade.co.kr/menu/transactionStatusConclusion/menuList.do), [2026년 4분기 안내 목록](https://nextrade.co.kr/menu/notice/menuList.do?menuCode=notice), [NXT 현황](https://nextrade.co.kr/main.do) | 변동 내역 조회는 최대 3개월. 2026년 4분기 대상종목 안내가 2026-09-21 게시됐고, 2026-10-21 별도 한도 조정 공지도 확인. 현황 페이지는 세션별 거래종목 수를 표시 | 원본 첨부파일을 내려받아 해시·행 수·전체성을 검사하지 않았고, 전체 기준 및 종목별 PRE/AFTER 허용 플래그도 미확인 |
| [KIS Open API 안내](https://apiportal.koreainvestment.com/about-open-api) | STEP 63에서 확인한 개인 이용 제한 및 외부 제공·공개 표시 관련 별도 계약 필요 조건 인수 | EDGE NXT 계정의 실제 권한·계약 상태는 조회하지 않음. 공개 재배포는 BLOCKED |

## 9개 시세 계약 항목

`DOCUMENTED`는 KIS 공식 공개 예제에서 컬럼 이름과 라벨 또는 적용 API를 확인했다는 의미다. 타입·단위가 확인되지 않은 필드는 정규화 또는 LIVE quote 생성에 사용할 수 없다.

| 항목 | 공식 컬럼 / 위치 | 문서에서 확인된 의미 | 타입·단위·규칙 상태 |
|---|---|---|---|
| 종목코드 | `MKSC_SHRN_ISCD`; 구독 인수 `tr_key`; H0NXCNT0 | 응답 컬럼과 종목코드 구독 키 | 컬럼 wire type 및 레지스트리 대조 UNVERIFIED |
| 현재가 | `STCK_PRPR`; H0NXCNT0 | KIS 레거시 공식 예제 주석의 “현재가” | 타입·호가단위/가격표현 UNVERIFIED |
| 기준가격 | 직접 매핑 없음 | `VI_STND_PRC`는 VI 기준가격으로 별도 컬럼이며 일반 등락률 기준가로 사용 불가 | UNVERIFIED; 산식·세션별 기준가 확인 안 됨 |
| 등락률 | `PRDY_CTRT`; H0NXCNT0 | 전일 대비율 | 정확한 비교 기준, 단위의 배율·반올림 규칙 UNVERIFIED |
| 거래량 | `CNTG_VOL`, `ACML_VOL`; H0NXCNT0 | 체결 거래량, 누적 거래량 | 컬럼 의미 확인. 값 타입/시장 세션 누적 경계 미확인 |
| 거래대금 | `ACML_TR_PBMN`; H0NXCNT0 | 누적 거래대금 | 금액 단위·통화·누적 범위 UNVERIFIED |
| 거래일 | `BSOP_DATE`; H0NXCNT0 | 영업 일자 | 실제 payload 표현 타입 및 날짜 값 검증 미수행 |
| 체결·원천 시각 | `STCK_CNTG_HOUR`; H0NXCNT0 | NXT 출력 컬럼으로 존재. KIS의 레거시 일반 체결 예제는 동명 필드를 체결 시간으로 사용 | NXT 시간 포맷·시간대·서버 원천 시각과의 관계 UNVERIFIED. `BSOP_DATE`와 합쳐 UTC timestamp를 만들지 않음 |
| 지연 여부 | 직접 매핑 없음 | H0NXCNT0 공식 컬럼 목록에 명시적인 지연 flag가 없음 | 지연 여부와 지연 허용 기준 UNVERIFIED |

## `MARKET_CLS_CODE` 적용 범위

| 코드 | 해석 | STEP 64 처리 |
|---|---|---|
| `1` | PRE | PRE 요청에서만 허용 |
| `2` | 정규장 | PRE/AFTER quote에서 차단 |
| `3` | AFTER | AFTER 요청에서만 허용 |
| `5` | 종가 | PRE/AFTER quote에서 차단 |

이 매핑은 `H0NXCNT0` 전용이다. 다른 TR ID의 동명 필드에 자동 적용하지 않는다.

## 순위 API와 TOP10 전체성

KIS 공식 API 설정 파일에서 REST 등락률 순위 엔드포인트 `/uapi/domestic-stock/v1/ranking/fluctuation` 및 `NX`(NXT), 전체 선택 `fid_input_iscd=0000`, 등락률 정렬 코드 `fid_rank_sort_cls_code=0000`, 결과 수 파라미터 `fid_input_cnt_1`, 연속조회 표기 `tr_cont`가 확인됐다. 따라서 **NXT 시장 선택이 가능한 일반 등락률 순위 REST API가 문서화됨은 PARTIAL/DOCUMENTED**로 갱신한다.

다만 이 명세에는 PRE/AFTER 전용 파라미터가 확인되지 않았고, TR ID, 최대 반환 수, 실제 페이지 끝까지의 완전 조회 조건, NXT 거래종목 전체 포함 여부, 결과 필드 단위·기준가격이 검증되지 않았다. 따라서 **NXT PRE·AFTER 구분 순위와 TOP10 전체성은 여전히 UNVERIFIED**다. 일부 페이지나 샘플만으로 전체 시장 TOP10을 표시하지 않는다.

## NXT 유니버스, 거래일 및 권한

- KIS 종목정보 페이지에 KOSPI(NXT), KOSDAQ(NXT) 마스터 범주가 있다. 다만 최신 원본 파일을 내려받아 구조/해시/건수를 검사하지 않았다.
- NXT에 2026년 4분기 대상종목 안내 및 2026-10-21 별도 한도 조정 공지가 있음을 확인했다. 2026-11-03 현황 페이지의 PRE/MAIN/AFTER 거래종목 수는 시점의 요약치이지 전체 코드 목록이 아니다. 따라서 완전한 현재 유니버스와 종목별 세션 자격은 아직 UNVERIFIED다.
- NXT 변동내역 페이지는 현재 전체 유니버스가 아닌 변경 이력이다. 일부 분기/시점의 종목 수는 최신 전체 목록 증거로 사용하지 않는다.
- 공개 시장 시간표는 보존했으나 실제 거래일 캘린더, 휴장일, 임시 휴장, 세션 예외 및 종목별 제한은 `UNVERIFIED`다.
- KIS 문서의 일반 정책은 프로젝트 계정에 대한 계약 증거가 아니다. 개인 조회, API 호출, 앱 내부 표시, 공개 표시, 실시간/지연 재배포 권한은 별도다. 공개 재배포는 계정·서비스별 계약 확인 전까지 `BLOCKED`다.

## 증거 등록소와 어댑터 변경

새 `src/nxt/kis-nxt-fieldmaps.js`는 H0NXCNT0 전용 공개 필드 카탈로그와 미확인 항목을 분리한다. 공개 예제에서 확인한 `MKSC_SHRN_ISCD`, `STCK_PRPR`, `PRDY_CTRT`, `CNTG_VOL`, `ACML_VOL`, `ACML_TR_PBMN`, `BSOP_DATE`, `STCK_CNTG_HOUR`, `MARKET_CLS_CODE`를 문서 증거에 연결한다. `VI_STND_PRC`는 의도적으로 `basePrice`에 매핑하지 않는다.

`normalizeKisNxtDocumentedFields()`는 네트워크 요청을 하지 않고 해당 API 범위와 등록된 증거 ID를 확인해 관찰된 원시값을 보존한다. 타입/단위가 빠졌거나 기준가·지연값이 없으므로 `quote: null`, `quoteComplete: false`, `dataMode: unavailable`이다. 문서 예시·합성 입력은 LIVE가 되지 않는다. 증거 digest의 `metadata_record`는 등록 메타데이터 SHA-256이며, 다운로드한 원문 바이트 또는 실제 응답 해시가 아니다.

NXT 유니버스 판정 함수는 변경 이력과 샘플 목록을 `PARTIAL`로 남긴다. 인증된 최신 전체 파일, 완전성 선언, 중복·형식 검사까지 모두 있어야 `VERIFIED`가 가능하다. 현 단계에서는 그러한 파일을 확보하지 않았다.

## 실행 및 결과

```sh
node scripts/run-nxt-contract-audit.js
node --test test/nxt-contract-audit.test.js test/nxt-official-fieldmaps.test.js test/nxt-universe-source.test.js test/nxt-contract-gate-regression.test.js
```

이 단계는 KIS/NXT 실제 API 호출 0회, 계정 인증 0회, 운영 DB 접근 0회다. Playwright/Chromium 검증은 재시도하지 않았으며 실제 브라우저 상태는 `UNVERIFIED`다. 새로 확인된 내용은 H0NXCNT0 컬럼 식별자 일부와 NXT 시장 코드 선택 가능한 등락률 순위 REST 경로·입력 파라미터다. 이를 PRE/AFTER 전용 순위 또는 실데이터 연동 완료라고 확대하지 않는다.

### STEP 65 우선 작업

1. 승인된 최신 KIS 상세 API 명세에서 필드별 wire type·단위·기준가 의미를 문서 버전과 함께 검토한다.
2. 별도 승인된 계정/계약 경로가 생기면 실제 응답 샘플을 보안 처리 후 인증·digest 검증한다.
3. KIS 종목정보 파일 또는 NXT 공식 최신 전체 대상 파일을 임시 격리 공간에서 확보해 기준일·완전성·PRE/AFTER 여부를 검사한다.
4. 실시간 거래일 캘린더, 예외 정책과 공개 재배포 권한을 확인한 뒤 별도 승인으로 게이트 입력을 갱신한다.

현 단계에서 인증정보를 새로 요청하거나 API를 호출하지 않는다. 운영 반영은 승인 대상으로 남는다.

## STEP 66 조사 추가분 (2026-11-04)

이 절은 STEP 64 기준 결과를 덮어쓰지 않고 이후 공식 공개 자료에서 추가로 확인한 범위만 기록한다.

- KIS 공개 `H0NXCNT0` 샘플의 출력 컬럼 배열 47개와 순서를 확인했다. `MARKET_CLS_CODE`는 배열 마지막이다. 이는 공개 샘플 코드의 필드 순서일 뿐 실제 수신 payload나 wire type·단위 인증은 아니다. 원본 저장소는 mutable `main` URL로 확인했고 원문 파일 바이트를 보관하지 않았으므로 증거 digest는 `metadata_record`다.
- KIS 공식 MCP 설정은 NXT 시장 선택 `NX`, 순위 endpoint 및 결과 수 입력을 제시한다. 별도 공식 샘플 호출에서는 rank 정렬 입력 값이 `0`, MCP 설정에는 `0000`으로 나타나 표기 충돌을 기록했다. 실제 API 호출은 하지 않았으며 PRE·AFTER 분리, 전체 universe 범위, 페이지 종료 조건은 계속 미확인이다.
- KIS 종목정보 페이지는 KOSPI(NXT)·KOSDAQ(NXT) `.mst` 다운로드 범주를 안내한다. 링크 다운로드 시도는 현재 격리 브라우저의 프로토콜 정책에 의해 거부되어 원본 바이트·SHA-256·행 수를 확보하지 못했다. availability 문서 확인은 실제 파일 수집과 다르다.
- NXT 2026 Q4 공지는 606 종목 유지 계획과 첨부 없음(0)을 알린다. 2026-10-21에는 듀켐바이오 및 범한퓨얼셀의 10-26~12월 말 세션 제외 조정이 공지됐다. 따라서 수량 공지나 조정 delta만으로 현행 전체 종목 파일을 복원하지 않았다.
- NXT 거래일 규칙에서 월~금 및 휴장일 원칙, 연초·수능일 등 거래시간 조정 가능성을 확인했다. 날짜별 거래일 캘린더는 확보하지 않았다.
- KIS 공개 안내의 개인 사용 제한 및 제3자 제공 제한을 확인했으나 EDGE NXT 계정 계약은 확인하지 않았다. 공개 재배포 권한은 계속 `BLOCKED`다.

새로 등록한 여섯 근거는 KIS H0NXCNT0 컬럼 순서, KIS 마스터 다운로드 분류, NXT Q4 대상 수 공지, NXT 10월 대상 조정, NXT 거래일·세션 일반 규칙, KIS 일반 이용조건이다. 등록된 모든 hash는 메타데이터 레코드 digest이며, 원문 바이트 또는 인증 응답 digest로 간주하지 않는다. 이번 조사로 13개 주요 차단요인 중 완전 해소된 것은 0개다. 세부 상태는 [STEP 66 결손 현황](nxt-step66-gap-status.md)을 따른다.
