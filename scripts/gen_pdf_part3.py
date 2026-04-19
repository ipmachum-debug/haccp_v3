#!/usr/bin/env python3
"""Millio AI 통합 가이드 PDF 생성 - Part 3: 사용자 매뉴얼 섹션"""

import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from gen_pdf_part1 import HaccpPDF


def write_manual_sections(pdf):
    """파트 B: 사용자 매뉴얼 (기능별 사용 가이드)"""

    # ─── 6. 시작하기 ───
    pdf.section_title("6", "시작하기 (Getting Started)")

    pdf.sub_title("6.1 회원가입 및 로그인")
    pdf.numbered_item(1, "millioai.com에 접속합니다.")
    pdf.numbered_item(2, "'회원가입' 버튼을 클릭합니다.")
    pdf.numbered_item(3, "회사명, 사업자번호, 이름, 이메일, 비밀번호(8자 이상)를 입력합니다.")
    pdf.numbered_item(4, "가입 신청 후, 관리자 승인을 기다립니다.")
    pdf.numbered_item(5, "승인 완료 알림을 받으면 로그인할 수 있습니다.")
    pdf.info_box(
        "비밀번호 정책",
        "8자 이상, 영문+숫자 조합 필수. 보안을 위해 주기적 변경을 권장합니다."
    )

    pdf.sub_title("6.2 화면 구성")
    pdf.body_text(
        "로그인 후 화면은 크게 3개 영역으로 구성됩니다:"
    )
    pdf.numbered_item(1, "상단 헤더: 로고, 알림, 사용자 메뉴, AI 챗봇 버튼")
    pdf.numbered_item(2, "왼쪽 사이드바: 3개 탭(WORK / 회계 / HACCP) 메뉴 네비게이션")
    pdf.numbered_item(3, "메인 콘텐츠: 선택한 메뉴의 상세 화면")

    pdf.sub_title("6.3 역할별 메뉴 접근")
    pdf.simple_table(
        ["역할", "접근 가능 메뉴", "주요 업무"],
        [
            ["관리자(admin)", "전체 메뉴", "시스템 설정, 사용자 관리, 전체 운영"],
            ["회계담당(accountant)", "회계탭 전체, 재고(조회)", "매입/매출, 비용, 재무보고서"],
            ["검사원(inspector)", "검사, 체크리스트, CCP", "일일 점검, 검사 기록, CCP 모니터링"],
            ["모니터(monitor)", "대시보드, 알림, 승인", "현황 모니터링, 문서 승인"],
            ["작업자(worker)", "생산, 기본재고, 체크리스트", "생산 작업, 체크리스트 작성"],
        ],
        [35, 55, 80],
    )

    # ─── 7. HACCP 관리 사용법 ───
    pdf.section_title("7", "HACCP 관리 사용법")

    pdf.sub_title("7.1 HACCP 체크리스트 작성")
    pdf.body_text("사이드바 HACCP탭 > 'HACCP 체크리스트' 메뉴를 선택합니다.")
    pdf.numbered_item(1, "오늘 날짜의 체크리스트 목록이 표시됩니다.")
    pdf.numbered_item(2, "작성할 체크리스트(예: 개인위생점검)를 클릭합니다.")
    pdf.numbered_item(3, "각 점검 항목에 대해 적합/부적합을 선택합니다.")
    pdf.numbered_item(4, "부적합 발견 시 '시정조치' 내용을 기록합니다.")
    pdf.numbered_item(5, "사진 첨부가 필요한 경우 카메라 아이콘을 클릭합니다.")
    pdf.numbered_item(6, "'저장' 버튼을 눌러 완료합니다.")
    pdf.numbered_item(7, "관리자 승인이 필요한 경우, 승인 요청이 자동 전송됩니다.")

    pdf.info_box(
        "체크리스트 종류 (20종+)",
        "수질검사, 에어컴프레서, 개인위생점검, 용수사용점검, 설비세정기록, "
        "이물질기록, 냉동점검, 포장보관기록, 온습도점검, 위생기록, "
        "표면오염검사, 시설위생점검, 차량온도점검, 설비점검, 중량품질점검, "
        "제품시험보고, 완제품검수, 공급업체검사, 일일폐기물기록, 폐기물관리 등"
    )

    pdf.sub_title("7.2 CCP 모니터링")
    pdf.body_text("HACCP탭 > 'CCP 관리' 메뉴를 선택합니다.")
    pdf.numbered_item(1, "CCP 포인트별 현재 상태(정상/주의/이탈)가 카드로 표시됩니다.")
    pdf.numbered_item(2, "각 CCP 카드를 클릭하면 상세 이력과 추이 그래프를 확인합니다.")
    pdf.numbered_item(3, "관리한계(CL) 이탈 시 실시간 알림이 발생합니다.")
    pdf.numbered_item(4, "이탈 발생 시 시정조치를 기록하고 관리자에게 보고합니다.")

    pdf.sub_title("7.3 검사 관리")
    pdf.body_text("HACCP탭 > '검사 관리' 메뉴를 선택합니다.")
    pdf.bullet("원재료 검사: 입고 시 품질 기준 확인, 합격/불합격 판정, 공급업체 평가")
    pdf.bullet("위생 검사: 시설 위생, 설비 청결, 작업자 위생 점검")
    pdf.bullet("출하 검사: 최종 제품 관능검사, 중량/수량 확인, 포장 상태 점검")
    pdf.bullet("통계: 불량률 추이, 공급업체별 합격률, 검사 항목별 분석")

    pdf.sub_title("7.4 감사 관리")
    pdf.body_text("내부감사, 공급업체감사 일정을 관리하고 결과를 기록합니다.")
    pdf.bullet("감사 계획: 연간 감사 일정 수립, 감사원 배정")
    pdf.bullet("감사 실행: 체크리스트 기반 감사 수행, 부적합 사항 기록")
    pdf.bullet("CAPA: 시정/예방 조치 등록, 이행 추적, 효과성 검증")

    # ─── 8. 생산관리 사용법 ───
    pdf.section_title("8", "생산관리 사용법")

    pdf.sub_title("8.1 배치 생성")
    pdf.body_text("HACCP탭 > '생산관리' > '배치' 탭을 선택합니다.")
    pdf.numbered_item(1, "'새 배치 생성' 버튼을 클릭합니다.")
    pdf.numbered_item(2, "생산할 제품을 선택합니다.")
    pdf.numbered_item(3, "계획 수량, 생산 예정일을 입력합니다.")
    pdf.numbered_item(4, "레시피(배합비)가 자동으로 불러와집니다.")
    pdf.numbered_item(5, "'생성' 버튼을 눌러 배치를 등록합니다.")

    pdf.sub_title("8.2 원재료 투입")
    pdf.numbered_item(1, "배치 상세 화면에서 '원재료 투입' 버튼을 클릭합니다.")
    pdf.numbered_item(2, "투입할 원재료와 수량을 입력합니다.")
    pdf.numbered_item(3, "FEFO(선입선출) 기준으로 LOT가 자동 배정됩니다.")
    pdf.numbered_item(4, "'확정' 시 재고에서 자동 차감되고 회계 분개가 생성됩니다.")
    pdf.info_box(
        "FEFO 자동 할당",
        "소비기한이 가장 빠른 LOT부터 자동으로 배정합니다. "
        "수동으로 LOT를 선택할 수도 있습니다."
    )

    pdf.sub_title("8.3 생산 완료 및 원가분석")
    pdf.numbered_item(1, "생산이 완료되면 배치 상태를 '완료'로 변경합니다.")
    pdf.numbered_item(2, "실제 생산량을 입력합니다.")
    pdf.numbered_item(3, "시스템이 자동으로 수율(실제/계획)을 계산합니다.")
    pdf.numbered_item(4, "원가분석 탭에서 재료비+노무비+경비 = 단위원가를 확인합니다.")
    pdf.numbered_item(5, "완제품 LOT가 자동 생성되어 제품 재고에 반영됩니다.")

    pdf.sub_title("8.4 파이프라인 뷰")
    pdf.body_text(
        "'파이프라인' 탭에서 모든 배치의 진행 상태를 한눈에 볼 수 있습니다. "
        "9단계(계획 > 원료준비 > 배합 > 가공 > 포장 > 검사 > 출하대기 > 출하 > 완료) "
        "칸반 보드 형태로 표시됩니다."
    )

    # ─── 9. 재고관리 사용법 ───
    pdf.section_title("9", "재고관리 사용법")

    pdf.sub_title("9.1 재고 현황 조회")
    pdf.body_text("HACCP탭 > '재고 관리' 메뉴를 선택합니다.")
    pdf.numbered_item(1, "상단 탭에서 '원재료' 또는 '제품'을 선택합니다.")
    pdf.numbered_item(2, "'현황' 탭에서 전체 재고 목록을 확인합니다.")
    pdf.numbered_item(3, "안전재고 이하 품목은 빨간색으로 표시됩니다.")
    pdf.numbered_item(4, "품목 클릭 시 LOT별 상세 재고와 소비기한을 확인합니다.")

    pdf.sub_title("9.2 입고 처리")
    pdf.numbered_item(1, "'입고' 탭을 선택합니다.")
    pdf.numbered_item(2, "'신규 입고' 버튼을 클릭합니다.")
    pdf.numbered_item(3, "원재료, 수량, 단가, 공급업체, 소비기한을 입력합니다.")
    pdf.numbered_item(4, "LOT 번호가 자동 생성됩니다 (수동 입력도 가능).")
    pdf.numbered_item(5, "'저장' 시 재고에 반영되고 수불부에 기록됩니다.")

    pdf.sub_title("9.3 출고/소모 처리")
    pdf.numbered_item(1, "'소모/출고' 탭을 선택합니다.")
    pdf.numbered_item(2, "출고 사유(생산투입/폐기/조정 등)를 선택합니다.")
    pdf.numbered_item(3, "품목과 수량을 입력하면 FEFO로 LOT가 자동 배정됩니다.")
    pdf.numbered_item(4, "'확정' 시 재고 차감 + 수불부 기록이 완료됩니다.")

    pdf.sub_title("9.4 재고 추이/회전율/예측")
    pdf.bullet("추이: 일/주/월별 입출고 추이를 그래프로 확인합니다.")
    pdf.bullet("회전율: 품목별 재고 회전율, 평균 보유일수, ABC 등급을 분석합니다.")
    pdf.bullet("예측: AI가 과거 데이터를 기반으로 수요를 예측하고 발주 시점을 추천합니다.")

    # ─── 10. 회계 사용법 ───
    pdf.section_title("10", "회계 관리 사용법")

    pdf.sub_title("10.1 매입 등록")
    pdf.body_text("회계탭 > '매입 등록' 메뉴를 선택합니다.")
    pdf.numbered_item(1, "공급업체를 선택합니다.")
    pdf.numbered_item(2, "매입 품목, 수량, 단가를 입력합니다.")
    pdf.numbered_item(3, "부가세 포함 여부를 설정합니다.")
    pdf.numbered_item(4, "'임시저장(DRAFT)' 또는 '확정(POST)'을 선택합니다.")
    pdf.numbered_item(5, "확정 시 자동으로: 재고 입고 + 회계 분개(차변: 원재료, 대변: 외상매입금)가 생성됩니다.")

    pdf.sub_title("10.2 매출 등록")
    pdf.body_text("회계탭 > '매출 등록' 메뉴를 선택합니다.")
    pdf.numbered_item(1, "고객사를 선택합니다.")
    pdf.numbered_item(2, "판매 제품, 수량, 단가를 입력합니다.")
    pdf.numbered_item(3, "확정(POST) 시 자동으로:")
    pdf.bullet("매출 인식: 차변 외상매출금, 대변 매출")
    pdf.bullet("원가 인식: 차변 매출원가, 대변 제품재고")
    pdf.bullet("FEFO 기준 LOT 자동 차감")

    pdf.sub_title("10.3 비용 관리")
    pdf.body_text("회계탭 > '비용관리' 메뉴를 선택합니다.")
    pdf.bullet("비용전표 작성: 계정과목 선택, 금액, 결제수단, 적요 입력")
    pdf.bullet("반복 템플릿: 매월 반복되는 비용(임대료 등)을 템플릿으로 관리")
    pdf.bullet("미지급금: 결제 예정인 비용 관리 및 추적")

    pdf.sub_title("10.4 은행 관리")
    pdf.numbered_item(1, "회계탭 > '은행 관리' 메뉴를 선택합니다.")
    pdf.numbered_item(2, "은행 거래내역을 엑셀로 업로드합니다.")
    pdf.numbered_item(3, "자동매칭 엔진이 거래를 분류합니다 (키워드/금액/패턴/복합 매칭).")
    pdf.numbered_item(4, "매칭된 거래는 자동으로 분개가 생성됩니다.")
    pdf.numbered_item(5, "미매칭 거래는 수동으로 계정을 지정합니다.")

    pdf.sub_title("10.5 재무보고서")
    pdf.body_text("회계탭 > '재무보고서' 메뉴를 선택합니다.")
    pdf.bullet("시산표: 전체 계정과목별 차변/대변 합계 및 잔액")
    pdf.bullet("재무상태표: 자산 = 부채 + 자본, 대차 균형 자동검증")
    pdf.bullet("손익계산서: 수익 - 비용 = 당기순이익")
    pdf.bullet("기초잔액: 전기이월 설정 (회계연도별 차변/대변 입력)")
    pdf.bullet("내보내기: Excel 다운로드 또는 PDF 출력 가능")

    pdf.sub_title("10.6 마감 관리")
    pdf.bullet("일마감: 당일 거래 확인, 일일 집계 확정")
    pdf.bullet("월마감: 월별 재무제표 확정, 기간 잠금 (수정 방지)")

    # ─── 11. AI 사용법 ───
    pdf.section_title("11", "AI 기능 사용법")

    pdf.sub_title("11.1 AI 관제센터")
    pdf.body_text("WORK탭 > 'AI 어시스턴트' 메뉴를 선택합니다.")
    pdf.bullet("HACCP AI 탭: 이상탐지, 예측분석, 시정조치 추천, 공급업체 리스크")
    pdf.bullet("ERP AI 탭: 비용 이상탐지, 현금흐름 예측, AP/AR 리스크")
    pdf.bullet("관리 탭: 규칙 설정, 기준서 관리, 지식베이스")

    pdf.sub_title("11.2 AI 챗봇 '하나' 사용법")
    pdf.numbered_item(1, "화면 우하단의 챗봇 아이콘을 클릭합니다.")
    pdf.numbered_item(2, "질문을 자연어로 입력합니다.")
    pdf.numbered_item(3, "예시 질문:")
    pdf.bullet("'이번 달 매출은 얼마야?'")
    pdf.bullet("'재고 부족한 원재료 알려줘'")
    pdf.bullet("'오늘 체크리스트 미완료 항목은?'")
    pdf.bullet("'HACCP 7원칙이 뭐야?'")
    pdf.numbered_item(4, "AI가 시스템 데이터를 조회하거나 지식베이스를 참고하여 답변합니다.")

    pdf.sub_title("11.3 규칙엔진 커스터마이징")
    pdf.numbered_item(1, "AI 관제센터 > '관리' > '알림 관리' 탭을 선택합니다.")
    pdf.numbered_item(2, "시스템 규칙(22개)의 활성화/비활성화를 설정합니다.")
    pdf.numbered_item(3, "'커스텀 규칙 추가' 버튼으로 자사 맞춤 규칙을 생성합니다.")
    pdf.numbered_item(4, "조건(임계값, 빈도 등)과 액션(알림, 보고서 등)을 설정합니다.")

    pdf.sub_title("11.4 지식베이스 관리")
    pdf.numbered_item(1, "AI 관제센터 > '관리' > '지식베이스' 탭을 선택합니다.")
    pdf.numbered_item(2, "HACCP 기준서, 법규, 사내 매뉴얼 등 문서를 업로드합니다.")
    pdf.numbered_item(3, "시스템이 자동으로 문서를 분할하고 벡터 임베딩을 생성합니다.")
    pdf.numbered_item(4, "이후 AI 챗봇이 해당 문서를 참고하여 답변합니다.")

    # ─── 12. 시스템 관리 ───
    pdf.section_title("12", "시스템 관리")

    pdf.sub_title("12.1 사용자 관리")
    pdf.bullet("사용자 승인: 회원가입 요청 승인/거절")
    pdf.bullet("역할 변경: 사용자별 역할(admin/accountant/inspector 등) 지정")
    pdf.bullet("비밀번호 초기화: 관리자가 사용자 비밀번호 재설정")

    pdf.sub_title("12.2 마스터 데이터 관리")
    pdf.bullet("품목 마스터: 원재료/제품 등록, BOM(배합비) 설정")
    pdf.bullet("거래처: 공급업체/고객사 정보 관리")
    pdf.bullet("계정과목: 회계 계정 구조 설정 (5대 분류)")
    pdf.bullet("카테고리: 원재료/제품/매입/매출 분류 체계")

    pdf.sub_title("12.3 엑셀 데이터 가져오기")
    pdf.body_text(
        "WORK탭 > '엑셀 데이터 임포트' 메뉴에서 대량 데이터를 일괄 등록할 수 있습니다. "
        "원재료, 제품, 거래처, 레시피 등의 템플릿을 다운로드하여 작성 후 업로드합니다."
    )

    # ─── 13. FAQ ───
    pdf.section_title("13", "자주 묻는 질문 (FAQ)")

    faqs = [
        ("Q1. Millio AI은 어떤 업종에 적합한가요?",
         "식품 제조업체(가공식품, 건강기능식품, 음료 등)를 위해 설계되었습니다. "
         "HACCP 인증이 필요한 모든 식품 제조 사업장에서 사용 가능합니다."),
        ("Q2. 기존 데이터를 옮길 수 있나요?",
         "네, 엑셀 임포트 기능으로 원재료, 제품, 거래처, 초기 재고 등을 "
         "일괄 등록할 수 있습니다. 마이그레이션 지원도 제공합니다."),
        ("Q3. 인터넷이 안 되면 사용할 수 없나요?",
         "클라우드 SaaS이므로 인터넷 연결이 필요합니다. "
         "단, 모바일 빠른 점검은 오프라인 임시저장을 지원합니다."),
        ("Q4. 데이터 보안은 어떻게 되나요?",
         "SSL 암호화 통신, JWT 인증, 멀티테넌트 Row-level 격리, "
         "IP당 Rate Limiting, CORS 도메인 제한 등 다중 보안 체계를 적용합니다."),
        ("Q5. HACCP 감사 시 어떤 자료를 출력할 수 있나요?",
         "체크리스트, CCP 모니터링 기록, 검사 보고서, 시정조치 기록, "
         "일일일지, 품목제조보고서 등을 PDF로 출력할 수 있습니다."),
        ("Q6. 여러 공장을 하나의 계정으로 관리할 수 있나요?",
         "네, 멀티테넌트 구조로 여러 사업장을 하나의 계정에서 전환하며 관리할 수 있습니다. "
         "슈퍼관리자 대시보드에서 테넌트를 추가/관리합니다."),
        ("Q7. 회계사/세무사와 어떻게 협업하나요?",
         "재무보고서(시산표, 재무상태표, 손익계산서)를 Excel/PDF로 내보내 공유하거나, "
         "회계 담당자 역할로 직접 시스템에 접속하도록 설정할 수 있습니다."),
        ("Q8. AI 기능 사용에 추가 비용이 있나요?",
         "Professional 이상 요금제에 AI 관제, 챗봇, 지식베이스가 포함됩니다. "
         "별도 AI 서비스 구독은 필요 없습니다."),
        ("Q9. 커스터마이징이 가능한가요?",
         "Enterprise 요금제에서 커스텀 체크리스트, AI 규칙, 보고서 양식, "
         "ERP 연동(GOGOGOPICK 등) 맞춤 개발을 지원합니다."),
        ("Q10. 도입 절차는 어떻게 되나요?",
         "문의 > 데모 시연 > 30일 무료 체험 > 요금제 선택 > 데이터 마이그레이션 > "
         "교육 > 정식 운영. 전 과정 기술지원을 제공합니다."),
    ]

    for q, a in faqs:
        pdf.sub_sub_title(q)
        pdf.body_text(a)

    return pdf


print("Part 3 loaded: write_manual_sections defined")
