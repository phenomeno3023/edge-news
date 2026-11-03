# EDGE NXT legacy 데이터 격리 통합

## 목적과 경계

`runLegacyIntegrationPipeline()`은 STEP 48~55의 TOP10·링커·신뢰도 엔진을 기존 `articles` 저장 행 형식과 연결하는 개발용 순수 함수입니다. SQLite를 열지 않고, API를 호출하지 않으며, 공개 JSON 파일도 쓰지 않습니다. TOP10 입력의 순위·가격·등락률은 변경하지 않습니다.

## 기존 저장 형식

`src/store.js`의 `articles` 표에서 사용되는 관련 필드는 `id`, `title`, `url`, `source`, `published_at`, `ticker`, `company`, `category`, `is_disclosure`, `summary`, `grade`, `impact`, `risks`, `source_links`, `status`입니다. `source_links`는 JSON 텍스트로 저장됩니다.

기존 행은 원본에서 종목코드가 온 필드, 매칭 방법, 출처 레코드 ID, 코드 확인 시각을 기록하지 않습니다. 그러므로 유효한 6자리 `ticker`가 있어도 `legacy_unknown` / `needs_review` / 미확정 상태입니다.

## 모듈 흐름

1. `legacy-data-adapter.js`는 실제 저장 필드를 검증하고 표준 레코드와 제외 사유를 만듭니다.
2. `source-normalizer.js`는 일반 RSS, KIND, DART, 출처 불명을 구분하고 KIND의 STEP 55 미검증 상태를 유지합니다.
3. 기존 `top10-enriched.js`의 뉴스·공시 링커와 이벤트 타임라인을 호출합니다.
4. STEP 54 `runOfficialEvidencePipeline()`을 legacy source로 실행해 기존 ticker의 근거를 `legacy_unknown`으로 전달합니다.
5. 문서 구조 기반 DART fixture는 접수번호로 기존 DART 행에만 부가 평가를 붙입니다. 이 평가도 payloadAuthenticity가 UNVERIFIED이며 ticker 근거를 승격하지 않습니다.
6. `integration-result-contract.js`가 결과 필드, 세션, 순위 코드, Mock 상태를 검증합니다.

## 원천 처리

| 원천 | 정규화·통합 처리 |
|---|---|
| 일반 뉴스 RSS | 기존 ticker가 TOP10 코드와 일치하면 후보 연결. 공식 코드 근거는 unknown |
| KIND RSS/공시 | 연결 가능한 disclosure 후보로 보존. 원시 필드 스키마와 공식 코드 근거는 UNVERIFIED |
| DART 기존 저장 행 | 접수번호와 공시 정보는 보존. 기존 행에 `stock_code` 원본이 없어 legacy unknown |
| DART 문서 fixture | STEP 55 문서 필드맵으로 평가하고 접수번호 일치 행에 설명 정보 연결. 합성 입력은 미확정 |
| 출처 불명 | 종목코드가 유효하면 연결 확정 없이 종목별 검토 대기열에 남김. 잘못된 형식의 개별 행은 제외 사유와 함께 격리 |

문서화된 DART 필드 `corp_code`(8자리), `stock_code`(6자리), `rcept_no`, `rcept_dt`는 서로 분리합니다. 접수번호가 동일한 DART 중복은 기존 링커 기준으로 합칠 수 있지만, 서로 다른 접수번호를 가진 정정공시는 보존합니다.

## 결과 계약

최상위 결과는 세션·생성 시각·Mock 모드, 종목별 items, 검토 대기열, 제외 레코드, 원천별 집계, STEP 54 공식근거 처리 결과 및 경고를 제공합니다. 종목별 항목은 rank/ticker/name/session/quote/quoteTimestamp/dataMode, relatedNews, kindDisclosures, dartDisclosures, timeline, matchEvidence, confidence, reviewStatus, reviewQueue, excludedRecords, warnings를 포함합니다.

과거 ticker에서 provenance를 확인할 수 없으므로 자동 확정 수는 0입니다. 실제 연결 뉴스가 있어도 quote 및 전체 결과의 `dataMode`는 `mock`으로 유지됩니다.

## 격리 실행

```bash
node scripts/run-nxt-integration.js
```

스크립트는 `preview/nxt/mock-data.js`의 합성 TOP10을 사용하고, 합성 저장 행을 파이프라인에 전달합니다. 외부 API, 운영 SQLite, JSON 내보내기는 실행하지 않습니다.

## 이용 예시

```js
const result = runLegacyIntegrationPipeline({
  top10Result,
  articleRows: syntheticOrProvidedRows,
  dartDocumentedFixtures: [],
  dataOrigin: 'legacy_format_fixture',
  now: new Date()
});
```

`dataOrigin` 값은 `synthetic_fixture`, `legacy_format_fixture`, `documented_schema_fixture` 등 입력 테스트 출처를 표시하는 메타데이터일 뿐, 원천 진위 인증이 아닙니다.

## 테스트 및 운영 보호

테스트는 저장 필드 보존, 원천 분류, KIND 미검증, DART 날짜·ID 구분, TOP10 연결, 중복·정정 처리, 시간축, 검토 대기열, 불량 행 제외, 결정성 및 입력 불변성을 확인합니다. 이번 파이프라인은 `src/collect.js`, `src/symbol-match.js`, `src/store.js`, `src/export.js`를 수정하거나 실행하지 않습니다. 운영 SQLite·GitHub Actions·Pages·Cloudflare Worker 변경도 없습니다.

실제 데이터 연결로 확장하기 전에는 원천 응답 진위 확인, provenance 저장 방식, DART/KIND 데이터 이용 조건, 종목 전체 레지스트리와 NXT 거래 대상 범위를 별도로 검토해야 합니다.
