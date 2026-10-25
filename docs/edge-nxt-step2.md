# EDGE NXT — STEP 2 구현 기록

기준 브랜치: `edge-nxt-step1-20261025`
기준 커밋: `222ae3cb33b241c419b36a5fc3bde19b23dae5a6`
운영 main 기준 커밋: `463f78088b691df12d7bae5c0ce8882ac2b989af`

## 구현 상태

EDGE NXT 화면을 별도 탭으로 추가하고 기존 뉴스 화면을 유지했다. 앱/PWA 표시명을 EDGE NXT로 변경했으며 저장소 이름, Pages URL, 뉴스 JSON, SQLite, DART Secret 경로, 수집 Workflow와 예약 일정은 그대로 유지했다. 홈 화면 기능은 기존 바로가기 안내를 유지하고 `beforeinstallprompt.prompt()` 호출을 추가하지 않았다.

NXT 데이터 파일은 정적 `data/nxt.json` 경로를 읽도록 준비했다. 이 파일이 아직 발행되지 않으면 화면은 ‘연결 대기’를 표시한다. 뉴스 파일 오류와 NXT 시세 오류는 분리한다. 종목코드가 일치하는 관련 뉴스만 연결하고, 상승 원인은 인과가 확인되지 않는 한 ‘미확인’으로 표시한다.

## 데이터 계약

수집기가 발행할 데이터는 schemaVersion 1, market NXT, status, source, asOf, receivedAt, baseline, liveVerified, delaySeconds, items를 갖는다. 각 item은 ticker, company, price, changePercent, volume, turnover, eventAt, receivedAt, source, status를 갖는다. 현재는 실제 시세 데이터를 발행하지 않는다.

- REST 순위: `/uapi/domestic-stock/v1/ranking/fluctuation`, TR `FHPST01700000`, 시장 구분 `NX`, 등락률 화면 `20170`.
- WebSocket: NXT 체결 TR `H0NXCNT0`; 공식 샘플 필드 이름으로 프레임을 파싱한다.
- 종목 유니버스: 동일 거래일 기준 공식 NXT 체결대상 종목 목록에서 확인된 코드만 허용하도록 검증 함수를 추가했다.
- TOP10 정렬: 등락률 내림차순, 거래대금 내림차순, 종목코드 오름차순. 현재가·등락률·시각이 유효하고 상태가 LIVE 또는 DELAYED인 항목만 순위 대상이다.
- LIVE: 실시간 출처, `liveVerified=true`, NXT 체결시각이 15초 이내일 때만 가능. 연결 중단 시 저장된 종목을 STALE로 바꾼다. REST 결과는 기본 UNVERIFIED다.

KIS 공식 문서는 REST 시장 코드 NX를 안내하지만 현재 공개 샘플의 입력 허용 목록은 NX를 포함하지 않는다. 따라서 REST 실제 호출·응답은 검증하지 않았고 인증정보도 사용하지 않았다. API 코드·필드 계약과 계정별 권한이 확인될 때까지 실제 수집은 비활성화한다.

## 변경 파일

- `public/index.html`, `public/app.js`, `public/style.css`: 브랜드, 탭, 반응형 NXT 화면
- `public/nxt.js`: NXT JSON 검증·상태 표시·정확한 종목코드 뉴스 연결
- `public/manifest.webmanifest`: EDGE NXT 표시 이름
- `public/sw.js`: 신규 정적 파일 캐시 갱신, NXT 캐시가 네트워크 단절 시 STALE로 표시되도록 처리
- `src/nxt/provider.js`: 기본 비활성 REST 요청 빌더, REST/WS 파서, 시각 검증, 유니버스 확인, 정렬·연결 복구 보조 함수
- `test/nxt-provider.test.js`, `test/nxt-ui.test.js`: 수집 계약·등급·PWA·기존 뉴스 화면 회귀 테스트
- `test/report-copy.test.js`: EDGE NXT 명칭에 맞춘 보고서 문자열 검증
- `docs/edge-nxt-step1.md`: STEP 1 인수 설계

## 테스트 및 운영 제한

로컬 테스트: `npm test` 38개 통과. `node --check`에서 NXT UI, provider, 기존 앱 스크립트 문법 검증 통과.

테스트 자료는 파서 검증용 fixture이며 실제 종목 시세가 아니다. 실제 KIS 연결, NXT 거래대상 종목 목록의 당일 수신, Android 실기기 화면, Pages 배포, 운영 자동 수집은 수행하지 않았다. main 병합과 Pages 배포도 하지 않았다.

STEP 3에서 별도 EDGE NXT용 자격정보가 준비되면 최소 범위 REST 1회와 단일 종목 WebSocket 구독을 검증하고, 운영 저장·실시간 백엔드를 설계한다. 기존 FINAL EDGE 1 인증정보는 참조·복사하지 않는다.

## 공식 자료

- KIS REST 샘플: https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/fluctuation/fluctuation.py
- KIS NXT WebSocket 샘플: https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_functions_ws.py
- KIS API 포털: https://apiportal.koreainvestment.com/
- 넥스트레이드 거래대상 종목: https://nextrade.co.kr/menu/marketData/menuList.do
