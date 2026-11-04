# STEP 65 — KIS NXT 부분 시세 및 계약 결손 추적

## 목적과 범위

STEP 64의 KIS 공개 H0NXCNT0 예제에서 확인한 필드 후보를 개발용 부분 관측으로 보존한다. 실제 API 호출·인증·운영 DB 사용은 하지 않는다. 부분 관측은 완전 quote가 아니며 LIVE가 될 수 없다.

## 공식 확인 필드와 보존

필드 카탈로그는 `src/nxt/kis-nxt-fieldmaps.js`를 재사용한다. 부분 정규화는 `src/nxt/kis-partial-quote.js`에서 수행한다. 각 항목은 `rawFields`와 `candidateFields`를 분리하고 필드명, 기존 evidence ID, 문서 의미, verification/type/unit 상태, 차단 사유를 기록한다.

| 원시 필드 | 후보 의미 | 처리 |
|---|---|---|
| `MKSC_SHRN_ISCD` | 종목코드 | 6자리 문자열 후보만 보존 |
| `STCK_PRPR` | 현재가 | 원시값만 보존; 타입·단위 미확인 |
| `PRDY_CTRT` | 전일 대비율 | 원시값만 보존; 기준·스케일 미확인 |
| `CNTG_VOL` | 체결량 | 원시값만 보존 |
| `ACML_VOL` | 누적 거래량 | 원시값만 보존; 누적 범위 미확인 |
| `ACML_TR_PBMN` | 누적 거래대금 | 원시값만 보존; 단위 미확인 |
| `BSOP_DATE` | 영업일자 | 원시값만 보존; 포맷 미확인 |
| `STCK_CNTG_HOUR` | 체결시각 | 원시값만 보존; 포맷·시간대 미확인 |
| `MARKET_CLS_CODE` | 시장 분류 | H0NXCNT0 전용 후보 분류 |

수치형 필드는 type/unit 계약이 충분히 확인되지 않아 `candidateValue`로 변환하지 않는다. 원시 입력은 수정하지 않는다.

## 부분 시세와 완전 quote

부분 정규화 결과는 아래 값을 유지한다.

- `quote: null`
- `quoteComplete: false`
- `dataMode: unavailable`
- `liveEligible: false`
- `payloadAuthenticity: UNVERIFIED`

현재가 후보나 종목코드 후보가 있어도 완전한 quote로 만들지 않는다. 실제 데이터를 Mock으로 위장하지도 않는다.

## 계약 결손 목록

`src/nxt/quote-contract-gaps.js`는 다음 13개 항목을 각각 관리한다: 기준가격, 등락률 산식, 현재가 단위, 거래대금 단위, 누적 거래량 범위, 체결시각 형식·시간대, 원천 시각, 지연 여부, PRE·AFTER 순위 범위, 전체 NXT 유니버스, 거래일 달력, 응답 진위, 이용·재배포 권한.

각 결손은 severity, 영향을 받는 기능, 필요한 증거, 상태를 가진다. 같은 ID는 하나로 집계하며 상충 상태는 CONFLICT로 표시한다.

## PRE·AFTER 분리

H0NXCNT0의 `MARKET_CLS_CODE`만 다음 값으로 후보 분류한다.

- `1`: PRE
- `2`: 정규장 — PRE/AFTER에서 거부
- `3`: AFTER
- `5`: 종가 — PRE/AFTER에서 거부

다른 API에 이 매핑을 확대하지 않는다. 세션 분류는 거래일·응답 진위 검증이 아니다.

## 순위 API와 TOP10 완전성

STEP 64에서 확인한 `/uapi/domestic-stock/v1/ranking/fluctuation` 경로 및 `NX` 시장 선택을 참고한다. PRE·AFTER별 의미, 전체 종목 포함 범위, 순위 산식, 응답 완전성은 계속 UNVERIFIED다.

`src/nxt/top10-completeness.js`는 source, session, universe, ranking contract, 전체 coverage가 모두 검증되지 않으면 `complete_verified`를 반환하지 않는다. 합성 10개 종목은 실제 시장 TOP10 증거가 아니다. 기존 Mock TOP10 및 UI는 변경하지 않았다.

## NXT 유니버스 파일 입력 준비

`validateNxtUniverseFileInput()`은 원본 URL, 조회 시각, 기준일, 파일 digest, 행 수, 완전성, 종목코드와 PRE/AFTER 자격 플래그를 검증한다. 이는 입력 구조 검사이며 파일 바이트나 출처의 진위를 인증하지 않는다. 호출자가 `LIVE_VERIFIED`라고 전달해도 이 함수 자체는 목록을 인증하지 않고 `UNVERIFIED`로 남긴다. 실제 인증된 전체 목록의 별도 검증 자료가 있어야 후속 단계에서 완전 유니버스 판정을 검토할 수 있다. 이번 작업에서는 실제 목록 파일을 확보하지 않았다.

## LIVE 게이트

`src/nxt/partial-quote-gate.js`는 부분 관측을 기존 `evaluateLivePromotion()`에 연결한다. 기준가격, 지연 여부, 타입·단위, 거래일, 유니버스, payload 진위, 이용·재배포 권한이 미확인인 입력은 차단된다. 차단된 입력은 `unavailable`로 남는다.

## 실행 및 테스트

```sh
node scripts/run-nxt-partial-quote.js
node --test test/nxt-partial-quote.test.js test/nxt-quote-contract-gaps.test.js test/nxt-top10-completeness.test.js test/nxt-universe-file-contract.test.js test/nxt-partial-gate-integration.test.js
npm test
```

스크립트는 합성 fixture만 사용한다. KIS/NXT/DART/KIND API 호출 및 운영 DB 접근은 하지 않는다.

## 남은 확인 사항

- 기준가격과 등락률 산식 및 반올림
- 현재가/거래대금 wire type·단위
- 거래량의 세션별 누적 범위
- 체결시각 형식·시간대 및 원천 생성 시각
- 지연 데이터 여부를 확인할 공식 신호
- PRE·AFTER ranking scope와 전체 페이지 완전성
- 최신 전체 NXT 종목 파일과 세션별 자격
- 거래일 달력 및 휴장·예외 정책
- 실제 응답 인증 및 계정별 재배포 권한

이 항목이 확인되기 전까지 실제 연동과 공개 시세 사용은 차단 상태다.
