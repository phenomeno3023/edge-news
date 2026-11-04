# STEP 69 — 브라우저 검증 현황 및 재현 절차

## 판정

판정은 `PARTIAL`입니다. 현재 실행 공간에서 실제 Chromium/Chrome 실행 파일과 프로젝트의 `@playwright/test` 패키지를 확인하지 못했습니다. Playwright를 설치하거나 인증·접속을 우회하지 않았으며 실제 브라우저 테스트와 스크린샷을 생성하지 않았습니다. 브라우저 시각 검증과 클릭·다운로드 검증은 `UNVERIFIED`입니다.

## 실행 환경 점검

- 저장소 HEAD: STEP 68 기준 `7f7f242e1cca56b699d3343bcc28c61fc5cf273f`
- 원격 개발 브랜치 HEAD: 같은 커밋
- Playwright 코어 모듈: Work 런타임에서 검색됨
- `@playwright/test`: 프로젝트에서 검색되지 않음
- Chromium/Chrome/Firefox 실행 파일: 실행 가능한 바이너리 없음
- 기존 headless-shell 실행: 실패, 필요한 브라우저 실행 파일 없음
- 두 번째 Chrome 경로 실행: 실패, 바이너리 경로에 실행 파일 없음
- 설치, 네트워크 인증, 공개 터널, 운영 Pages: 사용하지 않음

실패한 브라우저 시작을 반복하지 않았습니다. 이전 STEP에서 실패한 분리 브라우저와 로컬 서버 연결도 다시 시도하지 않았습니다.

## E2E 시나리오 패키지

기존 `browser-tests/nxt/` 설정을 보존하고 STEP 68에서 바뀐 다운로드 버튼 이름과 타임라인을 반영했습니다. 테스트 패키지에는 PRE 상세 진입, AFTER 전환, 선택 초기화, 통합 타임라인, 검토 대기열, JSON·CSV 다운로드와 360·390·430·768·1280px의 가로 넘침 점검이 포함됩니다. 스냅샷 오류 복구 시나리오도 유지합니다.

이 수정된 Playwright 시나리오는 현재 실행 환경에 필요한 패키지와 브라우저가 없어 실행되지 않았습니다. 따라서 시나리오의 실제 PASS를 주장하지 않습니다.

승인된 격리 브라우저 환경에서 저장소 루트 기준으로 다음을 실행합니다.

```sh
node scripts/build-nxt-preview-data.js
npx playwright test -c browser-tests/nxt/playwright.config.mjs --reporter=list
```

테스트는 미리보기용 합성 스냅샷과 `127.0.0.1:4173` 개발 서버만 사용하도록 구성돼 있습니다. 현재 Work 환경에는 `@playwright/test`와 Chromium이 없어 위 명령은 실행하지 않았습니다. 실행 전 필요한 환경은 `@playwright/test`, Chromium 실행 바이너리, 같은 격리 환경 내 loopback HTTP 접근입니다. 새 패키지나 브라우저 설치를 허용할 별도 승인 또는 이미 갖춰진 격리 실행 환경이 필요합니다.

## 개인 전용 운영 기준

EDGE NXT의 장기 목표는 단일 사용자 전용 PRIVATE 앱입니다. 외부 사용자 대상 실제 시세 제공과 공개 재배포 기능은 개발 우선순위에서 제외합니다. 개인 전용 목표도 KIS 개인 API 이용 자격, 비공개 웹앱 표시, 저장 권한, 응답 진위, 신선도, 세션 및 거래대상 검증을 대신하지 않습니다. 실제 API 연결은 계약과 사용 권한 확인 전까지 차단 상태로 유지합니다. 공급자 문의서는 보존하며 이번 단계에서 발송하지 않습니다.

## 이번 STEP에서 실행한 검증

- 전체 `npm test`: 641 PASS / 0 FAIL
- `node --check` 대상 JavaScript 및 Playwright spec: 통과
- `git diff --check`: 통과
- Playwright E2E, 실제 화면 렌더링, 다운로드 파일 열기: 실행하지 못함
- 브라우저 스크린샷: 생성하지 않음
- 실제 API·운영 DB 접근: 없음

## STEP 70 권고

Chromium과 `@playwright/test`가 이미 제공되는 승인된 격리 환경에서 문서의 E2E 명령을 실행하고, 모든 viewport의 가로 넘침·탭·상세·필터·페이지·다운로드를 확인합니다. 설치 승인이 없다면 브라우저 테스트는 계속 `UNVERIFIED`로 유지합니다. 개인용 KIS 사용 권한과 저장·비공개 표시 조건이 확인되기 전까지 LIVE 기능은 개발하지 않습니다.
