# KIND·DART 공식 원천 필드 매핑

검토일: 2026-11-03 (UTC)

## 판정 요약

| 원천 | 확인 수준 | 사용 가능한 필드 매핑 | 실 API 응답 확인 |
|---|---|---|---|
| OpenDART `list.json` | `DOCUMENTED` | `corp_code`, `corp_name`, `stock_code`, `report_nm`, `rcept_no`, `rcept_dt`, `flr_nm`, `rm` | 하지 않음 |
| OpenDART `company.json` | `DOCUMENTED` | `corp_code`, `corp_name`, `stock_name`, `stock_code`, `corp_cls` 등 | 하지 않음 |
| OpenDART `corpCode.xml` ZIP 내 XML | `DOCUMENTED` | `corp_code`, `corp_name`, `corp_eng_name`, `stock_code`, `modify_date` | 하지 않음 |
| KIND 오늘의공시/RSS | `UNVERIFIED` | 공식 원시 응답 필드맵 없음 | 하지 않음 |

이 구현은 문서 필드를 대상으로 하는 로컬 매퍼입니다. API를 호출하거나 응답의 출처 진위를 인증하지 않습니다. 합성 fixture는 테스트 전용이며 실제 응답 샘플이 아닙니다. 매퍼 기본값은 payload 진위를 `UNVERIFIED`로 두며, 문서 필드와 레지스트리가 일치해도 기본 경로는 확정 상태를 내지 않습니다.

## 공식 문서

- OpenDART 기업개황 개발가이드: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019002
- OpenDART 고유번호 개발가이드: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019018
- OpenDART 공시검색 개발가이드: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001
- KIND 오늘의공시 화면: https://kind.krx.co.kr/disclosure/todaydisclosure.do?method=searchTodayDisclosureMain
- KIND 종합정보 화면의 검색 안내: https://kind.krx.co.kr/corpdetail/totalinfo.do?method=loadInitPage

## DART 필드 계약

### 공시검색 `list.json`

공식 가이드는 JSON 및 XML 응답을 명시하고, 목록 항목에 다음 필드를 문서화합니다.

| 원본 키 | 문서상 의미 | 매핑/처리 |
|---|---|---|
| `corp_code` | 공시대상회사 고유번호, 8자리 | `corporateId`로 보존. 종목코드로 변환하지 않음 |
| `corp_name` | 상장사 종목명 또는 기타법인명 | 회사명 |
| `stock_code` | 상장회사 종목코드, 6자리 | 값이 있고 형식이 맞을 때만 직접 코드 후보 |
| `corp_cls` | 법인구분 (`Y`, `K`, `N`, `E`) | 회사 구분. NXT 거래대상 여부를 의미하지 않음 |
| `report_nm` | 공시구분·보고서명 등 보고서명 | 공시 제목 |
| `rcept_no` | 접수번호, 14자리 | 레코드 식별자. 종목코드 근거가 아님 |
| `rcept_dt` | 접수일자, `YYYYMMDD` | 날짜 정밀도의 발표일로 보존; 시각을 만들어내지 않음 |
| `flr_nm` | 공시 제출인명 | 제출인 정보 |
| `rm` | 비고 코드 | 원문 값 보존 대상 |

가이드의 공시 뷰어 예시는 `https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}`입니다. 접수번호는 공시를 찾는 키이지 주식코드가 아닙니다.

### 기업개황 `company.json`

가이드는 `corp_code` 요청 인자를 8자리 고유번호로 정의합니다. 응답의 `corp_name`, `stock_name`, `stock_code`, `corp_cls` 등을 구분합니다. `stock_code`는 상장회사에 대해 6자리 종목코드이며 기타 법인에는 없을 수 있습니다. 매퍼는 이 구분을 유지하며 공란 코드를 거부/후보 처리합니다.

### 고유번호 `corpCode.xml`

가이드는 XML 파일을 포함한 ZIP 출력으로 설명하고 XML 항목에 `corp_code`(8자리), `corp_name`, `corp_eng_name`, `stock_code`(상장사 6자리), `modify_date`(`YYYYMMDD`)를 기록합니다. 이 구조는 DART 기업 식별 및 상장 코드 대응 자료입니다. 이를 전체 KRX 상장종목 목록이나 NXT 거래대상 전체 목록으로 취급하지 않습니다.

## KIND와 기존 EDGE NXT 수집 경로

현재 `src/collect.js`는 KIND의 `rsstodaydistribute.do` RSS 주소를 기본 입력으로 사용합니다. 공시 RSS의 제목/링크/게시 시각을 `rss-parser`로 읽고, `item.author`와 제목에 기존 `matchSymbol()`을 적용합니다. 따라서 저장되는 `ticker`는 RSS 원본에서 직접 확인한 종목코드가 아니라 제목/작성자 매칭 결과일 수 있습니다.

같은 파일은 별도로 KIND의 `corpgeneral/corpList.do?method=download&searchType=13` 경로를 호출해 내려받은 HTML의 셀 위치에서 상장법인 이름과 코드를 읽습니다. 이 URL/HTML 필드 배치는 여기서 KIND의 공개 문서화 API로 확인하지 못했습니다. 이번 구현에서는 이 경로를 공식 공시 레코드 필드맵으로 승격하지 않습니다.

KIND 공식 웹 화면에서 오늘의 공시 검색과 RSS 제공 UI를 확인할 수 있지만, 이번 공식 문서 검토에서 RSS 원시 XML 필드 스키마 또는 공개 API 계약을 확인하지 못했습니다. 그러므로 `src/nxt/kind-fieldmap.js`는 입력 필드명을 추정하지 않고 항상 `UNVERIFIED`로 닫힙니다. 링크, 제목, 작성자 또는 기존 `ticker`만으로 직접 종목코드 근거를 만들지 않습니다.

`src/store.js`의 기존 기사 행은 `ticker`, `company`, 제목·출처·URL·발행일 등 정규화 필드를 저장하지만 원천 종목코드 필드, 원천 레코드 식별자, 코드가 나온 원본 필드, 확인 시각은 보존하지 않습니다. 기존 ticker의 출처는 복원할 수 없으므로 `legacy_unknown` 유지가 필요합니다. SQLite 스키마는 이번 단계에서 변경하지 않았습니다.

## 코드 연결

- `src/nxt/dart-fieldmap.js`: 문서화된 DART 필드만 검증하고 `adaptOfficialCodeRecord()`에 연결합니다. `corp_code`와 `rcept_no`는 별도 메타데이터/식별자로 유지합니다.
- `src/nxt/kind-fieldmap.js`: 미확인 KIND payload를 거부하지 않고 `UNVERIFIED` 검토 대상으로 반환하며, 공식 근거를 만들지 않습니다.
- `src/nxt/source-fieldmaps.js`: 원천과 프로필별 명시적 dispatcher입니다. 지원되지 않는 프로필은 fail-closed 처리합니다.
- DART 직접 코드 근거도 검증된 종목 레지스트리와 코드·회사명이 일치해야 합니다. 다만 기본 매퍼는 payload 진위가 확인되지 않은 합성·임의 입력을 `candidate`로 낮춰 확정 상태를 막습니다. 향후 실제 원천 연결자는 출처 진위를 독립적으로 검증한 뒤에만 그 검증 상태를 전달해야 합니다. 필드맵만으로 레지스트리 전체 범위나 NXT 적격성을 증명하지 않습니다.

## 검증 및 한계

- DART 자료구조: `DOCUMENTED`; 실제 응답을 인증 조회하지 않아 `SAMPLE_VERIFIED`나 `LIVE_VERIFIED` 아님.
- KIND 공시 payload: `UNVERIFIED`; fieldMap 구현을 의도적으로 보류.
- 기존 KIND RSS 항목: 공시 후보/링크로는 사용 가능하나 원본 코드 직접 근거가 없음.
- 기존 DART 수집은 `list.json`의 `report_nm`, `rcept_no`, `rcept_dt`, `corp_name`을 읽어 뉴스 형태로 저장하고, 공식 `stock_code` 보존/전달 및 `corp_code` provenance를 남기지 않습니다.
- 실제 응답 진위, API 이용량/인증 제한, 공개 재배포 권한은 이번 단계에서 확인하지 않았습니다.
- DART 코드 목록은 KIND/거래소 종목 마스터 및 NXT 거래대상 목록과 동일하다고 간주하지 않습니다.
