# STEP 67 — 13개 NXT 계약 결손 후속 조치표

기준일: 2026-11-04. 상태는 STEP 66에서 조사된 범위와 STEP 67 문의 패키지 기준이다. 완전 해소 항목은 0개다.

| # | 결손 | 현재 상태 | 담당 공급자 / 문의 | 공급자 답변 후 검증 | 실제 API 시험 | 권한 승인 | 해소 전 차단 기능 |
|---:|---|---|---|---|---|---|---|
| 1 | 기준가격 필드·세션 기준 | UNVERIFIED | KIS 기술 문의 P0-2 | 문서 버전·필드·시장/세션 reference 확인 후 각 세션 샘플 대조 | 필요 | 개인 조회 권한 별도 | 유효 quote 및 등락률 산출 |
| 2 | 등락률 산식·기준·배율·반올림 | PARTIAL, 미해결 | KIS P0-2 | 문서 산식으로 기준가·배율·부호·반올림 표본 재계산 및 비교 | 필요 | 개인 조회 권한 별도 | 공식 상승률, 정확 TOP10 |
| 3 | 현재가 wire type·가격 단위 | UNVERIFIED | KIS P0-1 | wire type, 소수/부호/호가단위 및 알려진 값 경계 테스트 | 필요 | 개인 조회 권한 별도 | 가격 정규화 |
| 4 | 거래대금 단위·누적 의미 | PARTIAL, KIS 계약 미해결 | KIS P0-2/3; NXT 데이터 상품 질의 | 통화·단위·합산범위 확인 후 문서 샘플과 실응답 교차검증 | 필요 | 사용·저장 권한 별도 | 거래대금 정렬·필터 |
| 5 | 누적 거래량 집계 범위 | UNVERIFIED | KIS P0-3 | 세션 경계 전후 누적 리셋·합산 정의를 응답 시계열로 확인 | 필요 | 개인 조회 권한 별도 | 세션 거래량 TOP10 |
| 6 | 체결시각 포맷·시간대·날짜 경계 | UNVERIFIED | KIS P0-3 | BSOP_DATE/STCK_CNTG_HOUR 경계 사례와 시간대·휴장일 처리 확인 | 필요 | 개인 조회 권한 별도 | 세션 판정·신선도 |
| 7 | 원천 생성 시각 | UNVERIFIED | KIS P0-3 | 명시 필드 여부, source/receive timestamp 차이를 실제 응답으로 검증 | 필요 | 개인 조회 권한 별도 | 데이터 지연·최신성 검증 |
| 8 | 지연 flag·지연 정책 | PARTIAL, KIS feed 미해결 | KIS P0-4/P1-9; NXT data distribution | feed별 realtime/delayed 등급·지연시간 문서와 timestamp 비교 | 필요 | 실시간/지연 표시 권한 각각 필요 | LIVE badge·현재순위 표시 |
| 9 | PRE·AFTER 순위 계약 범위 | PARTIAL, 미해결 | KIS P1-6~9 | 요청 파라미터·응답 범위·연속조회 종료·세션별 결과 완전성 확인 | 필요 | ranking API 권한 별도 | PRE·AFTER TOP10 |
| 10 | 최신 전체 NXT universe·세션 자격 | PARTIAL, 전체 목록 없음 | KIS P2-10; NXT P0-1~3 | 기준일·전체성 선언·코드 중복/누락·PRE/AFTER flags·공지 delta 적용 확인 | 파일 확보 후 검증, API는 별도 | 파일 이용 조건 확인 | 전체 시장 TOP10 주장 |
| 11 | 거래일 캘린더·임시 예외 | PARTIAL, 날짜별 자료 없음 | NXT P1-6~7 | 공식 연간 캘린더·임시 휴장·시간 변경 사례를 테스트 fixture로 검증 | API가 아닌 공식 calendar feed 검증 | 자료 사용 조건 확인 | 해당 날짜의 LIVE session 판정 |
| 12 | 실제 payload authenticity | UNVERIFIED | KIS 실제 테스트 응답 필요 | 승인된 수신 경로, 원시 payload digest, 출처·시각·계약 버전 상호검증 | 반드시 필요 | 사용자가 실제 격리시험 별도 승인 | 모든 LIVE 승격 |
| 13 | 개인 이용·공개 재배포 권한 | BLOCKED | KIS rights 문의; NXT `data@nextrade.co.kr` / `mdds@nextrade.co.kr` | 계약 주체·서비스·접근자·실시간/지연·표시/저장/재배포 범위 대조 | API 시험과 별도 | 반드시 필요 | 공개 JSON/Pages 실제 시세 |

## 문의 번호와 후속 게이트

- KIS 기술 문의 P0-1~5, P1-6~9, P2-10: `docs/nxt-kis-technical-inquiry.md`
- NXT universe·calendar·상품 질문 P0-1~5, P1-6~7, P2-8~9: `docs/nxt-nextrade-data-inquiry.md`
- 사용 권리 A~F: `docs/nxt-marketdata-rights-inquiry.md`
- 답변은 증거 URL/파일, 문서 버전, 발효일, 원문 digest 유형과 함께 검토합니다. 문서 확인과 payload authenticity, 계정 권한, 재배포 권한을 하나의 상태로 합치지 않습니다.
- KIS `.mst`는 다운로드 경로가 공개돼 있음을 확인했지만 원본 파일을 확보하지 못했습니다. NXT Q4 606종목 공지와 변경 공지는 전체 universe 원본이 아닙니다.
- 아직 공급자 답변은 없습니다. 모든 초안은 발송 전 사용자 승인 대상입니다.
