# EDGE NEWS V1.0

모바일 웹/PWA + Node API + SQLite 뉴스 적재기. 공개 KIND·한국경제·매일경제 RSS 연결은 확인했으며, 배포와 예약 실행은 GitHub 저장소 및 Pages 설정이 완료되기 전까지 운영 중으로 간주하지 않습니다.

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
- `KRX_HOLIDAYS`: KRX 휴장일 `YYYY-MM-DD` 쉼표 목록. 빈 값이면 스케줄러는 안전을 위해 수집하지 않음
- `KRX_CALENDAR_YEAR`: `KRX_HOLIDAYS`가 포괄하는 연도. 현재 KST 연도와 다르면 스케줄러는 수집하지 않음
- `ADMIN_TOKEN`: 수동 수집 요청 API의 Bearer 토큰

종목 목록은 기본적으로 KIND의 공개 상장법인 목록에서 받아 24시간 캐시하며, 다운로드에 실패하면 캐시를 사용합니다. 기본 뉴스 수집원은 KIND 공개 공시 RSS, 한국경제 금융 RSS, 매일경제 증권 RSS입니다. `DART_API_KEY`가 설정된 경우 OpenDART 접수목록도 추가합니다. DART 키는 OpenDART에서 발급받아 `DART_API_KEY` 저장소 비밀 변수로 설정해야 합니다. KIND RSS에는 최근 공시만 보이는 제한이 있고, RSS의 기사 본문·시각 제공 범위도 매체별로 다릅니다. 실행기록에는 출처별 읽은 RSS 건수, 미설정 상태, 오류가 구분되어 저장됩니다.

Node 서버의 스케줄러는 Asia/Seoul 시각을 사용하고 주말을 건너뜁니다. KRX 휴장일과 대상 연도를 설정하지 않으면 안전을 위해 수집하지 않습니다. `.github/workflows/edge-news.yml`에는 GitHub Actions와 Pages를 이용하는 저비용 대안이 준비되어 있지만, GitHub 예약 실행은 지연·누락될 수 있으므로 지정 분 시각을 보장하지 않습니다. 어느 방식도 실운영 자동 실행 검증 전에는 운영 중으로 간주하지 않습니다.

## Important limits

- RSS and DART adapters only collect configured, reachable sources. No access restriction is bypassed.
- DART API does not supply the complete article coverage or exact publication times for every disclosure.
- Company matching uses the official KRX listing download and a small alias table; unmatched headlines remain ticker/company unknown. It does not infer a ticker from a journalist's name or general article body.
- S/A/B/C are heuristic editorial importance labels, not price forecasts. No S label is automatically assigned. Market-cap materiality, estimate surprise, related coverage clustering, corrections, contract rescission, and official-news cross-verification need additional source data and review.
- Never interpret an empty feed as “there is no positive news” unless source status shows successful coverage.
