# NXT 공식 종목코드 근거 어댑터

## 목적과 범위

이 개발 모듈은 호출자가 명시한 원천 필드 매핑을 검증하고 STEP 53 신뢰도 엔진에 매칭 근거를 전달합니다. 외부 네트워크 요청, 실제 KIND·DART API 호출, 운영 수집 경로 연결은 하지 않습니다. 테스트는 모두 합성 Mock 레코드를 사용합니다.

기존 `src/collect.js`는 KRX 상장사 목록 또는 캐시를 이름→코드 목록으로 만들고 `matchSymbol()`을 제목·작성자·본문에 적용합니다. 저장되는 것은 `ticker`와 `company` 등이며, 실제 일치한 문자열·필드·원천 레코드·판정 시각은 보존하지 않습니다. 기존 ticker를 공식 코드 근거로 복원하지 않습니다.

## 공식 원천 인정 원칙

어댑터는 아래의 `sourceType` enum, 대응하는 정확한 `sourceName`, HTTPS URL 호스트 허용 목록, 레코드 식별자, 확인 시각 및 필수 필드가 함께 맞아야 원천 계약을 통과시킵니다. 기관 이름 문자열만으로는 승인하지 않습니다.

| `sourceType` | 기대 `sourceName` | 허용 호스트 |
| --- | --- | --- |
| `krx_listing` | `KRX` | `data.krx.co.kr`, `global.krx.co.kr` |
| `dart_disclosure` | `DART` | `opendart.fss.or.kr`, `dart.fss.or.kr` |
| `kind_disclosure` | `KIND` | `kind.krx.co.kr` |
| `kis_market_data` | `KIS` | `openapi.koreainvestment.com`, `apiportal.koreainvestment.com` |
| `official_security_master` | `OFFICIAL_SECURITY_MASTER` | `data.krx.co.kr`, `global.krx.co.kr` |

호스트 검사는 전달된 URL의 형식을 제한할 뿐 원격 서버 접속이나 응답의 진위 확인을 대신하지 않습니다. 실제 연동에서는 허용된 공식 클라이언트가 받은 응답만 어댑터에 전달해야 합니다. 이 단계에서는 실제 API 필드 스키마와 인증 응답을 확인하지 않았습니다.

## 정규화 계약

`src/nxt/official-code-contract.js`의 계약 필드는 다음과 같습니다.

| 필드 | 규칙 |
| --- | --- |
| `ticker` | 선택값. 제공 시 6자리 문자열이어야 함 |
| `companyName` | 공식 원천에서 읽은 종목명 |
| `sourceType`, `sourceName` | 위 표의 enum과 정확한 명칭 |
| `sourceUrl` | HTTPS이며 원천 유형에 허용된 host |
| `sourceRecordId` | 원천 레코드를 식별하는 비어 있지 않은 값 |
| `sourceField` | 원천 행에서 실제로 읽은 필드명 |
| `observedAt` | 원천을 확인한 ISO 8601 시각과 시간대 필수 |
| `publishedAt` | 발표시각 ISO 8601 또는 날짜 정밀도 `YYYY-MM-DD`; 선택값 |
| `verificationStatus` | `verified`, `candidate`, `rejected`, `legacy_unknown`, `unverified_source` |
| `evidenceVersion` | 현재 계약 버전 `1` |

`observedAt`은 어댑터가 자료를 확인한 시각이고 `publishedAt`은 원천에 기록된 발표 시각입니다. 발표 날짜만 있을 때 시각을 임의 생성하지 않습니다.

## 필드 매핑과 KIND·DART

`adaptOfficialCodeRecord(record, options)`는 원천 응답의 실제 필드명을 가정하지 않습니다. 호출자가 `fieldMap`에 원천에서 직접 확인한 키를 지정해야 합니다.

```js
// 합성 테스트용 예시. 실제 KIND·DART 응답 필드의 설명이 아닙니다.
fieldMap: {
  ticker: 'security_code',
  companyName: 'issuer_name',
  sourceRecordId: 'record_key',
  publishedAt: 'published_date'
}
```

DART 접수번호나 KIND URL은 `sourceRecordId` 또는 문서 위치를 식별할 수 있지만 종목코드 근거가 되지는 않습니다. `ticker` 필드 매핑이 없거나 실제 값이 없으면 종목명 일치만으로 medium 검토 후보를 만들 수 있습니다. 종목코드가 원천에 직접 있고 회사명이 검증 레지스트리와 일치할 때만 공식 코드 근거를 생성합니다.

## 공식 레지스트리 검증

`validateOfficialRegistry()`는 각 레코드의 공식 계약을 검사하고 6자리 코드, 중복 코드, 동일 종목명·별칭의 다중 코드 충돌을 검출합니다. 레지스트리에는 `sourceVersion`, 시간대가 있는 `observedAt`, `scope`, `complete` 선언이 필요합니다.

`scope`와 `complete`는 입력 제공자가 선언한 범위입니다. 모듈은 레지스트리의 전체성 자체를 외부에서 증명하지 않습니다. 부분 레지스트리는 `verified_partial_snapshot`으로 구분하며 그 안에 없는 종목을 미등록이라고 단정하지 않습니다. 레지스트리 등재만으로 뉴스가 그 종목을 다룬다고 판단하지 않습니다.

## 근거 및 판정 처리

| 입력 상황 | 판정 |
| --- | --- |
| 승인된 공식 원천에서 코드·종목명이 직접 확인되고 레지스트리와 일치 | `high / verified`; STEP 53에서 대상 코드와 재대조 후에만 confirmed |
| 원천의 종목명만 레지스트리 이름·별칭과 유일하게 일치 | `medium / needs_review`; 후보 |
| 일반 기사 제목·본문의 종목명 또는 숫자 코드 | 휴리스틱/후보; 공식 코드 검증 아님 |
| 기존 저장 `ticker`만 존재 | `unknown / legacy_unknown`; 근거 복원 금지 |
| 코드·이름·레지스트리 충돌 또는 필수 메타데이터 누락 | 검토 대기 또는 거부; 자동 확정 금지 |

공식 근거 객체에는 원천 유형·이름·주소·레코드 ID·필드·확인시각·발표시각·직접 코드 검증 여부를 `officialCodeEvidence`로 함께 전달합니다. 검증 플래그는 실제 응답 필드를 확인한 신뢰된 어댑터가 생성해야 합니다. 뉴스와 공시는 각 레코드 ID로 따로 판정하며, 공시가 검증됐다고 뉴스의 신뢰도를 높이지 않습니다.

## STEP 53 파이프라인 연결

`runOfficialEvidencePipeline()`은 명시적 `sources`와 검증할 `registry`를 입력받아 원천별 결과를 만든 뒤 `addTop10MatchConfidence()`에 레코드 ID별 근거를 전달합니다. 이 과정은 TOP10 순위·시세 수치·Mock 표시·링크·시각을 수정하지 않습니다. 원본 입력도 변경하지 않습니다.

잘못된 입력은 전체 처리를 중단하기보다 해당 소스 행을 거부하거나 검토 결과로 격리합니다. TOP10 ticker와 원천 코드가 다르면 STEP 53 후처리에서 conflict로 보내며 확정 목록에 남기지 않습니다.

## Mock 결과 예시

```json
{
  "matchEvidence": {
    "ticker": "005930",
    "matchMethod": "official_code",
    "matchedText": "005930",
    "sourceField": "security_code",
    "evidenceSource": "DART_OFFICIAL_FILING",
    "confidence": "high",
    "reviewStatus": "verified",
    "verified": true,
    "matchedAt": "2026-11-03T05:00:00.000Z"
  },
  "officialCodeEvidence": {
    "sourceType": "dart_disclosure",
    "sourceName": "DART",
    "sourceRecordId": "mock-filing-1",
    "directCodeVerified": true,
    "verificationStatus": "verified",
    "evidenceVersion": "1"
  }
}
```

위 데이터와 URL은 합성 테스트 예시입니다. 실제 DART·KIND 응답 스키마나 해당 데이터의 공개 재배포 권한을 증명하지 않습니다.

## 실제 연결 전 확인할 사항

1. 공식 API 또는 문서에서 코드·회사명·식별자 필드를 직접 확인하고 `fieldMap`을 설정합니다.
2. 응답이 실제 공식 endpoint에서 왔는지 HTTP 클라이언트 계층에서 확인합니다.
3. 인증 상태, 페이지네이션, 오류 응답, 수정공시·정정공시 처리를 별도로 검증합니다.
4. 코드와 회사명의 기준일이 같은지, 상장·종목코드 변경을 어떻게 다룰지 정합니다.
5. 원문 링크, 공시·시세 데이터 이용과 공개 재배포 권한을 확인합니다.
6. 기존 운영 수집 경로에 연결하려면 별도의 변경 승인과 회귀 검증을 거칩니다.

이번 단계에서는 실제 API 요청, 운영 코드 연결, 운영 데이터 변경을 하지 않았습니다.
