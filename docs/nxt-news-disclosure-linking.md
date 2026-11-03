# NXT TOP10 뉴스·공시 연결 계약

## 목적과 한계

이 모듈은 STEP 48의 세션별 TOP10 결과와 기존 `articles` 저장 구조를 종목코드로 연결합니다. 현재 저장된 `ticker`는 기존 `matchSymbol()` 휴리스틱으로 만들어졌고 매칭 근거·신뢰도는 DB에 보존되지 않습니다. 따라서 연결된 기사는 확인된 관계가 아니라 검토 후보입니다. 종목명 유사도만으로 연결하지 않습니다.

모든 예시는 합성 Mock입니다. 이 결과는 실시간 NXT 데이터가 아니며, 뉴스·공시가 가격 상승의 원인이라는 결론도 제공하지 않습니다.

## 입력 계약

### TOP10

`calculateTop10()` 결과의 `items`를 사용합니다. 종목별 레코드는 `rank`, `symbol`, `name`, `market`, `session`, `price`, `basePrice`, `changeRate`, `volume`, `tradingValue`, `timestamp`, `source`, `isDelayed`를 포함합니다. PRE와 AFTER 결과는 별도로 계산하고 별도로 전달할 수 있습니다.

### 기존 기사 저장 행

`src/store.js` 및 `src/collect.js`에서 사용하는 필드를 읽습니다.

| 필드 | 처리 |
| --- | --- |
| `id`, `title`, `url`, `source`, `published_at` | 기사 식별 및 표시 |
| `ticker`, `company` | 정확한 6자리 `ticker`만 연결에 사용. `company`는 연결 판단에 사용하지 않음 |
| `source_links` | JSON 배열 문자열 또는 배열. 유효 HTTP(S) 링크만 유지 |
| `category`, `grade`, `summary`, `impact`, `risks`, `status` | 기존 분석 값으로 연결. 감성 값을 새로 추론하지 않음 |
| `is_disclosure` | 기존 수집기에서 설정한 공시 표시. KIND/DART 판별은 `source`도 함께 확인 |

수집기에서 KIND는 `kind.krx.co.kr` 등의 출처 문자열, DART는 `DART` 출처로 저장합니다. DART 원문 링크의 `rcpNo`에서 14자리 접수번호를 추출합니다. 날짜만 저장된 DART `published_at`은 날짜 정밀도로 둡니다.

## 연결 및 중복 기준

- 기사와 공시는 TOP10 `symbol`과 저장 행의 정확한 6자리 `ticker`가 같을 때만 연결합니다.
- 기존 ticker의 생성 근거가 없으므로 `matchStatus=candidate_unverified_legacy_ticker`, `confirmed=false`를 반환합니다.
- 종목코드·제목·HTTP(S) URL이 유효하지 않은 행은 해당 행만 제외하고 `rejections`에 이유를 남깁니다.
- 기사는 같은 종목에서 같은 저장 `id`, 또는 같은 canonical URL일 때 중복으로 합칩니다. 추적 파라미터만 다른 URL은 canonical URL 중복으로 간주합니다. 제목이 같아도 URL이 다르면 별개로 유지합니다.
- 공시는 같은 DART 접수번호 또는 canonical URL을 우선 식별자로 사용합니다. KIND와 DART 사이에는 종목코드, 정정 표현을 포함한 정규화 제목, KST 이벤트 날짜가 모두 같은 경우에만 교차 출처 중복 후보로 합칩니다. 서로 다른 DART 접수번호는 별도 공시로 유지합니다.
- `[정정]` 등 정정 표기는 제목 키에서 제거하지 않습니다. 정정·후속공시를 단순 제목 유사도로 삭제하지 않습니다.
- 출처를 식별할 수 없는 공시 제공자 행은 연결하지 않고 제외 사유를 반환합니다.

## 발표 시각과 이벤트 타임라인

시각은 시간대가 포함된 ISO 8601 문자열만 정확한 순간으로 해석합니다. 예: `2026-11-03T09:30:00+09:00`. 날짜 전용 `YYYY-MM-DD`는 `accuracy=date`이며 임의 시각을 만들지 않습니다. 시간대가 빠졌거나 잘못된 문자열은 `accuracy=unknown`입니다.

정확한 시각은 UTC timestamp와 Asia/Seoul 기준 날짜를 제공합니다. DART처럼 날짜만 있는 이벤트는 날짜 단위로만 비교합니다. 같은 날짜의 날짜 전용 이벤트와 시각이 있는 이벤트 사이의 순서는 미확정으로 표시합니다. 최초 이벤트는 현재 입력된 수집 데이터 안에서 가장 이른 이벤트이며, 동률·정밀도 충돌은 후보 목록으로 돌려줍니다. 시장 전체 최초 보도라는 뜻은 아닙니다.

`beforeQuote`, `afterQuote`, `timeUnknown`은 이벤트와 quote 시각 사이의 시간적 위치만 표시합니다. 시세 기준 시각 이후에 발표된 이벤트도 보존하지만 과거 상승을 설명하는 근거로 쓰지 않습니다.

## 분류

수집기의 기존 `category`, `grade`, `impact`, `risks`를 `legacy_analyze_heuristics` 출처와 함께 유지합니다. 현재 기존 구조는 긍정·부정·중립 감성 값을 명시적으로 보장하지 않으므로 `sentiment=unclassified`로 반환합니다. 등급이나 카테고리를 주가 영향 방향으로 바꾸어 해석하지 않습니다.

## 통합 결과 예시

```json
{
  "rank": 1,
  "symbol": "005930",
  "name": "합성 테스트 종목",
  "session": "PRE",
  "price": 101,
  "changeRate": 1,
  "source": "mock:test",
  "dataMode": "mock",
  "news": {"confirmed": [], "candidates": []},
  "disclosures": {"kind": [], "dart": [], "all": []},
  "timeline": {"causeConfirmed": false}
}
```

뉴스가 없거나 공시가 없으면 해당 목록은 빈 배열입니다. Mock 출처가 결과까지 유지되며 `dataMode=mock`으로 표시됩니다.

## 실제 데이터 연결 전 확인 사항

1. 종목 매칭의 근거와 신뢰도 또는 원문 내 종목코드가 DB에 보존되어야 후보를 확정할 수 있습니다.
2. 뉴스·공시 공급원의 이용 조건, 원문 링크 유지 조건, 재배포 권한을 별도로 확인해야 합니다.
3. DART 날짜 전용 발표 시각을 분 단위로 보완하려면 공식 데이터 필드가 필요합니다.
4. 공식 NXT 등락률 기준가 및 실제 거래 세션 경계는 데이터 공급자와 확인해야 합니다.
5. 상승 원인을 주장하려면 실제 가격 변동 시작 시각 및 검증 가능한 인과 분석이 별도로 필요합니다.

이 문서와 모듈은 실제 API 호출, 운영 DB 변경, 실시간 시세 공개를 수행하지 않습니다.
