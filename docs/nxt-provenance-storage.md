# NXT 뉴스·공시 Provenance 저장소

## 목적과 경계

STEP 57의 메모리 저장소를 유지하면서 개발·테스트용 SQLite 영속 어댑터를 추가한다. SQLite는 명시적으로 지정한 DB 파일만 열며, DB 파일과 허용 루트는 OS 임시 디렉터리 아래에 있어야 한다. 운영 `data/edge-news.sqlite`, `DB_PATH`, 운영 데이터 사본은 열거나 복사하거나 마이그레이션하지 않는다.

메모리와 SQLite 저장소는 `save`, `saveMany`, `getById`, `getByTicker`, `getBySource`, `getByReviewStatus`, `list`, `getConflicts`, `close` 인터페이스를 공유한다. `createProvenanceStorageAdapter({backend:'memory'})`가 기본이며, SQLite는 `{backend:'sqlite', dbPath, allowedRoot}`를 모두 명시해야 한다.

## 스키마와 보존

SQLite `application_id`는 ENXT 표식, `user_version=1`이다. `provenance_records`는 ID·원천·ticker·신뢰도·검토 상태·검증 수준·발표 시각 정밀도와 DART `corp_code`, `stock_code`, `rcept_no`, `source_links`를 조회 가능한 열로 보관하고, 계약 전체는 `provenance_json`에 저장한다. `null`, 빈 문자열, 날짜 전용 `YYYY-MM-DD`, 타임존이 있는 시각을 임의 정규화하지 않는다. 날짜 정밀도는 별도 열에 `date`, `timestamp`, `unknown`으로 보존한다.

`provenance_conflicts`는 같은 `recordId`의 상충 입력과 원래 값을 별도로 기록한다. `provenance_legacy_archive`는 합성 구버전 마이그레이션에서 원본 행을 보관한다. DART 보조 열은 기록된 문서 근거의 `corp_code`, `stock_code` 후보 및 실제 저장된 접수번호만 사용한다. 기존 DART ticker를 `stock_code`로 복사하지 않는다.

## 경로 안전

- `dbPath`와 `allowedRoot`는 절대 경로로 명시한다.
- `allowedRoot`는 실제 경로 기준으로 OS 임시 루트 아래에 있어야 한다.
- DB 경로의 상위 디렉터리 심볼릭 링크가 허용 루트 밖을 가리키면 거부한다.
- DB 파일 자체가 심볼릭 링크이거나 파일이 아닌 경로면 거부한다.
- 허용 루트 밖의 경로, 기본 운영 SQLite, `DB_PATH`와 일치하는 경로는 허용하지 않는다.
- 운영 DB를 자동 탐색하거나 복사하는 기능은 없다.

## 트랜잭션, 중복, 충돌

일괄 저장은 `BEGIN IMMEDIATE` 트랜잭션으로 수행한다. 잘못된 envelope가 발견되면 해당 배치 전체를 롤백한다. 동일 ID와 동일 근거는 `duplicate`이며 최초 저장된 `observedAt`이 유지된다. 동일 ID에 ticker·검증 상태 등 근거가 달라지면 기존 행을 바꾸지 않고 충돌 테이블에 입력과 사유를 남긴다. 저장 실패는 충돌과 별도 오류로 반환한다.

## 백업·복원

`provenance-backup.js`는 Node SQLite 온라인 백업 API를 사용한다. 실행 중인 데이터베이스 파일을 직접 복사하지 않는다. 백업/복원 대상도 같은 임시 허용 루트 아래의 새로운 파일이어야 하며, 이미 존재하는 대상을 덮어쓰지 않는다. 완료 뒤 application ID, schema version, `PRAGMA integrity_check`를 검사한다.

## 합성 구버전 마이그레이션

`migrateSyntheticLegacyProvenanceDatabase`는 임시 루트 안에서 ENXT application ID, `user_version=0`, `legacy_articles` 테이블을 모두 확인한 합성 DB만 처리한다. 원본 행은 archive에 저장되고 Provenance는 `legacy_unknown`, `confidence=unknown`, `needs_review`로 생성된다. KIND는 계속 `UNVERIFIED`다. DART 접수번호는 식별자로만 보존하며 기업코드나 종목코드로 사용하지 않는다. 기존 문서 근거가 없는 ticker를 공식 근거로 승격하지 않는다. 실패하면 스키마와 데이터가 같은 트랜잭션에서 롤백된다. 현재 버전 DB를 다시 요청하면 데이터 변경 없이 `already_current`를 반환한다.

## 파이프라인 연결

`runProvenanceIntegration`은 기존 메모리 저장소를 기본값으로 유지하며 SQLite 저장소를 주입할 수 있다. 정규화 → Provenance 생성 → 영속 저장 → 재조회 → 왕복 비교 → STEP 56 TOP10 연결 순서로 실행된다. 저장 성공은 매칭 신뢰도를 높이지 않는다. KIND `UNVERIFIED`, DART `DOCUMENTED` 스키마와 `UNVERIFIED` payload 진위, 기존 ticker `legacy_unknown`, 검토 대기 상태를 보존한다. 세션·순위·Mock 시세와 원문 링크도 유지한다.

## 개발 검증

```sh
node scripts/run-nxt-provenance-sqlite.js
node --test test/nxt-provenance-sqlite.test.js
npm test
```

실행 스크립트는 OS 임시 디렉터리에 DB를 만들고, 저장 연결을 닫은 뒤 별도 Node 프로세스로 재연결해 저장 전 envelope와 비교한다. 또한 온라인 백업, 새 파일 복원, 무결성 검사, 합성 v0 마이그레이션을 수행하고 마지막에 임시 파일을 제거한다. 네트워크 요청은 하지 않는다.

## 한계와 운영 전환 조건

이 구현은 개발 전용 SQLite 어댑터와 합성 데이터 검증이다. 실제 운영 SQLite의 상태·스키마·백업·마이그레이션은 확인하거나 변경하지 않았다. 운영 저장소 전환에는 별도 설계·승인, 실제 배포 전 백업 정책, 잠금·복구 계획, 운영 데이터 권한 검토 및 독립적인 마이그레이션 검증이 필요하다. KIND의 원시 RSS 필드 계약과 DART payload 진위는 계속 미확인이다.
