# STEP 71 — Windows 실제 브라우저 E2E 실행 안내

## 목표와 현재 상태

이 안내서는 개발 브랜치의 합성 MOCK 미리보기를 Windows PC에서 실행해 Chromium E2E 증거를 만드는 절차입니다. 운영 Pages, 운영 DB, 실제 시세 API는 사용하지 않습니다.

이번 STEP 실행 환경은 Linux입니다. 사용자 Windows PC에 연결돼 있지 않으므로 Windows 명령이나 실제 브라우저 테스트는 실행하지 않았습니다. 실제 브라우저 검증 상태는 `UNVERIFIED`입니다.

## 준비물

- Git for Windows
- Node.js 22 이상 및 npm
- 저장소 개발 브랜치
- Playwright 관리 Chromium
- 저장소 폴더에 쓸 수 있는 권한
- `127.0.0.1:4173` 포트 사용 가능

Playwright Test `1.64.1`은 `package.json`과 `package-lock.json`에 개발 의존성으로 고정돼 있습니다. 기존 Chrome을 자동으로 선택하지 않습니다. 이 테스트 구성에는 Playwright Chromium을 설치해 사용하십시오.

## 개발 브랜치 받기

개발 브랜치 주소:

<https://github.com/phenomeno3023/edge-news/tree/edge-nxt-step43-worker-20261031>

저장소가 없는 PC에서는 PowerShell에서:

```powershell
git clone --single-branch --branch edge-nxt-step43-worker-20261031 https://github.com/phenomeno3023/edge-news.git
Set-Location edge-news
```

저장소가 이미 있다면 저장소 디렉터리에서:

```powershell
git fetch origin edge-nxt-step43-worker-20261031
git switch edge-nxt-step43-worker-20261031
git pull --ff-only origin edge-nxt-step43-worker-20261031
```

예상 기준 커밋은 `552188d9e5f8ec1e941c15b49ad63b0a5f08dc75`입니다. 이후 커밋이 있다면 원격 브랜치의 최신 코드를 사용합니다. `git pull`에서 fast-forward가 불가능하다는 메시지가 나오면 강제 초기화하지 말고 실행을 멈춰 작업 트리 상태부터 확인하십시오.

## 설치 전 확인

저장소 루트인지 확인하고 도구 버전을 살펴봅니다.

```powershell
Get-Location
git status --short
node --version
npm --version
```

Node.js가 `v22` 이상이어야 합니다. 조건에 맞지 않으면 Node.js 22 이상을 설치한 뒤 새 PowerShell 창에서 버전을 다시 확인합니다.

## 의존성과 Chromium 준비

저장소 루트에서 아래 명령을 순서대로 실행합니다.

```powershell
npm ci
npx playwright install chromium
```

`npm ci`는 저장소 잠금 파일에 맞춰 개발·실행 패키지를 설치합니다. 두 번째 명령은 Playwright가 사용하는 Chromium을 별도로 설치합니다. 회사 네트워크 정책으로 내려받기가 차단되면 인증 우회 대신 PC 관리자에게 허용된 설치 경로를 확인하십시오.

## 사전 점검

```powershell
npm run test:nxt:browser:check
```

다음 조건을 확인하고 `READY`가 출력돼야 E2E로 진행할 수 있습니다.

- Node.js 22 이상
- `@playwright/test`와 Playwright 패키지 설치
- Playwright Chromium 실행 파일 존재
- 미리보기 필수 파일 존재
- localhost 서버 시작 및 HTTP 응답 가능
- 포트 `4173` 사용 가능
- 결과 폴더 쓰기 가능

점검 결과는 `test-results/nxt-browser/preflight.json`에도 기록됩니다. `READY`가 아니면 이어서 E2E를 실행하지 말고 출력된 `blockers`를 해결하십시오.

## 실제 E2E 실행

```powershell
npm run test:nxt:browser
```

실행 명령은 `package.json`에 등록돼 있습니다. 실행기는 사전 점검 후 합성 MOCK 스냅샷을 생성하고 Playwright가 `127.0.0.1:4173` 미리보기 서버를 시작하도록 합니다. 테스트가 끝나면 서버를 종료하고 원래 스냅샷 파일을 복원합니다.

현재 Playwright 시나리오는 8개 테스트 케이스로 PRE·AFTER와 종목 상세, 검토 대기열, JSON·CSV 다운로드, 오류 재시도, 다섯 viewport 레이아웃을 확인하도록 구성돼 있습니다. 이는 준비된 테스트 범위이며, 실제 실행 전에는 결과가 아닙니다.

## 성공 결과와 파일 위치

실제 실행 결과는 아래에 저장됩니다.

```text
test-results/nxt-browser/
```

- `preflight.json`: 실행 환경 점검 결과
- `run-<시각>.log`: Playwright 실행 로그
- `run-<시각>.json`: 실행 요약과 종료 코드
- `playwright-<시각>.json`: 테스트별 PASS·FAIL·오류 결과
- `artifacts/`: viewport별 스크린샷, 실패 시 스크린샷과 trace

Playwright JSON 결과에는 각 테스트가 사용한 브라우저 종류와 버전 annotation이 기록됩니다. JSON·CSV 다운로드는 자동 테스트 안에서 생성 후 필드와 내용을 검사합니다. 산출물을 별도 보관할 필요가 있으면 결과 폴더를 보관하십시오.

## 실패 확인

- `MISSING_DEPENDENCY`: 저장소 루트에서 `npm ci`를 실행했는지 확인합니다.
- `BROWSER_UNAVAILABLE`: `npx playwright install chromium` 실행 상태와 설치 오류를 확인합니다.
- `SERVER_UNAVAILABLE`: 포트 `4173`을 사용하는 미리보기 서버를 종료한 뒤 점검을 다시 실행합니다. 다른 프로세스를 확인 없이 강제 종료하지 마십시오.
- `CONFIG_ERROR`: Node 버전, 필수 파일, 결과 폴더 권한을 확인합니다.
- Playwright assertion 실패: `playwright-<시각>.json`, 실행 로그, 해당 테스트의 screenshot·trace를 살펴봅니다. 사전 점검·서버 시작 실패는 UI 결함과 구분합니다.
- 다운로드 실패: JSON·CSV assertion과 오류 로그를 확인합니다. 테스트는 합성 데이터만 사용합니다.

## 결과 전달과 종료

`test-results/nxt-browser/`를 압축해 이 대화에 첨부하면 실행 결과를 분석할 수 있습니다. 전달 전 파일에 다른 개인 정보가 섞이지 않았는지 확인하십시오. 테스트 입력은 합성 MOCK 데이터이며 API 키, 계좌번호, 비밀번호, 실제 시세를 입력하지 않습니다.

압축 예시:

```powershell
Compress-Archive -Path .\test-results\nxt-browser\* -DestinationPath .\nxt-browser-results.zip -Force
```

실행 중 터미널을 중단해야 하면 `Ctrl+C`를 누르십시오. Playwright가 시작한 개발 서버는 테스트 종료 시 자동으로 닫힙니다. 운영 서비스 배포나 실제 시세 API 사용은 이 절차에 포함되지 않습니다.

## 보안·운영 경계

EDGE NXT의 운영 목표는 단일 사용자 PRIVATE 앱입니다. 실제 API 권한·개인 비공개 표시·저장 권한은 별도 확인 전까지 미승인 상태입니다. KIS 인증정보를 소스, 브라우저, 공개 JSON 또는 로그에 넣지 마십시오. 운영 DB, 운영 Pages, Cloudflare Worker 및 공급자 문의를 이 테스트에서 사용하지 않습니다.
