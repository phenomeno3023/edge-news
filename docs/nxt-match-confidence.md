# NXT 종목 매칭 근거와 신뢰도

## 목적

기존 뉴스·공시 저장 행은 `ticker`를 보유하지만 이 값이 어떤 문자열과 규칙으로 만들어졌는지 저장하지 않습니다. `src/collect.js`는 KRX 상장사 목록 또는 캐시로 만든 이름→코드 레지스트리를 이용해 일반 뉴스 제목, KIND 제목·작성자, DART 제목·본문에 `matchSymbol()`을 적용합니다. KIND·DART는 기존 저장 행도 제목으로 다시 매칭합니다. SQLite에는 반환된 `ticker`와 `company`를 기록하지만 매칭 방식·실제 일치 문자열·원본 필드·근거 출처·처리 시각은 남지 않습니다. 따라서 저장된 `ticker`만으로 연결을 확정하지 않습니다.

## 근거 데이터 구조

`src/nxt/match-evidence.js`는 다음 필드를 가진 정규화 결과를 제공합니다.

| 필드 | 의미 |
| --- | --- |
| `ticker` | 검토 대상 6자리 종목코드. 확인되지 않으면 `null` |
| `matchMethod` | `official_code`, `exact_name`, `alias`, `title_heuristic`, `legacy_unknown` |
| `matchedText` | 실제 확인한 원문 문자열 |
| `sourceField` | 근거가 나온 필드 |
| `evidenceSource` | 근거를 제공한 원천 |
| `confidence` | 근거 강도 분류이며 정답 확률이 아님 |
| `reviewStatus` | `verified`, `needs_review`, `candidate`, `conflict`, `unknown` |
| `ambiguityReason` | 충돌·불확실 사유 |
| `matchedAt` | 근거 평가 처리 시각(ISO 8601) |

`createMatchEvidence()`는 confidence를 입력값에서 복사하지 않고 방식과 근거에 따라 계산합니다. `official_code`도 검증 표시, 명시된 6자리 코드, 일치 문자열, 허용된 원본 필드, 공식 출처(`KRX_LISTING_API`, `DART_OFFICIAL_FILING`, `KIND_OFFICIAL_DISCLOSURE`, `KIS_OFFICIAL_API`, `OFFICIAL_SECURITY_MASTER`)가 모두 있고 목표 코드와 일치할 때만 `high` / `verified`가 됩니다. 이 근거 객체는 공식 코드 확인을 실제로 수행한 어댑터만 생성해야 합니다. 저장 `ticker`, 기사 제목 속 숫자, DART 접수번호, URL 식별자는 공식 종목코드 증거가 아닙니다.

## 신뢰도와 검토 규칙

| 방식 | 신뢰도 | 상태 | 의미 |
| --- | --- | --- | --- |
| 공식 코드 직접 확인 | high | verified | 검증된 원천 코드가 대상 코드와 일치 |
| 종목명 정확 일치 | medium | needs_review | 제목의 종목명은 일치하나 코드 근거 독립 검증은 없음 |
| 별칭 일치 | medium | needs_review | 등록 별칭이 일치하나 별칭 충돌 등을 검토해야 함 |
| 제목 휴리스틱 | low | candidate | 제목 텍스트만으로 추정하거나 숫자 코드 문자열만 확인 |
| 기존 ticker만 존재 | unknown | unknown | 과거 근거가 저장되지 않아 재구성 불가 |

`confirmed`는 공식 코드를 검증한 경우에만 참입니다. 제목·별칭 연결은 후보로 남기며 사용자가 검토해야 합니다. TOP10 ticker와 뉴스 ticker가 다르거나 공식 근거가 다른 코드를 가리키면 연결하지 않고 `conflict`로 표시합니다.

## 충돌 및 모호성

`detectSymbolCollisions()`는 동일한 정규화 종목명·별칭이 여러 ticker에 배정된 경우를 찾습니다. `validateMatchCandidate()`는 제공된 종목 레지스트리 안에서 제목에 여러 회사가 등장하는 경우, 이름이 겹치는 경우, 별칭이 일반 명사 목록과 겹치는 경우를 자동 확정하지 않습니다. 문자열 유사도만으로 새 매칭을 만들지 않습니다.

충돌 검출 범위는 전달된 `universe`에 한정됩니다. 전체 상장사 레지스트리가 제공되지 않으면 TOP10 입력 범위만 검사하며 전 종목 충돌이 없다고 주장하지 않습니다.

## 뉴스·공시 후처리

`addTop10MatchConfidence()`는 STEP 49의 통합 결과를 복사해 뉴스 후보와 KIND·DART 공시에 근거·신뢰도·검토 상태를 추가합니다. `matchDecision`은 `confirmed`, `candidate`, `rejected`로 구분하며 `linked`는 검증 완료 연결에만 참입니다. 이전 결과의 `confirmed` 항목도 공식 근거가 없으면 후보로 되돌립니다. 충돌이 있는 항목은 추천 목록에서 분리하고 `news.reviewQueue` 또는 `disclosures.reviewQueue`에 보존합니다. 기존 순위, 가격, 상승률, URL, 발표 시각, Mock 표시를 유지합니다. 공식 근거를 공급할 경우 `evidenceById`에 레코드 ID별 근거를 전달할 수 있습니다. 기존 저장 레코드에는 그 근거가 없으므로 자동으로 채우지 않습니다.

공시의 식별자와 종목코드 매칭 근거를 분리합니다.

- DART 14자리 접수번호는 공시 레코드를 식별하지만 종목 ticker를 증명하지 않습니다.
- KIND 원문 URL은 공시 원문을 식별하는 자료지만 ticker를 증명하지 않습니다.
- KIND·DART 교차 출처가 제목·날짜로 합쳐진 항목은 동일 공시 후보이며 ticker 확정 근거가 아닙니다.
- 기사·공시 제목에서 발견한 종목명은 원문 후보 단서이며 공식 코드 직접 확인과 구분합니다.

## 결과 예시

```json
{
  "ticker": "005930",
  "matchMethod": "legacy_unknown",
  "matchedText": null,
  "sourceField": "ticker",
  "evidenceSource": "legacy_store",
  "confidence": "unknown",
  "reviewStatus": "unknown",
  "ambiguityReason": "legacy_ticker_has_no_preserved_match_provenance",
  "matchedAt": "2026-11-03T01:00:00.000Z"
}
```

시세는 기존 Mock 데이터를 유지하며 매칭 결과만으로 뉴스·공시를 상승 원인이나 확정 호재로 표현하지 않습니다.

## 실제 데이터 연결 전 작업

향후 공식 데이터 어댑터는 6자리 종목코드가 실제 원천에서 직접 확인됐는지, 어느 필드·출처인지, 어떤 시각에 확인했는지를 보존해야 합니다. 기존 SQLite 스키마와 수집기를 바꾸지 않았으므로 과거 행의 실제 매칭 근거를 복원할 수 없습니다. KIND·DART 재배포 조건 및 원문 링크 정책은 별도로 확인해야 합니다.
