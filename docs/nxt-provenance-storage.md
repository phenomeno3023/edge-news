# NXT 뉴스·공시 Provenance 격리 저장

## 목적과 범위

이 모듈은 STEP 56의 기존 저장 행 정규화와 TOP10 통합 결과 사이에서 종목 매칭의 근거·검증 수준·검토 상태를 보존한다. 저장소는 실행 프로세스 안의 메모리 Map이며, SQLite 파일을 열거나 생성하지 않는다. 프로세스 종료 뒤 보존되는 운영 저장소가 아니며, 실제 운영 DB 스키마 변경 전 계약과 동작을 검증하기 위한 개발 어댑터다.

## 데이터 계약

`src/nxt/provenance-contract.js`는 다음 정보를 포함하는 버전 1 envelope를 만든다.

| 영역 | 보존 필드 |
| --- | --- |
| 레코드 원천 | `recordId`, `recordType`, `sourceType`, `sourceName`, `sourceUrl`, `sourceRecordId`, `publishedAt`, `observedAt` |
| 종목 매칭 | `ticker`, `companyName`, `matchMethod`, `matchedText`, `sourceField`, `evidenceSource`, `confidence`, `reviewStatus`, `ambiguityReason`, `matchedAt` |
| 검증 수준 | `schemaVerification`, `payloadAuthenticity`, `registryVerification`, `evidenceVersion`, `verifiedAt` |
| 계보 | `inputDataType`, `normalizationVersion`, `provenanceStatus`, `provenanceWarnings` |
| 기존 필드 | 제목, URL, 출처, 분류, 등급, 영향, 위험, 발표시각 정확도, DART 접수번호 및 기업 식별자 |
| DART 문서 구조 평가 | `corp_code`와 `stock_code`를 분리해 저장하고 문서 출처·스키마 상태·payload 진위 상태를 별도 보존 |

`publishedAt`은 원래 표현을 보존하며 날짜만 있는 값은 `YYYY-MM-DD`로 유지한다. `observedAt`은 별개의 timezone 포함 확인 시각이다. 기존 저장 행의 `ticker`는 `legacy_unknown`, `confidence=unknown`으로 남는다.

## 검증 상태는 독립적이다

- `schemaVerification`: 문서에 필드가 정의되어 있는지 여부
- `payloadAuthenticity`: 현재 payload가 진짜 원천 응답인지 여부
- `registryVerification`: 코드·기업명이 레지스트리 검증을 통과했는지 여부
- `reviewStatus`: 기사·공시와 종목의 연결을 확정할 수 있는지 여부

문서가 필드 구조를 정의했다는 사실은 payload 진위를 증명하지 않는다. 문서 fixture는 `DOCUMENTED`와 `UNVERIFIED` payload 진위를 함께 가질 수 있다. `high` 및 `verified` 상태는 공식 코드 방식, 스키마·payload·레지스트리 검증 완료가 함께 있어야 통과한다. 문서 fixture, KIND 후보, legacy ticker는 자동 확정되지 않는다.

## 저장, 중복, 충돌

`src/nxt/provenance-store.js`의 `createProvenanceStore()`는 저장·재조회·종목별/원천별/검토 상태별 조회를 지원한다. 같은 `recordId`와 동일 envelope는 `duplicate`로 멱등 처리한다. 같은 ID에 다른 envelope가 들어오면 기존 값을 덮어쓰지 않고 `conflict`를 반환해 충돌 목록에 보관한다. 서로 다른 DART 접수번호는 별도 레코드로 남기므로 정정공시를 병합해 지우지 않는다.

## 원천별 처리

- 일반 RSS: 저장된 ticker는 후보 연결에만 쓰며 공식 코드 근거로 승격하지 않는다.
- KIND: 기존 STEP 55 상태대로 원시 필드 계약은 `UNVERIFIED`; 제목·링크·발행시각·ticker만 보존한다.
- DART: 기존 정규화 행은 원본 `stock_code` 부재를 유지한다. 문서 구조 fixture의 `corp_code`, `stock_code`, `rcept_no`, `rcept_dt` 평가는 별도 보존하고 payload 진위는 `UNVERIFIED`다. `rcept_no`는 종목코드로 취급하지 않는다.
- 출처 불명: `legacy_unknown`으로 검토 대기한다.

## TOP10 통합 및 실행

`src/nxt/provenance-integration.js`가 STEP 56 정규화 → envelope 생성 → 메모리 저장 → 재조회 → 신뢰도와 상태 비교 → STEP 56 TOP10 연결 → 통합 계약 검증을 수행한다. Provenance는 뉴스·공시 레코드와 `matchEvidence`에 연결되고 별도 검토 대기열에도 보존된다. 순위·세션·Mock quote 수치는 변경하지 않는다.

실행:

```sh
node scripts/run-nxt-provenance.js
```

스크립트는 미리보기의 합성 fixture만 사용하고 네트워크·API·운영 SQLite를 사용하지 않는다. `persisted`는 실행 중 메모리 저장 후 재조회한 수치이며 영속 디스크 저장을 뜻하지 않는다.

## 제한 및 다음 단계

이번 구현은 왕복 저장 계약을 격리 검증하는 단계다. 프로세스 간 영속성, 운영 SQLite 마이그레이션, 실제 DART payload 인증, KIND 공식 RSS 스키마, 실제 원천 재배포 권한은 검증하지 않았다. 향후 영속 저장소를 설계할 때는 이 계약을 별도 테이블/컬럼에 연결하고 마이그레이션·백업·기존 레코드 backfill 계획을 별도 승인받아야 한다. 과거 ticker의 누락된 원본 근거는 복원할 수 없으므로 추정 backfill을 하지 않는다.
