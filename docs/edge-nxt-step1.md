# EDGE NXT — STEP 1 설계 및 인수 기준

기준일: 2026-10-25 KST  
EDGE NEWS 기준 main: `463f78088b691df12d7bae5c0ce8882ac2b989af`  
FINAL EDGE 1 읽기 기준 main: `75c87e13dcb4ce974b82a0006c2933018b4812d6`  
작업 브랜치: `edge-nxt-step1-20261025`

## 1. 결정 요약

- EDGE NEWS를 기반으로 앱 화면 이름을 EDGE NXT로 바꾸는 방향은 가능하다.
- 저장소 `phenomeno3023/edge-news`와 공개 주소 `https://phenomeno3023.github.io/edge-news/`는 그대로 유지한다.
- 기존 뉴스 파이프라인과 SQLite 상태 브랜치는 보존한다. 이 단계에서는 기존 앱, 데이터, Actions, Pages, Secret, FINAL EDGE 1 운영을 수정하지 않는다.
- FINAL EDGE 1의 NXT 모듈은 상태기계·읽기전용 화면·뉴스 매칭 설계의 참고 자료로 활용할 수 있다. 이를 실행 중인 NXT 체결 수집기로 간주할 수는 없다.
- 실제 NXT 시세는 KIS 공식 REST NXT 등락률 순위 및 NXT WebSocket 체결을 우선 검증한다. 공개 문서와 샘플 코드의 계약 충돌, 계정별 이용한도, NXT 실제 응답이 해결되기 전까지 실시간 TOP10 표시는 차단한다.

## 2. EDGE NEWS 인수 현황

|기능|현재 코드·데이터 경로|STEP 1 판정|
|---|---|---|
|자동 뉴스 수집|GitHub Actions `.github/workflows/edge-news.yml` → `src/collect.js`|유지|
|수집 출처|KIND 공개 공시 RSS, 한국경제 금융 RSS, 매일경제 증권 RSS; DART는 키 설정 시 추가|유지|
|종목코드 매칭|KIND 상장법인 목록 캐시와 `src/symbol-match.js`|유지|
|중복·정정 처리|stable ID/URL/제목 키 및 상태 갱신|유지|
|SQLite 보존|Actions의 `edge-news-state` 브랜치에 DB·KRX 심볼 캐시 저장|유지|
|웹 데이터|Pages의 `data/news.json`, `data/status.json`|NXT는 읽기 전용 결합|
|PWA|반응형 화면, manifest, 서비스 워커와 설치 안내|브랜드만 단계적으로 변경|
|DART|Secret 이름 `DART_API_KEY`; 미설정이면 unconfigured|현재 상태 유지|

뉴스 데이터의 기존 종목코드 필드와 URL을 결합 키로 사용한다. 코드가 없는 기사에 종목을 추정 배정하지 않는다. 기사 게시시각, 최초 수집시각, 피드 생성시각을 별도로 표시한다.

## 3. FINAL EDGE 1 NXT 코드 재사용 검토 — 읽기 전용

대상 저장소 main 및 기존 `edge1-nxt-live-top10-20261023` 브랜치의 `nxt_live` 코드를 읽었다. 코드나 운영 데이터를 복사·변경·실행하지 않았다.

|기능|확인된 구현|EDGE NXT 활용|
|---|---|---|
|후보 발견|상승률 1% 이상을 추려 20개까지 감시 후보로 선택|탐색 구조만 참고. 거래대상 종목·KIS 응답 검증 필요|
|TOP10 정렬|유효 수신 중인 상태를 상승률 내림차순, 거래대금 내림차순, 코드순으로 정렬|정렬 규칙 참고. 기존 KIS 데이터 계약이 확인된 뒤 재작성|
|틱 모델|종목코드, 체결시각, 수신시각, 가격, 등락률, 거래량, 거래대금, 시장구분|필드 설계 참고|
|상태 처리|ACTIVE/WEAKENING/EXCLUDED/STALE/HALTED/RECOVERING, 순서 역전·중복·오래된 틱 차단|상태 의미와 예외처리 참고|
|뉴스 결합|EDGE NEWS JSON을 HTTPS로 읽고 ticker를 정확히 비교, 게시·수집시각과 중복·stale 처리|읽기 전용 데이터 계약 참고|
|화면|NXT 전용 view/API 경로와 종목별 시각·상태·뉴스 표시 모델|반응형 UI 구성 참고|

**실제 데이터 미확인:** `nxt_live/config.py` 기본값은 OFF이며 sort 검증 상태도 UNVERIFIED다. `nxt_live/view.py`는 `provenance=UNVERIFIED`, `live_verified=false`, 기준가격 UNKNOWN으로 응답한다. 조회 경로가 기존 앱에 마운트되어도 유효 체결이 실제로 수신된다는 증거는 아니다.

**수집 경로 공백:** 기존 `market_live_kis.py`는 KRX 지수 및 선택적 선물 TR을 처리하며 NXT 체결 TR `H0NXCNT0`의 파서가 아니다. 현재 NXT 보기·상태기계 코드를 곧바로 운영 가능한 실시간 수집기로 복제하지 않는다. 코드 재사용은 순수 상태기계와 표현 모델의 동작을 검토한 후 EDGE NXT의 JavaScript 모듈로 독립 구현하는 범위로 제한한다.

## 4. 실제 NXT 시세 경로 및 확인 한계

### 우선 검증할 데이터 경로

1. 종목 후보: 한국투자증권 REST `/uapi/domestic-stock/v1/ranking/fluctuation`, TR `FHPST01700000`, 시장 코드 `NX` 요청 검토.
2. 실시간 가격: 한국투자증권 WebSocket NXT 체결 `H0NXCNT0`, 6자리 종목코드별 구독 검토.
3. 누적 체결량·대금: NXT 체결 필드 `ACML_VOL`, `ACML_TR_PBMN`를 실제 응답과 맞춘 뒤 사용.
4. 거래 가능 종목 필터: 넥스트레이드 공식 `매매체결대상종목(정규시장)`의 유효 기준일 목록을 사용한다. KRX 전체 상장 목록 2,688개를 NXT 거래가능 목록으로 간주하지 않는다.

### 운영을 막는 검증 사항

- KIS 공식 파라미터 문서는 시장 코드 `NX:NXT`를 기재하지만 공개 `fluctuation.py` 샘플의 실행 검증은 `J/W/Q`만 허용한다. API 서버가 실제 NX 요청을 받는지, 반환 결과가 NXT 순위인지 본 단계에서는 호출하지 않아 UNVERIFIED다.
- 등락률 필드 `PRDY_CTRT`는 공급자 기준 전일대비다. 이를 KRX 당일 종가 대비 NXT 상승률로 표시하지 않는다. 화면에는 기준 종류와 시각을 붙인다. 확정된 KRX 종가 데이터를 별도 검증하기 전 KRX 종가대비 값은 UNKNOWN이다.
- NXT WebSocket 문서·샘플의 체결 필드 수, 구독 해제 코드와 공통 샘플의 동작 차이를 실제 ACK 및 틱 응답으로 검증해야 한다.
- 계정별 API 호출 한도, NXT 권한, 동시에 유지 가능한 WebSocket 연결·심볼 수는 확인되지 않았다. 공식 KIS 공지의 한도와 계정별 현재 상태를 분리한다. FINAL EDGE 1 인증정보를 읽거나 복사하지 않는다.
- 거래대상 목록은 변경될 수 있다. 매일 유효 기준일·목록 출처를 기록하고 목록을 확인하지 못하면 신규 감시 후보를 생성하지 않는다.
- 공개 넥스트레이드 화면의 개별 종목 데이터는 20분 지연 표시다. 실시간 운영 데이터의 대체 경로로 쓰지 않는다.

**미검증 시 안전 동작:** 데이터 부족·오래된 틱·연결 끊김·범위 불명은 TOP10 공백 또는 STALE로 표시한다. 최신값을 LIVE로 둔 채 유지하지 않는다. 시세가 없을 때 임의 순위·가격·거래량을 만들지 않는다.

## 5. 뉴스·공시·상승 원인 결합

- NXT 종목코드와 뉴스 JSON의 `ticker`를 정확히 일치시킨다.
- 같은 종목 뉴스는 canonical URL 및 제목 정규화로 합치고 원문 링크·공시 링크를 보존한다.
- `published_at`, `first_seen_at`, 데이터 피드의 `serverTime`을 별도로 보여준다. 예약 RSS를 실시간 뉴스로 표현하지 않는다.
- 공시는 KIND/DART 원문 링크와 `is_disclosure` 상태를 구분한다. 실제 원문 확인을 하지 못하면 확인 완료로 표시하지 않는다.
- 뉴스 게시·공시시각과 NXT 상승 감지시각을 나란히 기록한다. 시간상 가까운 뉴스는 '관련 가능성'으로만 표현하고, 공식적으로 확인된 원인처럼 쓰지 않는다. 근거가 없으면 '원인 미확인'으로 표시한다.
- 뉴스 수집 주기는 기존 Actions 설정을 유지한다. NXT 체결 갱신은 별도의 지속형 수집 프로세스로 분리한다.

## 6. EDGE NXT 모바일 화면 설계

기존 EDGE NEWS의 뉴스 탭을 유지하고 기본 진입 화면을 NXT로 전환하는 설계를 권고한다. URL·저장소를 바꾸지 않고 앱 표시명만 EDGE NXT로 바꾼다.

### NXT 애프터마켓 TOP10

- 순위, 종목명·코드, 현재가, 상승률, 누적 거래량·대금
- 각 값의 출처, 시장 구분, 마지막 체결시각, 서버 수신시각
- 연결상태 및 시세 연령 표시
- 숫자는 현재 데이터가 유효한 종목에만 표시; stale/결측은 그 상태를 노출

### 종목별 뉴스·공시 및 원인 정보

- ticker 일치 뉴스·공시, 게시시각·최초 포착시각, 원문 링크
- 기존 S/A/B/C 등급을 재사용하되 호재·악재는 확인된 근거와 분리
- 원인 설명은 확인된 사실과 분석 의견을 구분하고 불충분하면 '원인 미확인'

### 이름 전환 파일 범위

구현 단계에서 우선 검토할 최소 파일:

- `public/index.html`: 문서 제목, 브라우저·PWA 앱 표시명과 화면 브랜드
- `public/manifest.webmanifest`: name/short_name만 변경; start_url/scope와 기존 URL 유지
- `public/app.js`, `public/style.css`: NXT 화면/탭과 모바일 레이아웃
- `public/sw.js`: 정적 파일 변경 시 캐시 버전만 올려 구 버전 화면 혼합 방지
- `public/icons/*`: 아이콘 변경은 EDGE NXT 브랜딩 검토 시에만 처리

뉴스 수집기, SQLite 스키마, `.github/workflows/edge-news.yml`, Secret, GitHub Pages 도메인은 이번 STEP 1에서 건드리지 않는다.

## 7. STEP 2 구현·검증 순서

1. 이 설계 브랜치에서 Edge News 최신 main과 기존 수집 데이터 보존 기준을 기록한다.
2. 새 EDGE NXT UI와 PWA 브랜딩을 main이 아닌 작업 브랜치에서 구현한다. 기존 뉴스 화면·JSON 경로는 그대로 둔다.
3. 계정 권한 확인 전 네트워크 호출 없는 REST 요청 검증기, WebSocket 프레임 파서, 오래된/중복/역순/결측 틱 테스트를 작성한다. 기본 NXT 실행 상태는 OFF.
4. 사용자가 별도로 설정한 EDGE NXT용 런타임 자격정보와 계정 한도를 확인한 뒤, 허용된 테스트 범위에서 REST 1회 및 단일 종목 WebSocket 최소 검증을 시행한다. 기존 FINAL EDGE 1 자격정보를 탐색하거나 재사용하지 않는다.
5. KIS 실시간 NXT 응답이 검증되기 전에는 실제 가격·상승률 순위를 표시하지 않는다. REST 후보순위만 확인됐을 때 체결가격까지 확인됐다고 보고하지 않는다.
6. 별도 NXT 상태 저장소와 지속형 백엔드가 준비된 후 수집 프로세스를 운영한다. GitHub Actions는 10분/30분 실행 작업이지 실시간 WebSocket 수집기에 적합하지 않다. 잠드는 무료 호스팅에서 지속 실시간을 보장하지 않는다.
7. 모든 테스트 및 데이터 보존 확인 뒤에만 Pages 배포를 별도로 검토한다. 이 STEP 1에서는 운영 배포하지 않는다.

## 8. 운영 위험 및 완료 판정

- TOP10 후보 목록이 실제 NXT 대상 종목 전체를 포함하는지: UNVERIFIED
- KIS REST의 NX 실제 응답과 정렬·결과 범위: UNVERIFIED
- KIS WebSocket NXT ACK·유효 체결 수신: UNVERIFIED
- 계정별 실전 호출·구독 한도 및 기존 KIS 사용자 작업과의 예산 충돌: UNVERIFIED
- 실전 상승률의 기준가격과 KRX 종가대비 계산: UNVERIFIED
- 모바일 UI 구현·운영 배포·기기 확인: 미수행
- 기존 EDGE NEWS 운영 코드·데이터·스케줄: 이 단계에서 변경하지 않음
- FINAL EDGE 1 운영 코드·DB·Render·인증정보: 읽기 전용 확인만 수행; 호출·변경 없음

최종 판정: **PARTIAL — 기존 기능 인수 기준, 독립 구조, API 상충·데이터 최신성 차단요건을 문서화했다. 실제 NXT 데이터와 EDGE NXT 화면은 다음 단계에서 별도 검증한다.**

## 공식 근거

- KIS 공식 샘플 — 등락률 순위: https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/fluctuation/fluctuation.py
- KIS 공식 샘플 — NXT 실시간 체결: https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_functions_ws.py
- KIS Open API 안내: https://apiportal.koreainvestment.com/
- KIS 호출 제한 공지: https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001/post/d0d1a83f-6f8d-4437-9700-6d26702fd989
- 넥스트레이드 거래대상 종목 페이지: https://nextrade.co.kr/menu/marketData/menuList.do
