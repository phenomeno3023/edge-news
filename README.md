# EDGE NEWS V1.0

모바일 웹/PWA + Node API + SQLite 뉴스 적재기. 공개 KIND·한국경제·매일경제 RSS 연결은 확인했으며, 배포와 예약 실행은 GitHub 저장소 및 Pages 설정이 완료되기 전까지 운영 중으로 간주하지 않습니다.

## 운영 예약

GitHub Actions가 운영 예약을 담당하고, 실행 판정은 Asia/Seoul 시각을 사용합니다.

- 거래일: 08:00–08:50 10분 간격, 09:00–20:00 30분 간격 (하루 29회)
- 주말 및 현재 연도 KRX 휴장일: 매시 정각 (하루 24회)
- 검증된 2026 KRX 휴장일은 프로그램에 포함되어 있습니다. 이후 연도 달력이 없거나 연도가 맞지 않으면 전체 수집을 중단하지 않습니다. 주말은 시간별, 평일은 거래일 주기로 실행하고 달력 상태를 `UNVERIFIED`로 기록합니다.

GitHub Actions 예약은 지연되거나 누락될 수 있습니다. 저장된 예약 시각은 실제 스케줄 시각이 아니라 실행 시각에서 계산한 근사 슬롯입니다. 실제 워크플로 시작과 수집 시작·완료 시각은 별도 저장됩니다. 동시 실행은 직렬화하며 완료된 예약 슬롯의 중복 수집을 건너뜁니다.

## Local run

- Node.js 22+
- `npm install && npm start`
- Open `http://localhost:3000`
- `npm test`

## Configuration

- `DB_PATH`: SQLite 파일 경로 (운영에서는 영속 디스크 경로 필수)
- `DART_API_KEY`: 발급받은 DART Open API 키. 설정되지 않으면 DART 미수집 상태로 기록
- `NEWS_RSS_URLS`: 사용 권한과 이용약관을 확인한 공개 RSS URL을 쉼표로 나열
- `KRX_SYMBOLS_CSV`: 필요할 때 사용할 `ticker,name` 종목 매핑 CSV override
- `SCHEDULER_ENABLED=true`: 프로세스 내 시간표 활성화
- `COLLECT_TIMES_KST`: 기본 `08:00,08:10,08:20,08:30,08:40,08:50`
- `KRX_HOLIDAYS`: Actions 운영용 KRX 휴장일 `YYYY-MM-DD` 쉼표 목록
- `KRX_CALENDAR_YEAR`: `KRX_HOLIDAYS`가 포괄하는 연도. 누락·연도 불일치 시 주말/평일 대체 주기를 사용하고 달력 상태를 UNVERIFIED로 기록
- `ADMIN_TOKEN`: 수동 수집 요청 API의 Bearer 토큰

종목 목록은 기본적으로 KIND의 공개 상장법인 목록에서 받아 24시간 캐시하며, 다운로드에 실패하면 캐시를 사용합니다. 기본 뉴스 수집원은 KIND 공개 공시 RSS, 한국경제 금융 RSS, 매일경제 증권 RSS입니다. `DART_API_KEY`가 설정된 경우 OpenDART 접수목록도 추가합니다. DART 키는 OpenDART에서 발급받아 `DART_API_KEY` 저장소 비밀 변수로 설정해야 합니다. KIND RSS에는 최근 공시만 보이는 제한이 있고, RSS의 기사 본문·시각 제공 범위도 매체별로 다릅니다. 실행기록에는 출처별 읽은 RSS 건수, 미설정 상태, 오류가 구분되어 저장됩니다.

Node 서버의 선택적 프로세스 스케줄러는 별도 서비스에서 `SCHEDULER_ENABLED=true`일 때만 동작합니다. 정적 Pages 배포의 운영 예약은 `.github/workflows/edge-news.yml`이 담당합니다. 실제 Actions 실행과 웹 배포를 확인하기 전에는 운영 중으로 간주하지 않습니다.

## Important limits

- RSS and DART adapters only collect configured, reachable sources. No access restriction is bypassed.
- DART API does not supply the complete article coverage or exact publication times for every disclosure.
- Company matching uses the official KRX listing download and a small alias table; unmatched headlines remain ticker/company unknown. It does not infer a ticker from a journalist's name or general article body.
- S/A/B/C are heuristic editorial importance labels, not price forecasts. No S label is automatically assigned. Market-cap materiality, estimate surprise, related coverage clustering, corrections, contract rescission, and official-news cross-verification need additional source data and review.
- Never interpret an empty feed as “there is no positive news” unless source status shows successful coverage.
