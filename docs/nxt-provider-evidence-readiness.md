# STEP 63 — 공급자 증거 및 실제 연동 준비

확인일: 2026-11-03 (UTC). 이 문서는 공개 공식 페이지와 합성 입력만 사용한다. 계정 로그인, API 호출, 운영 DB 접근은 하지 않았다.

## 공식 자료에서 확인된 내용

| 항목 | 공식 자료 및 확인된 내용 | 증거 수준 | 미확인 사항 |
|---|---|---|---|
| KIS NXT WebSocket 장 구분 | [KIS NXT 제도 변경 안내](https://apiportal.koreainvestment.com/intro)에서 `H0NXCNT0` NXT 실시간 체결과 `MARKET_CLS_CODE`를 안내하고, `1` 프리, `2` 정규, `3` 애프터, `5` 종가로 정의 | DOCUMENTED | 실제 계정 응답·응답 구조 전체·체결시각·가격 필드 인증 |
| KIS 시세 API 유형 | [KIS API 서비스 목록](https://apiportal.koreainvestment.com/apiservice-category)은 REST 시세/순위와 WebSocket 체결·호가 유형을 나열 | DOCUMENTED | NXT 프리·애프터별 순위 API ID와 현재 계약 버전, 응답 필드별 단위 |
| KIS NXT 종목 마스터 | KIS [종목정보 파일](https://apiportal.koreainvestment.com/apiservice-category) 목록에 KOSPI(NXT), KOSDAQ(NXT) 파일 범주가 존재 | DOCUMENTED | 현재 내려받은 파일, 전체성, 세션별 가능 여부 및 유효기간 |
| NXT 시간표 | [NXT 거래제도](https://www.nextrade.co.kr/menu/transactionSys.do): PRE 08:00–08:50, MAIN 09:00:30–15:20, AFTER 호가접수 15:30–20:00 / 매매 15:40–20:00 | DOCUMENTED | 날짜별 예외와 인증된 실제 거래일 달력 |
| 시세 이용권 | KIS [Open API 이용 안내](https://apiportal.koreainvestment.com/about-open-api)는 개인 시세를 자기 투자 목적으로 제한하고 제3자 제공 불가, 법인/제휴 서비스의 화면 표출에는 별도 거래소 등 시세 이용계약이 필요하다고 안내 | DOCUMENTED | 이 프로젝트·계정에 적용되는 계약 및 공개 재배포 권한 |
| NXT 대상 변경 | NXT의 [대상 종목 변동 내역](https://nextrade.co.kr/menu/transactionStatusConclusion/menuList.do) 및 분기별 대상 변경 공지는 대상 목록이 시점에 따라 바뀔 수 있음을 보여줌 | DOCUMENTED | 실행 시점의 완전한 PRE/AFTER별 대상 목록 |

위 `DOCUMENTED`는 문서에 대한 확인이다. 실제 API 응답이 진짜임을 증명하는 `AUTHENTICATED` 또는 `LIVE_VERIFIED`가 아니다. 공개 문서에 구체적인 NXT quote payload 예시가 확인되지 않은 시세 필드명은 코드에 공식 매핑으로 등록하지 않았다.

## 필드 매핑 상태

| 의미 | 공급자 필드 | 상태 | 메모 |
|---|---|---|---|
| NXT 마켓 세션 구분 | `MARKET_CLS_CODE` | DOCUMENTED | `1` PRE, `3` AFTER만 지원. `2` 정규와 `5` 종가는 PRE/AFTER 입력으로 거부 |
| 종목코드 | 미등록 | UNVERIFIED | NXT 응답 필드 의미 확인 전 매핑 불가 |
| 현재가·기준가격·등락률 | 미등록 | UNVERIFIED | 종목별 NXT quote payload 및 기준가격/반올림 규칙 미확인 |
| 거래량·거래대금 | 미등록 | UNVERIFIED | 필드명, 단위, 세션 누적 기준 미확인 |
| 거래일·체결 시각·원천 시각·지연 여부 | 미등록 | UNVERIFIED | 문서 계약 및 실제 응답 미확인 |
| 상승률 순위·대상 범위 | 미등록 | UNVERIFIED | NXT PRE/AFTER 전용 순위 계산/조회 계약 미확인 |

`src/nxt/kis-quote-adapter-contract.js`는 I/O 없는 순수 정규화 함수다. 필드 매핑은 공급자, 계약 버전, 증거 ID, 문서 필드가 모두 등록되고 만료되지 않은 경우에만 수행한다. 지원하지 않는 값은 차단한다. 합성 및 문서 예시는 LIVE가 될 수 없다.

## 증거 계약과 등록소

`provider-evidence-contract.js`는 문서·예시·인증 캡처를 별도 sample type으로 취급한다. `AUTHENTICATED`는 `authenticated_capture`, 응답 식별자, 인증 방법, 확인 시각이 모두 제공될 때만 구조적으로 유효하다. 실제 인증 응답은 이번 작업에서 수집하지 않았다. `evidenceDigest`는 제공된 메타데이터 객체의 SHA-256 요약이며 원문 페이지나 API payload의 해시로 가장하지 않는다.

등록소는 ID 중복, ID/digest 충돌, 같은 provider/contract/field의 의미 충돌, 만료 및 필수 근거 누락을 구분한다. 충돌을 자동 병합하지 않는다. 현재 등록소는 개발용 인메모리 구조로 운영 저장소와 분리돼 있다.

## NXT 유니버스와 세션

`nxt-universe-contract.js`는 원천, 기준일, 버전, 전체성, 검증 상태, digest, 유효기간 및 종목별 PRE/AFTER 플래그를 검증한다. 부분 목록은 구조적으로 읽힐 수 있지만 eligibility를 허가하지 않는다. KRX 상장만으로 NXT 자격을 부여하지 않는다. STEP 62의 기존 게이트가 요구하는 인증된 완전 목록 조건을 그대로 사용한다.

NXT 공개 시간표를 코드에 일정 사실로 기록할 수는 있지만 거래일 달력·예외 정책이 LIVE_VERIFIED가 아니므로 실제 quote 승인에는 충분하지 않다.

## 권한 게이트와 LIVE 차단

`provider-gate-integration.js`는 STEP 62 quote, 신선도, 세션/달력, NXT 유니버스, 이용권 및 LIVE 승격 게이트를 조합한다. 권한 문서가 공개되어 있다는 이유로 사용자의 API 이용권이나 재배포 승인을 설정하지 않는다. 개인 조회, API 호출, 앱 내부 표시, 공개 표시, 실시간/지연 재배포는 각각 독립 입력이다.

현재 상태: API 실호출 0회, 인증 응답 0개, 검증된 전체 NXT 목록 0개, 계정 권한 확인 0건, LIVE 승격 허용 0건. 차단된 실제 데이터는 MOCK으로 라벨 변경하지 않고 blocked/unavailable 상태로 남긴다.

## 테스트 및 실행

```sh
node scripts/run-nxt-provider-evidence.js
node --test test/nxt-provider-evidence.test.js test/nxt-kis-adapter-contract.test.js test/nxt-universe-contract.test.js test/nxt-provider-gate-integration.test.js
```

이 단계에서 Playwright 패키지 및 실행 브라우저는 사용할 수 없었다. STEP 61 브라우저 검증 패키지는 그대로 보존했으며 실제 브라우저 렌더링·다운로드는 UNVERIFIED다.

실제 연동 전에는 최신 API 규격 및 샘플, 승인된 인증 응답, 계약 버전, NXT 전체 대상과 달력, 데이터 신선도 기준, 계정/서비스별 이용·재배포 권한을 확보하고 별도 검토해야 한다. 이 문서는 계약 완료나 실제 연동 승인을 의미하지 않는다.
