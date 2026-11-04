# STEP 70 — Windows 브라우저 E2E 실행 안내

## 현재 준비 상태

미리보기 E2E는 기존 Playwright 구조를 유지합니다. 이 저장소는 Node.js 22 이상을 요구합니다. Work 실행 환경에서는 `@playwright/test`와 Chromium 실행 파일이 없어 E2E를 실행하지 않았습니다. Windows PowerShell 실행은 아래 일회성 설치를 마친 PC에서 수행합니다.

Playwright Test와 Chromium은 운영 런타임이 아니라 개발 전용 도구입니다. Playwright Test는 npm devDependency로 설치하고 Chromium은 Playwright의 브라우저 설치 명령으로 별도 준비합니다. 일반 PC의 Chrome이 자동으로 사용되는 구성은 아닙니다.

## Windows PowerShell 준비 및 실행

저장소 폴더에서 다음 명령을 순서대로 실행합니다.

```powershell
node --version
npm --version
npm ci
npx playwright install chromium
npm run test:nxt:browser:check
npm run test:nxt:browser
```

Node 버전은 `v22` 이상이어야 합니다. `@playwright/test@1.64.1`은 `package.json`과 `package-lock.json`에 개발 의존성으로 고정돼 있으므로 `npm ci`가 설치합니다. 테스트 러너 설치와 브라우저 설치는 별도 단계라 Chromium 설치 명령도 실행해야 합니다. 이 구성은 시스템 Chrome을 자동 선택하지 않으며 Playwright 관리 Chromium을 사용합니다. 공식 설치 안내: <https://playwright.dev/docs/intro> · <https://playwright.dev/docs/browsers>

STEP 70 작업 환경에서는 `npm ci`나 Chromium 설치를 실행하지 않았습니다. 브라우저 다운로드가 회사 네트워크 정책이나 사용자 PC 설정으로 차단될 경우 인증 우회를 하지 말고 해당 PC 관리자 정책을 확인합니다.

## 점검 상태

`npm run test:nxt:browser:check`는 JSON 결과를 출력하고 `test-results/nxt-browser/preflight.json`에도 기록합니다.

| 상태 | 의미 | 조치 |
|---|---|---|
| `READY` | Node, 파일, 러너, Chromium, localhost 포트, 결과 폴더가 준비됨 | E2E 실행 가능 |
| `MISSING_DEPENDENCY` | `@playwright/test` 또는 Playwright가 없음 | 위 npm devDependency 설치 명령 실행 |
| `BROWSER_UNAVAILABLE` | Playwright Chromium 실행 파일이 없음 | `npx playwright install chromium` 실행 |
| `SERVER_UNAVAILABLE` | 127.0.0.1:4173 포트가 사용 중이거나 loopback 바인딩 불가 | 해당 포트를 사용하는 개발 서버를 종료하고 다시 점검 |
| `CONFIG_ERROR` | Node 22 미만, 필수 파일 누락, 결과 폴더 쓰기 불가 등 | 메시지의 버전·경로·권한 조건 수정 |

여러 문제가 한 번에 있어도 `blockers` 배열에 모두 표시합니다. 이 환경의 점검 상태는 `MISSING_DEPENDENCY`와 `BROWSER_UNAVAILABLE`입니다.

## 실행 동작

`npm run test:nxt:browser`는 사전 점검을 통과해야 진행합니다. 이후 합성 MOCK 스냅샷을 생성하고, 격리 HTTP 서버를 Playwright 설정이 관리하도록 실행하고, E2E 결과를 저장합니다. 실행이 끝나면 원래 `preview/nxt/review-snapshot.json` 바이트를 복원합니다.

개발 서버는 Node 내장 HTTP 모듈을 사용하며 `127.0.0.1:4173`에만 바인딩합니다. `preview/nxt/`의 파일과 해당 화면이 가져오는 3개의 격리 모듈만 제공합니다. GET/HEAD 외 요청은 거부합니다. Python 설치는 필요하지 않습니다. Playwright의 `webServer` 설정은 테스트용 서버 시작·준비 확인·종료를 담당합니다. <https://playwright.dev/docs/test-webserver>

실행 시나리오:

- PRE 진입, 종목 상세, 통합 타임라인, 목록 복귀
- AFTER 전환, 선택 상태, AFTER 상세 및 PRE 복귀
- 검토 대기열 필터와 페이지 이동
- JSON·CSV 다운로드 및 파일 내용·필터·건수 확인
- 스냅샷 오류 후 재시도
- 360px, 390px, 430px, 768px, 1280px에서 TOP10·상세·대기열의 가로 넘침 및 주요 텍스트 잘림 검사

## 결과물 확인

- `test-results/nxt-browser/preflight.json`: 사전 점검
- `test-results/nxt-browser/run-<시각>.log`: 테스트 실행 로그
- `test-results/nxt-browser/run-<시각>.json`: 실행 결과 요약
- `test-results/nxt-browser/playwright-<시각>.json`: viewport별 테스트 상태·오류를 포함하는 Playwright JSON 보고서. 각 테스트에는 실제 브라우저 종류와 버전 annotation이 포함됩니다.
- `test-results/nxt-browser/artifacts/`: viewport별 PNG 및 실패 시 trace·스크린샷

성공 시 viewport 테스트가 화면별 스크린샷을 생성합니다. 실패 시 Playwright 설정에서 실패 화면 캡처와 trace 보존을 요청합니다. 산출물에는 합성 데이터만 사용합니다. 이 경로는 `.gitignore` 처리되어 저장소에 커밋되지 않습니다.

## 실패별 조치

- `MISSING_DEPENDENCY`: PowerShell에서 `npm ci` 실행
- `BROWSER_UNAVAILABLE`: `npx playwright install chromium` 실행
- `SERVER_UNAVAILABLE`: 4173 포트의 기존 서버를 종료하고 다시 점검
- 스냅샷 생성 실패: `npm install`로 기존 프로젝트 의존성 복구 후 재실행
- E2E 실패: 저장된 로그와 `artifacts/`의 screenshot/trace를 확인. 브라우저 출력과 실제 UI 원인을 분리해 수정
- 포트·다운로드 폴더 접근 차단: 승인된 개발 PC 정책을 확인. 공개 터널·인증 우회는 사용하지 않음

## 종료·운영 경계

Playwright가 `webServer`로 시작한 Node 서버는 테스트가 끝나면 종료됩니다. 강제 종료가 필요하면 해당 테스트 터미널에서 `Ctrl+C`를 누릅니다. 스냅샷은 실행 wrapper가 복원하고 결과물은 테스트 전용 폴더에 남깁니다.

이 패키지는 운영 Pages, 공개 JSON, 운영 DB, 뉴스 수집기, KIS·NXT API를 사용하지 않습니다. EDGE NXT의 목표 운영 형태는 단일 사용자 PRIVATE 앱입니다. 개인 API 조회, 비공개 앱 표시, 저장 권한, 응답 진위, 지연·세션·거래대상 검증은 별도 승인 및 확인 전까지 미승인 상태이며 실제 시세는 연결하지 않습니다.
