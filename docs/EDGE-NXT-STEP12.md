# EDGE NXT STEP 12 — 뉴스 데이터 검증 및 종목 상세 분석

## 범위

- EDGE NEWS 공개 JSON은 HTTP GET으로만 읽습니다.
- 기존 EDGE NEWS SQLite, main, Pages, Actions는 변경하지 않습니다.
- KIS 인증·시세 호출은 하지 않습니다.
- NXT 가격·순위가 없을 때 뉴스로 순위를 만들지 않습니다.

## 공개 데이터 계약

현재 공개 경로는 다음과 같습니다.

- `https://phenomeno3023.github.io/edge-news/data/news.json`
- `https://phenomeno3023.github.io/edge-news/data/status.json`

`news.json` 최상위에는 `items`, `latestRun`, `report`, `serverTime`, `coverageFrom`, `coverageFromKst`, `calendarStatus`가 있습니다. 항목에는 `ticker`, `company`, `title`, `url`, `published_at`, `first_seen_at`, `is_disclosure`, `amounts`, `facts`, `grade`, `impact`, `risks`, `duplicate_count`, `status`, `source_links` 등이 올 수 있습니다. `source_links`는 JSON 배열이 아니라 JSON 문자열로 제공될 수 있어 양쪽 형식을 파싱합니다.

필드가 없는 경우 값을 추정하지 않습니다. DART/KIND 원문 링크로 판별 가능한 도메인은 공시 원문으로 표시하고, 그 외 원문 URL은 보도 원문으로 둡니다.

## 연결·중복·상세 분석

- 유효한 6자리 종목코드가 있으면 코드가 우선입니다.
- 코드가 없는 항목은 공식 종목명과 완전 일치할 때만 보조 연결합니다.
- 티커나 종목명이 모두 없는 항목은 미매칭으로 둡니다.
- 종목·KST 게시일·정규화 제목이 같은 보도와 공시는 하나의 사건으로 표시하고 출처 링크와 사건 유형을 합칩니다.
- 취득 결정/완료, 소각 결정/완료, 계약 확정 표현/협의 표현을 분리합니다.
- 저장된 등급은 원본 값으로 보여 주되 독립 검증 여부를 별도로 표시합니다.
- 원문에서 추출한 수치·사실만 보여 주며 가격·수익률·선반영 여부를 만들어내지 않습니다.

`GET /api/nxt/news/:ticker`는 종목별 분석을 제공합니다. 정적 Pages에서는 같은 화면이 `data/news.json`을 읽기 전용으로 사용합니다. API 오류와 유효 피드의 일치 0건을 별도로 표시합니다.

## 상세 화면

NXT 화면에 6자리 코드 조회 폼을 추가했습니다. 종목 카드의 상세 버튼 또는 직접 코드 입력으로 관련 사건을 확인합니다. 매칭된 뉴스/공시 건수, 원본 종목명 출처, 게시·최초 수집 시각, 원문 링크, 유형 근거 문구, 원문 추출 사실·수치, 위험 언급, 정정 상태, 피드 최신성을 보여 줍니다. 실제 검증된 시세 행이 없으면 모든 시세 항목은 확인 불가로 표시합니다.

CSS는 650px 이하 단일 열/축소형 검색 폼을 적용하고, 동적 문자열은 HTML escape 후 삽입합니다. 스크립트와 서비스 워커 캐시는 `edge-nxt-step12-20261026a`로 갱신합니다.

## 실데이터 표본 확인

2026-10-26 KST 13:33 무렵 공개 경로 GET 결과:

- `news.json`: HTTP 200, JSON 87,402바이트, 62건
- `status.json`: HTTP 200, JSON 866바이트
- `data/nxt.json`: HTTP 404 (공개 NXT 시세 스냅샷 없음)
- GET 응답 지연: `news.json` 약 6.1초, `status.json` 약 0.1초
- 응답 `Last-Modified`: 2026-10-26 11:10 KST
- 뉴스 데이터 `serverTime` 및 마지막 수집 완료: 2026-10-26 11:10 KST
- 피드 조회 당시 응답 헤더 시각은 약 13:33 KST였으므로 피드 당시 나이는 약 143분이며 STALE 조건에 해당
- 62건 중 25건에 유효한 6자리 ticker와 company가 함께 있고, 25건 모두 회사명이 제목에 정규화 완전 일치
- 37건은 ticker와 company가 모두 없어 종목 연결을 보류
- 공시 13건, `published_at`/`first_seen_at`/`url` 누락 0건, 정정 상태 3건
- 수집기가 이미 `duplicate_count=7`로 합친 그룹 1건(추가 출처 6개); 중복 출처 링크는 보존
- 당일 KST 08시대 게시 3건. 08:14:23 기사는 첫 수집 시각이 약 11:10 KST로 기록돼 약 2시간 56분의 수집 지연. 당시 08:20 실행의 실포착 증거는 아님
- `latestRun.status=ok`, `trigger_type=schedule`, `restore_status=restored`; 예약 시각 11:00 KST, 실제 workflow 시작 11:09:58 KST

실데이터의 코드·회사명 쌍은 내부 일관성 표본으로 확인했지만, 공식 거래소 종목 명부와 전체 25개를 대조한 검증은 하지 않았습니다. 기사 제목만으로 종목을 추정하지 않습니다.

## 테스트

`npm test`는 74개 기존 테스트와 STEP 12 회귀 테스트를 함께 실행합니다. 정적 Pages 배포 및 Android 실기기 검증은 이 개발 단계에서 수행하지 않습니다.
