# STEP 66 — KIS·NXT 공급자 확인 문의 초안

> STEP 67에서 공식 문의 경로를 재확인하고 질문을 분리했습니다. 제출용 최신 문안은 `nxt-kis-technical-inquiry.md`, `nxt-nextrade-data-inquiry.md`, `nxt-marketdata-rights-inquiry.md`를 사용하고 연락처·계약 경로는 `nxt-provider-contact-routes.md`를 참조하세요. 이 STEP 66 초안은 조사 이력 보존용입니다.

작성일: 2026-11-04 (UTC)  
상태: 초안만 작성. 발송하지 않음.

이 문의는 공개 문서만으로 확정되지 않은 데이터 계약과 권한 조건을 공급자에게 확인하기 위한 것이다. 계정 키, 인증정보, 고객자료는 포함하지 않는다.

## KIS Developers 문의 초안

수신 채널: KIS 공식 제휴·Open API 문의 안내에 공개된 `openapi@koreainvestment.com`. 실제 발송 전에는 담당자가 현재 문의 경로인지 확인한다.  
참고: <https://apiportal.koreainvestment.com/provider-apply>, <https://apiportal.koreainvestment.com/about-open-api>

**제목:** NXT `H0NXCNT0` 및 등락률 순위 API 계약·표시 권한 확인 요청

안녕하세요. 공개 정보 서비스의 개발 준비 단계에서 NXT 데이터 계약을 검토하고 있습니다. 현재 API 인증 호출이나 데이터 게시를 진행하지 않았습니다. 아래 항목의 최신 공식 문서 또는 필드 정의를 안내해 주실 수 있을까요?

1. **NXT WebSocket `H0NXCNT0` 상세 명세**
   - 필요한 이유: KIS 공개 예제에서 47개 output column과 순서는 확인했으나 wire type, unit, nullable 여부, 값 범위는 확인할 수 없습니다.
   - 현재 근거: <https://github.com/koreainvestment/open-trading-api/blob/main/examples_user/domestic_stock/domestic_stock_functions_ws.py>
   - 확인 요청: 최신 스키마 버전/시행일, 각 필드 타입·단위·의미, 빈 값/부호 규칙, 오류·재전송 의미, `BSOP_DATE`와 `STCK_CNTG_HOUR`의 시간대 및 날짜 경계, 서버 timestamp/지연 flag 제공 여부.

2. **기준가격 및 `PRDY_CTRT` 산식**
   - 필요한 이유: NXT PRE·메인·AFTER별 등락률 비교 기준과 KIS 필드의 관계가 검증되지 않았습니다.
   - 확인 요청: 기준가격 필드명, 시장/세션별 기준시점, 분할·권리락 등 조정 반영 여부, 등락률 배율·반올림·부호 규칙. `VI_STND_PRC`가 일반 등락률 기준가가 아니라면 그 범위도 확인 요청.

3. **거래량·거래대금 누적 범위와 단위**
   - 필요한 이유: `CNTG_VOL`, `ACML_VOL`, `ACML_TR_PBMN`의 필드명은 공개 예제에서 보이지만 누적 리셋 범위 및 금액 단위는 미확인입니다.
   - 확인 요청: 주/원 단위, 세션별 또는 일별 누적 여부, PRE에서 MAIN/AFTER로 넘어갈 때의 리셋·합산 조건, 거래대금 산식.

4. **등락률 순위 API의 NXT 적용 범위**
   - 필요한 이유: 공개 설정은 `/uapi/domestic-stock/v1/ranking/fluctuation`, `fid_cond_mrkt_div_code=NX`, 전체 선택 및 조회 수 입력을 문서화하지만 PRE·AFTER 전용 조건과 전체 결과 보장은 확인되지 않았습니다.
   - 현재 근거: <https://github.com/koreainvestment/open-trading-api/blob/main/MCP/Kis%20Trading%20MCP/configs/domestic_stock.json>
   - 확인 요청: PRE·AFTER/정규장 범위 지정 방법, ranking 대상 universe, 반환 최대 건수, `fid_input_cnt_1=0`의 의미, 다음 페이지/`tr_cont`의 종료 조건, 응답 필드와 기준가격 산식, 실시간/지연 여부, 호출 제한과 계정별 권한.
   - 추가 확인: 공개 설정에는 정렬 코드 예시 `0000`, 샘플 호출에는 `0`이 있어 최신 API 계약 기준을 확인 요청.

5. **종목정보 마스터 파일**
   - 필요한 이유: KIS 포털에는 KOSPI(NXT)·KOSDAQ(NXT) `.mst` 다운로드 범주가 있으나, 파일 원본·갱신일·대상 범위와 세션 자격을 검증하지 못했습니다.
   - 현재 근거: <https://apiportal.koreainvestment.com/apiservice-category>
   - 확인 요청: 공식 파일의 배포 URL, 기준일·갱신 주기, 전체 종목 여부, NXT 대상인지 단순 KIS 종목 마스터인지, PRE/AFTER 가능 여부가 포함되는지, 변경 이력 및 이용 조건.

6. **개인용 사용과 공개 서비스 표시·재배포 권한**
   - 필요한 이유: KIS 공개 정책은 개인 사용 목적을 계좌 보유자의 본인 자산 투자로 제한하고 제3자 제공을 허용하지 않는다고 안내합니다. 개인 API 접근과 EDGE NXT 웹 공개는 별개의 권한입니다.
   - 현재 근거: <https://apiportal.koreainvestment.com/about-open-api>, <https://apiportal.koreainvestment.com/provider-apply>
   - 확인 요청: 개인 계정이 본인이 운영하는 비공개 앱에 표시할 수 있는 범위, 다중 사용자/웹 공개/제3자 제공/실시간 및 지연 시세 재배포에 필요한 계약 종류, NXT 시세에 적용되는 거래소·코스콤 계약 주체와 절차, 출처 표시·보관 제한.

## NXT 문의 초안

수신 채널: 공식 Contact Us 페이지 <https://nextrade.co.kr/html/contact-us.html>. 실제 발송하지 않음.

**제목:** 2026년 4분기 매매체결대상종목 원본·세션별 자격 및 거래일 자료 문의

안녕하세요. NXT 종목별 시세를 개발 환경에서 검토하기 위해 공개 자료의 범위를 확인하고 있습니다. 실제 API 호출, 시세 공개 또는 거래대상 확정은 수행하지 않았습니다.

1. **현재 전체 매매체결대상종목 원본**
   - 필요한 이유: 2026-09-21 4분기 공지는 606종목 유지 예정이라는 집계만 제시하고 첨부파일은 0개입니다. 2026-09-29 및 2026-10-21 공지는 일부 임시 제외 변경만 안내합니다.
   - 현재 근거: <https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=43&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=>, <https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=44&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=>, <https://nextrade.co.kr/menu/notice/view.do?pageIndex=1&scNttNo=45&scBbsKndCode=notice&scNttCl=general&scTopViewYn=&searchKeyword=>
   - 요청: 2026-11-04 기준 최신 전체 코드 파일/공식 다운로드 URL, 기준일, 전체성 선언, 파일 형식·버전·변경 이력, 포함·제외 상태 및 정정 방법.

2. **종목별 PRE·AFTER 거래 자격**
   - 필요한 이유: 개별 종목이 정규시장 대상인지와 특정 PRE/AFTER 세션에서 실제 거래 가능한지는 별도 검증이 필요합니다.
   - 요청: 각 종목의 PRE, main, AFTER 가능 여부 및 거래중단·한도조정 상태가 담긴 공식 필드/배포 방식, 변경이 즉시 반영되는지.

3. **거래대상 변경 이력의 완전성**
   - 필요한 이유: 거래현황의 변경 내역은 설명상 최대 3개월이고 전거래일 대비 변동 목록입니다. 이를 기준 목록으로 오인할 수 없습니다.
   - 현재 근거: <https://nextrade.co.kr/menu/transactionStatusConclusion/menuList.do>
   - 요청: 정기·수시 조정의 전체 이력 보존 기간, 최초 기준목록, 삭제/복구 상태, 파일/API 제공 여부.

4. **휴장일과 세션 예외**
   - 필요한 이유: NXT 일반 규칙은 평일·휴장일과 연초/수능일 등의 시간 변경을 설명하지만 날짜별 완전 달력은 별도로 필요합니다.
   - 현재 근거: <https://nextrade.co.kr/en/transactionSys/content.do>
   - 요청: 공식 연간 거래일 캘린더 및 임시휴장 공지 피드, 연초·수능일·장애·종목별 예외의 기계 판독 가능한 형식.

5. **시장 공개 데이터와 지연 표기**
   - 필요한 이유: 홈페이지 집계 통계와 개별 종목정보의 지연 표시가 있고, 이는 KIS API 제공 조건과 동일하다고 볼 수 없습니다.
   - 현재 근거: <https://nextrade.co.kr/main.do>
   - 요청: 공개 데이터 제공 수준, 지연 시간·정의, 앱/웹 재표시·저장·재배포 조건 및 출처표시 요건.

## 발송 전 확인

- 초안은 발송하지 않았다.
- 수신처·범위 및 서비스 설명을 사용자 또는 프로젝트 담당자가 최종 확인한 뒤 별도 승인으로 발송 여부를 결정한다.
- 실제 발송 전 민감정보, 계정정보, 비공개 사업정보를 넣지 않는다.
