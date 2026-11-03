# NXT 검토 대기열

이 모듈은 뉴스·공시의 종목 매칭 근거가 부족하거나 서로 충돌하는 레코드를 운영 판단에서 분리해 검토할 수 있도록 개발용 조회·내보내기 기능을 제공한다. 이 기능은 운영 SQLite, Cloudflare, 실제 KIND·DART·시세 API에 연결되지 않는다.

## 데이터 원칙

- `legacy_unknown` ticker는 공식 종목코드 근거가 아니다.
- KIND RSS는 원시 필드 계약이 검증되지 않아 `kind_schema_unverified` 상태로 대기한다.
- DART 문서에 정의된 구조와 실제 응답 진위는 별개다. payload 진위가 확인되지 않으면 `dart_payload_unverified`를 표시한다.
- 제목 휴리스틱, 별칭, 충돌, 불완전한 레지스트리는 확정 연결로 승격하지 않는다.
- 저장 충돌은 별도 검토 항목으로 보존하며 기존 레코드를 덮어쓰지 않는다.

## 사유 분류

`src/nxt/review-queue-contract.js`가 허용된 사유 목록과 SQL 필터 조건을 한 곳에서 정의한다. 주요 사유는 과거 매칭 근거 미확인, KIND 스키마 미확인, DART payload 진위 미확인, 공식 코드 부재, ticker·종목명 충돌, 별칭 모호성, 복수 종목, 출처 미확인, 레지스트리 미완전, 저장 충돌이다. 사유 분류는 검토 우선순위를 돕는 메타데이터이며 실제 정답 확률을 뜻하지 않는다.

## 조회와 페이지네이션

`queryReviewQueue(store, filters, options)`는 메모리 저장소와 개발용 SQLite 저장소를 지원한다. 종목코드, 레코드 유형, 원천, 신뢰도, 검토 상태, 검증 상태, 발표일 범위, 사유로 필터링한다. 기본 페이지는 50개, 최대 100개이며 offset은 100,000 이하로 제한한다. SQLite 경로는 SQL 매개변수 바인딩과 사전 정의된 사유 predicate를 사용한다. 응답에는 전체 건수와 상태·원천·사유 집계가 포함된다.

## 동시 접근과 장애 처리

SQLite 저장소는 WAL과 트랜잭션을 사용한다. 연결별 `busyTimeoutMs`는 기본 5초, 최대 60초다. `SQLITE_BUSY`와 `SQLITE_LOCKED`는 `busy_timeout` 오류로 분류하고, 다른 저장 장애는 `storage_error`로 분류한다. 충돌은 conflict 테이블에 기존 및 들어온 근거를 함께 보존한다. 배치 검증 오류는 트랜잭션 전체를 롤백한다. 여러 연결·별도 프로세스 읽기/쓰기·동일 ID 중복/충돌·busy timeout·강제 종료 뒤 WAL 무결성은 자동 테스트에서 검증한다.

## JSON 내보내기

`buildReviewQueueExport`는 버전이 명시된 envelope를 생성한다. `schemaVersion`, 생성 시각, data mode, 전체/반환 건수, 집계, 페이지 정보, 항목을 포함한다. `dataMode`는 `mock`, `fixture`, 합성 fixture 등 검증된 개발 값만 허용하고 `live`는 거부한다. `writeReviewQueueJSON`은 사용자가 넘긴 허용 임시 루트 안의 새 `.json` 파일만 생성하고 기존 파일 덮어쓰기를 거부한다. 파일 권한은 소유자 전용으로 만든다.

## CSV 내보내기

`serializeReviewQueueCSV`는 고정된 열 순서, UTF-8, CRLF, 따옴표 이중화로 CSV를 생성한다. 객체 값은 JSON 텍스트로 보존하고 null은 `\N`, 빈 문자열은 빈 셀로 구분한다. 스프레드시트 수식으로 해석될 수 있는 `=`, `+`, `-`, `@`로 시작하는 셀(앞 공백·제어문자 이후 포함)은 앞에 작은따옴표를 추가한다. `writeReviewQueueCSV` 역시 명시된 허용 임시 루트만 사용하고 기존 파일을 덮어쓰지 않는다.

## TOP10 연결

`attachReviewQueueToTop10`은 검토 후보를 종목코드 기준으로 PRE/AFTER 결과에 보조 정보로 붙인다. 순위와 quote 객체를 복사해 보존하고, 후보를 확정 연결 목록으로 표시하지 않는다. 같은 종목이 PRE와 AFTER 양쪽 TOP10에 있으면 두 세션에 같은 검토 후보가 연결될 수 있으며 각 세션의 순위·시세는 원래 값 그대로 유지된다. TOP10에 없는 ticker 또는 ticker가 없는 레코드는 미배정 목록으로 분리한다.

## 개발 실행

```sh
node scripts/run-nxt-review-queue.js
npm test
```

실행 스크립트는 OS 임시 디렉터리에 합성 데이터를 만들고 종료 시 해당 디렉터리를 제거한다. `provenance-path.js`가 명시된 루트 밖의 경로와 심볼릭 링크 경로 이탈을 차단한다. 운영 SQLite 경로를 자동으로 찾거나 열지 않는다.

## 보안·운영 경계

이번 기능은 읽기 전용 외부 API를 호출하지 않으며 실제 운영 뉴스·공시 데이터도 사용하지 않는다. 검토 결과를 운영에 반영하거나 실제 저장 스키마를 변경하려면 별도의 데이터 권한·진위 검증·운영 변경 승인 절차가 필요하다.
