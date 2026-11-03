# NXT 미리보기 UI 검증

## 상태와 이벤트

`preview/nxt/ui-state.js`는 미리보기 화면의 실제 상태 전이 함수다. 앱의 위임 클릭·변경·키보드 이벤트와 Node 테스트가 같은 `transitionNxtUiState` 함수를 호출한다. 따라서 Node 검증은 전이 규칙과 해당 상태로 렌더링한 HTML을 검증하지만 실제 브라우저 렌더링을 대체하지 않는다.

상태에는 `screen`, `session`, 선택한 ticker/review ID, 필터, 페이지 offset, export 오류 표시가 포함된다. 세션 변경 시 선택 종목은 해제된다. 필터 변경 시 첫 페이지로 돌아가고 선택한 검토 상세를 해제한다. 다음 페이지는 현재 필터 결과의 마지막 유효 페이지를 넘지 않는다.

## 자동 검증

```sh
npm test
node --check preview/nxt/app.js
node --check preview/nxt/ui-state.js
git diff --check
```

Node 테스트는 PRE·AFTER 전환, 상세 및 목록 이동, 복합 필터, 페이지 경계, 내보내기 계약, 상태 표시, 누락·잘못된 스냅샷, 오래된 데이터, URL·HTML 입력 안전성을 확인한다. 테스트 렌더링은 실제 `renderReviewApplication`과 동일한 상태 전이 모듈을 사용한다.

## 브라우저 실행 패키지

`browser-tests/nxt/`에는 별도 Playwright 설정과 실제 사용자 흐름 스펙이 있다. 호환 개발 환경에 `@playwright/test`와 Chromium이 미리 제공돼 있을 때 다음처럼 실행한다.

```sh
npx playwright test --config browser-tests/nxt/playwright.config.mjs
```

설정은 합성 데이터 스냅샷을 다시 만들고 로컬 `127.0.0.1:4173` HTTP 서버를 실행한다. 스펙에는 세션·상세·검토 흐름, 필터와 페이지 이동, JSON 다운로드, 오류 재시도, 360·390·430·768·1280px의 넘침 확인이 포함된다. 테스트 실행 시 파일 시스템의 임시 다운로드를 읽는다.

현재 작업 환경에서는 Chromium 실행 파일이 없어 브라우저 스펙을 실행하지 않았다. 브라우저 설치, 공개 터널 또는 인증 우회는 시도하지 않았다. 따라서 실제 Chrome 렌더링, 키보드 포커스 시각, 다운로드 UI 및 지정 viewport 검증은 별도 미실행 상태다.

## 접근성 및 복구

세션 탭에는 `tablist`/`tab`, `aria-selected`, `aria-controls`, roving tabindex를 적용한다. 좌우 화살표와 Home/End 키로 세션을 바꾸고 포커스를 이동한다. 상태 전환 결과는 앱의 `aria-live` 루트에 다시 그려진다. 오류와 로딩 상태에는 `role=alert` 및 `role=status`가 제공된다. 키보드 포커스 링과 최소 40px 터치 영역을 스타일로 지정했다.

스냅샷 계약 검증에서 실패하거나 데이터가 오래되면 TOP10 순위를 감춘다. 로드 실패에는 재시도 버튼을 제공한다. 데이터 모드는 `mock`만 허용하고 ticker·세션·quote 일치, 중복 항목, 필수 배열을 확인한다. 내보내기도 유효한 Mock 스냅샷만 허용하며 최대 100건이다. 검토 UI는 confidence 또는 reviewStatus를 바꾸지 않는다.

## 이번 단계에서 실행한 것

- 단위 및 UI 상태/렌더링 테스트
- 전체 `npm test`
- JavaScript 구문 검사
- 개발 미리보기의 HTTP 스모크 확인
- 변경분 `git diff --check`

브라우저 및 보조기기 기반 접근성 검증은 실행하지 않았다. 운영 DB, 실제 시세·공시 API, Cloudflare 및 운영 배포는 사용하지 않는다.

## 운영 연결 전 필요한 확인

실제 브라우저에서 지정 화면 폭과 키보드/스크린 리더를 검증하고, 실제 데이터 사용 권한·원천 진위·Provenance의 운영 저장 계약을 별도 검토해야 한다. 이 문서의 격리 미리보기 테스트는 운영 데이터나 실제 투자정보의 유효성을 증명하지 않는다.
