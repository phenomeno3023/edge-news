# KIS·NXT 공식 문의 경로 및 연동 결정 경로

확인일: 2026-11-04 (UTC). 실제 문의 발송이나 회원가입·계약·인증은 하지 않았다.

## 공식 문의 경로

| 공급자/목적 | 공식 경로 | 필요한 용도·요건 | 로그인·신청 관련 확인 |
|---|---|---|---|
| KIS API 계약·기술 문서 | KIS Developers API 가이드·FAQ·Chatbot: https://apiportal.koreainvestment.com/ | 공개 API 문서와 FAQ를 먼저 확인. 서버 장애는 KIS 안내에 따라 고객의 소리(VOC) 경로 | 공개 포털은 로그인 메뉴를 노출. FAQ·Chatbot은 공개 안내됨. VOC의 로그인 요건은 이번 확인에서 미확인 |
| KIS 개인 API 사용 | 서비스 이용 안내: https://apiportal.koreainvestment.com/about-howto | 개인/일반법인 본인 자산 목적의 Open API는 한국투자 홈페이지 또는 앱을 통한 서비스 신청 안내 | 계좌·ID 연결 및 API 신청은 이용자 본인 절차. STEP 67에서는 신청·로그인하지 않음 |
| KIS 제휴 제안 | https://apiportal.koreainvestment.com/provider-apply 및 https://apiportal.koreainvestment.com/provider-process | 제휴 제안 화면은 서비스 설명, 사용 API, 회사 정보 등을 요구. 공개 자격은 제도권 투자일임·투자자문 회사 등으로 제한되고 핀테크사는 제휴 불가라고 안내 | 제안 제출 화면은 회사/담당자/전화/메일 및 개인정보 동의 필요. 제출하지 않음. `openapi@koreainvestment.com`은 제휴 제안 안내 주소이며 비밀유지 의무가 없고 일반 기술지원으로 보장되지 않음 |
| NXT 데이터 이용계약 | NXT Data Portal: https://portal.nextrade.co.kr/mdclient/home.do / `data@nextrade.co.kr` | Data Usage Agreement, 데이터 상품·계약 문의 | 포털은 회원가입→상품선택→주문·계약→전자서명 절차를 안내. 로그인/가입하지 않음. 문의 이메일 템플릿도 공개 |
| NXT 실시간·종가 데이터 배포 | `mdds@nextrade.co.kr` | Real-time / End-of-Day data distribution 문의 | NXT Data Portal Contact Us에 공개 |
| NXT 네트워크 계약·연결 | `network@nextrade.co.kr` | Network Agreement 및 connectivity support | NXT Data Portal Contact Us에 공개 |
| NXT 일반 대표 문의 | `02-6675-8500` / https://www.nextrade.co.kr/siteMap/content.do | 공식 사이트에 기재된 대표전화. 데이터 계약 담당 직통번호로 확인된 것은 아님 | 전화하지 않음 |

공식 공개자료:
- KIS 제휴 대상·제출 요건: https://apiportal.koreainvestment.com/provider-apply
- KIS 제휴 절차·요구 문서: https://apiportal.koreainvestment.com/provider-process
- KIS 일반 이용 안내·FAQ/Chatbot/VOC 경로: https://apiportal.koreainvestment.com/about-howto
- NXT 데이터 상품·연락처: https://portal.nextrade.co.kr/mdclient/member/custom/productOutline.do?menuId=ProdOut
- NXT 계약 절차: https://portal.nextrade.co.kr/mdclient/member/cntrct/procedure.do?menuId=ducprocess
- NXT 사이트 대표전화: https://www.nextrade.co.kr/siteMap/content.do

### 문의 양식과 회원 여부

- KIS API 가이드·FAQ는 공개 포털에서 안내되며 로그인 메뉴가 함께 노출됩니다. 회원 전용 상세 문서의 접근 조건을 임의 시험하지 않았습니다.
- KIS 개인 API 신청은 홈페이지/앱 계정·신청 절차입니다. 기존 계정이나 신청 상태를 조회하지 않았습니다.
- KIS 제휴 제안은 별도 자격 및 회사정보·동의 항목을 요구합니다. 현재 안내에 따르면 개인고객 및 제도권이 아닌 핀테크사는 제휴 대상이 아닙니다. 이를 개인 API 사용 전체의 불가 판정으로 확대하지는 않습니다.
- NXT Data Portal은 회원가입과 상품 선택, 계약 전자서명을 안내합니다. 데이터 제공은 Data Usage 및 필요한 Network Agreement 체결 후라고 안내합니다. 문의 메일과 제출 템플릿은 공개돼 있지만 메일 문의 자체의 별도 회원 요건은 명시된 페이지에서 확인하지 못했습니다. 조사 도구로 포털 상세 페이지를 직접 열 때 403이 발생했고 공식 도메인의 검색 색인에 노출된 내용을 대조했습니다.
- 공급자 연락처는 공개된 공식 자료로 확인했습니다. 실제 문의·전화·계약은 실행하지 않았습니다.

## 실제 연동 후보 경로 비교

| 경로 | 공식 근거 | PRE/AFTER | 전체 커버리지 | 지연·권한 | 복잡도·판정 |
|---|---|---|---|---|---|
| A. KIS REST 변동률 순위 | NXT 선택 `NX`가 있는 순위 endpoint 설정 확인 | 세션 분리 미확인 | 반환 상한·페이지 끝·전체 대상 포함 미확인 | 실제 응답/지연/계정 권한 확인 필요 | 가장 단순해 보이나 PRE·AFTER TOP10 용도로 적합하다고 판정할 수 없음 |
| B. KIS NXT WebSocket 체결 수신 후 자체 순위 | `H0NXCNT0` 공개 예제 및 47개 컬럼 순서 확인 | `MARKET_CLS_CODE` 컬럼 및 코드 후보는 있으나 실제 계약·대상별 구독 가능 수·세션 누락 여부 미확인 | 거래대상 전체 목록과 구독/호출 한도 확인 전 커버리지 보장 불가 | 실응답, 지연, 단위, 기준가, 계정 권한 필요 | 구현 복잡도 높음. 전체 종목 구독 가능 여부도 공급자 확인 필요 |
| C. NXT 공식 데이터 상품 | NXT Data Portal의 실시간 및 종가 상품, 데이터 전달·계약 경로 확인 | 제품 사양 답변 전 미확인 | 상품별 데이터 범위와 universe 확인 필요 | Data Usage Agreement, 필요 시 Network Agreement 및 상품 조건 확인 필요 | 공식 배포 제품을 계약으로 확인하는 경로. 개인 자격·비용은 미확인 |
| D. 승인된 제휴 데이터 공급자 | STEP 67에서 특정 업체/상품 계약을 확인하지 않음 | 미확인 | 계약·종목 범위 미확인 | 권리·지연·재배포 계약별 검증 필요 | 후보 조사 전 단계. 공급자 승인과 라이선스 확인 필수 |

어떤 경로도 지금 바로 LIVE에 적합하다고 확정하지 않았습니다. C는 공식 계약 문의의 명확한 경로가 확인됐지만 계약·요금·개인 신청 자격은 아직 확인되지 않았습니다.

## 데이터 경로 분리 설계

### MODE PRIVATE

- 계정별 개인 API 이용 및 개인 내부 표시 권한을 먼저 확인합니다.
- 개인 인증 계정에 허용된 조회 수단만 사용하며 공개 Pages/공개 JSON으로 흐르지 않도록 데이터 경로와 저장을 분리합니다.
- 허용된 계정과 비공개 접근 통제를 검증한 뒤 별도 승인된 격리 환경에서 실응답을 검사합니다.
- 개인 계정이 있다는 사실만으로 비공개 웹앱 표시, 서버 수집 또는 저장을 허용하지 않습니다.

### MODE PUBLIC

- 별도의 외부 공개·제3자 제공·실시간/지연 재배포 권한이 문서로 확인돼야 합니다.
- 권한 계약과 provenance가 확인된 데이터만 공개 출력 경로로 전달합니다.
- 미확인, 만료, 계약 범위 초과, 세션/신선도 실패는 fail-closed로 차단하고 실제 데이터를 Mock으로 바꾸지 않습니다.
- 공개 권한이 없거나 불명확하면 시세는 `blocked/unavailable` 상태로 남기고 기존 뉴스·공시 기능과 Mock 미리보기만 유지합니다.

## 사용자 승인 또는 정보가 필요한 사항

- KIS 계정 보유와 개인 API 서비스 신청 상태: 사용자가 확인해야 하지만 이번 단계에서 조회하지 않음
- 개인용 비공개 앱과 공개 웹 중 목표 제공 형태: 사용자가 결정
- 공급자 문의 이메일/웹폼 발송: 사용자 승인 후에만 가능. 현재 초안 상태
- KIS/NXT 데이터 상품·계약 신청, 약관 동의, 요금 결제: 별도 명시 승인 필요
- 인증된 실제 응답을 격리 환경에서 검사: 계정·권한·테스트 범위에 대한 별도 승인 필요

저장소에서는 추적 대상 인증 파일명만 확인하고 인증값 또는 GitHub Secrets 값을 조회·출력하지 않습니다. GitHub Settings의 Secrets는 이번 단계에서 조회하지 않았습니다.

## STEP 68 진입 조건

**경로 1 — 공급자 답변 또는 공식 계약자료 확보:** 응답 원문/문서 버전과 적용 범위를 기록하고, 실제 API 테스트가 별도 승인된 후에만 field map과 evidence registry를 갱신합니다. 계정별 권한·세션·전체성·재배포 조건은 각각 검증합니다.

**경로 2 — 공급자 답변이 아직 없음:** 같은 공개 문서를 반복 조사하지 않습니다. LIVE 관련 모듈은 변경하지 않고 Mock 기반 TOP10 모바일 UI, 뉴스·공시 연결, 검토 흐름, 오류·접근성 등 사용자 경험 품질을 개선합니다.

STEP 68은 공급자 답변을 기다리는 동안에도 경로 2의 독립 작업으로 시작할 수 있습니다. 단, 실제 API 호출·인증·공개 시세 출력은 별도 권한 확인 전까지 계속 차단합니다.
