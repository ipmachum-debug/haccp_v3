#!/usr/bin/env python3
"""우선순위 보통 - 4개 화면 목업 생성"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from mockup_utils import *


def create_purchase_form():
    """7. 매입 등록 화면"""
    img, draw = new_canvas()
    sw = draw_sidebar(draw, "회계", [
        "대시보드", "매입 등록", "매입 조회",
        "매출 등록", "매출 조회", "비용관리",
        "은행 관리", "거래처 조회", "마감 관리",
        "재무보고서", "계정과목 관리",
    ], "매입 등록")
    ht = draw_header(draw, sw, "매입 등록")

    cx, cy = sw + 15, ht + 12

    # 상단 버튼
    draw_button(draw, cx, cy, "임시저장", "#64748B", 90)
    draw_button(draw, cx + 100, cy, "확정(POST)", GREEN, 110)
    draw_button(draw, W - 120, cy, "목록으로", "#64748B", 90)

    cy += 48

    # 기본 정보 카드
    draw_card(draw, [cx, cy, W - 15, cy + 160], "기본 정보")

    # 폼 필드 2열
    fw = (W - sw - 80) // 2
    fy = cy + 48
    draw_input(draw, cx + 15, fy, fw, label="거래처 *", placeholder="공급업체 선택...")
    draw_input(draw, cx + fw + 35, fy, fw, label="매입일자 *", placeholder="2026-04-02")
    fy += 55
    draw_input(draw, cx + 15, fy, fw, label="전표번호", placeholder="PUR-2026-0042 (자동)")
    draw_input(draw, cx + fw + 35, fy, fw, label="결제수단", placeholder="외상 (외상매입금)")

    cy += 175

    # 품목 테이블 카드
    draw_card(draw, [cx, cy, W - 15, cy + 250], "매입 품목")
    draw_button(draw, W - 150, cy + 8, "+ 품목 추가", BLUE, 110, 28)

    ty = cy + 45
    tw = W - sw - 50
    headers = ["No", "품목코드", "품목명", "수량", "단위", "단가", "공급가액", "세액", "합계"]
    col_ws = [30, 70, 120, 60, 50, 80, 90, 80, 90]
    remain = tw - sum(col_ws)
    col_ws[2] += remain

    rows = [
        ["1", "RM-001", "설탕 (백설탕)", "100", "kg", "2,500", "250,000", "25,000", "275,000"],
        ["2", "RM-002", "밀가루 (중력분)", "50", "kg", "1,800", "90,000", "9,000", "99,000"],
        ["3", "RM-006", "간장 원액", "30", "L", "5,000", "150,000", "15,000", "165,000"],
    ]
    draw_table(draw, cx + 10, ty, headers, rows, col_ws, 28)

    # 합계
    sy = ty + 28 * 4 + 10
    draw.text((W - 350, sy), "공급가액:", fill=TEXT_GRAY, font=FONT_MD)
    draw.text((W - 230, sy), "₩490,000", fill=TEXT_DARK, font=FONT_MD)
    draw.text((W - 350, sy + 25), "부가세:", fill=TEXT_GRAY, font=FONT_MD)
    draw.text((W - 230, sy + 25), "₩49,000", fill=TEXT_DARK, font=FONT_MD)
    draw.rectangle([(W - 350, sy + 50), (W - 100, sy + 51)], fill=CARD_BORDER)
    draw.text((W - 350, sy + 58), "합계:", fill=TEXT_DARK, font=FONT_LG)
    draw.text((W - 230, sy + 58), "₩539,000", fill=BLUE, font=FONT_LG)

    # 하단 안내
    draw_rounded_rect(draw, [cx, H - 50, W - 15, H - 15], fill=LIGHT_BLUE, radius=6)
    draw.text((cx + 15, H - 42), "💡 확정(POST) 시 자동으로: 재고 입고 + 회계 분개(차변: 원재료, 대변: 외상매입금)가 생성됩니다.", fill=BLUE, font=FONT_SM)

    save(img, "07_purchase_form")


def create_ai_chatbot():
    """8. AI 챗봇 '하나'"""
    img, draw = new_canvas()
    sw = draw_sidebar(draw, "WORK", [
        "통합 대시보드", "Today", "AI 어시스턴트", "엑셀 임포트"
    ], "통합 대시보드")
    ht = draw_header(draw, sw, "통합 대시보드")

    # 메인 콘텐츠 (흐리게 - 대시보드 배경)
    draw.rectangle([sw, ht, W, H], fill="#F1F5F9")
    draw.text((sw + 40, ht + 30), "통합 대시보드 (배경)", fill="#CBD5E1", font=FONT_XL)

    # 챗봇 패널 (우측 오버레이)
    chat_x = W - 400
    chat_y = 60
    chat_w = 380
    chat_h = H - 80

    # 그림자 효과
    draw_rounded_rect(draw, [chat_x + 3, chat_y + 3, chat_x + chat_w + 3, chat_y + chat_h + 3], fill="#94A3B8", radius=12)
    draw_rounded_rect(draw, [chat_x, chat_y, chat_x + chat_w, chat_y + chat_h], fill="#FFFFFF", radius=12)

    # 챗봇 헤더
    draw_rounded_rect(draw, [chat_x, chat_y, chat_x + chat_w, chat_y + 50], fill=NAVY, radius=0)
    # 상단 모서리만 둥글게
    draw_rounded_rect(draw, [chat_x, chat_y, chat_x + chat_w, chat_y + 50], fill=NAVY, radius=12)
    draw.rectangle([chat_x, chat_y + 30, chat_x + chat_w, chat_y + 50], fill=NAVY)
    draw.text((chat_x + 15, chat_y + 13), "🤖 AI 어시스턴트 '하나'", fill="#FFFFFF", font=FONT_MD)
    draw.text((chat_x + chat_w - 30, chat_y + 13), "✕", fill="#94A3B8", font=FONT_MD)

    # 빠른 질문 카테고리
    qy = chat_y + 60
    draw.text((chat_x + 15, qy), "빠른 질문:", fill=TEXT_GRAY, font=FONT_SM)
    qy += 22
    quick_qs = ["시작하기", "생산관리", "재고관리", "HACCP", "회계"]
    qx = chat_x + 15
    for q in quick_qs:
        qw = len(q) * 13 + 16
        draw_rounded_rect(draw, [qx, qy, qx + qw, qy + 26], fill=LIGHT_BLUE, radius=12)
        draw.text((qx + 8, qy + 5), q, fill=BLUE, font=FONT_SM)
        qx += qw + 6

    # 대화 내용
    cy = qy + 40

    # 사용자 메시지
    msg_w = 250
    draw_rounded_rect(draw, [chat_x + chat_w - msg_w - 20, cy, chat_x + chat_w - 20, cy + 35], fill=BLUE, radius=10)
    draw.text((chat_x + chat_w - msg_w - 8, cy + 8), "이번 달 매출은 얼마야?", fill="#FFFFFF", font=FONT_SM)
    cy += 50

    # AI 응답
    draw_rounded_rect(draw, [chat_x + 15, cy, chat_x + chat_w - 40, cy + 120], fill="#F1F5F9", radius=10)
    draw.text((chat_x + 25, cy + 8), "🤖 하나:", fill=BLUE, font=FONT_SM)
    ai_lines = [
        "이번 달(2026년 4월) 매출 현황입니다:",
        "",
        "총 매출: ₩12,500,000",
        "매출건수: 28건",
        "전월 대비: +15.2% 증가 📈",
        "",
        "상위 제품: 간장소스(₩4.2M), 고추장(₩3.1M)",
    ]
    ly = cy + 28
    for line in ai_lines:
        draw.text((chat_x + 25, ly), line, fill=TEXT_DARK, font=FONT_SM)
        ly += 16
    cy += 135

    # 사용자 메시지 2
    draw_rounded_rect(draw, [chat_x + chat_w - 300, cy, chat_x + chat_w - 20, cy + 35], fill=BLUE, radius=10)
    draw.text((chat_x + chat_w - 288, cy + 8), "재고 부족한 원재료 알려줘", fill="#FFFFFF", font=FONT_SM)
    cy += 50

    # AI 응답 2
    draw_rounded_rect(draw, [chat_x + 15, cy, chat_x + chat_w - 40, cy + 100], fill="#F1F5F9", radius=10)
    draw.text((chat_x + 25, cy + 8), "🤖 하나:", fill=BLUE, font=FONT_SM)
    ai_lines2 = [
        "안전재고 이하 원재료 3건입니다:",
        "",
        "⚠️ 설탕: 15kg (안전재고 50kg)",
        "⚠️ 포장지: 100매 (안전재고 500매)",
        "⚠️ 참깨: 10kg (안전재고 15kg)",
    ]
    ly = cy + 28
    for line in ai_lines2:
        draw.text((chat_x + 25, ly), line, fill=TEXT_DARK, font=FONT_SM)
        ly += 16

    # 입력 필드
    iy = chat_y + chat_h - 55
    draw_rounded_rect(draw, [chat_x + 10, iy, chat_x + chat_w - 55, iy + 38], fill="#F8FAFC", outline=CARD_BORDER, radius=8)
    draw.text((chat_x + 20, iy + 10), "질문을 입력하세요...", fill=TEXT_LIGHT, font=FONT_SM)
    draw_rounded_rect(draw, [chat_x + chat_w - 48, iy, chat_x + chat_w - 10, iy + 38], fill=BLUE, radius=8)
    draw.text((chat_x + chat_w - 40, iy + 10), "▶", fill="#FFFFFF", font=FONT_MD)

    save(img, "08_ai_chatbot")


def create_ai_dashboard():
    """9. AI 관제센터"""
    img, draw = new_canvas()
    sw = draw_sidebar(draw, "WORK", [
        "통합 대시보드", "Today", "AI 어시스턴트", "엑셀 임포트"
    ], "AI 어시스턴트")
    ht = draw_header(draw, sw, "AI 관제센터")

    cx, cy = sw + 15, ht + 12

    # 메인 탭: HACCP AI / ERP AI / 관리
    tabs = [("HACCP AI", True), ("ERP AI", False), ("관리", False)]
    tx = cx
    for t, active in tabs:
        tw = len(t) * 14 + 30
        if active:
            draw_rounded_rect(draw, [tx, cy, tx + tw, cy + 34], fill=BLUE, radius=6)
            draw.text((tx + 12, cy + 8), t, fill="#FFFFFF", font=FONT_MD)
        else:
            draw_rounded_rect(draw, [tx, cy, tx + tw, cy + 34], fill="#F1F5F9", outline=CARD_BORDER, radius=6)
            draw.text((tx + 12, cy + 8), t, fill=TEXT_GRAY, font=FONT_MD)
        tx += tw + 8

    cy += 48

    # 서브탭
    sub_tabs = ["대시보드", "이상탐지", "예측분석", "시정조치", "공급업체 리스크", "교육 추천", "감사 AI"]
    stx = cx
    for st in sub_tabs:
        stw = len(st) * 13 + 16
        if st == "이상탐지":
            draw.text((stx, cy), st, fill=BLUE, font=FONT_SM)
            draw.rectangle([stx, cy + 18, stx + stw, cy + 20], fill=BLUE)
        else:
            draw.text((stx, cy), st, fill=TEXT_GRAY, font=FONT_SM)
        stx += stw + 10

    cy += 32

    # 이상탐지 카드들
    cw = (W - sw - 60) // 3

    # 카드 1: CCP 이상
    draw_card(draw, [cx, cy, cx + cw, cy + 220], "CCP 이상 감지")
    draw_rounded_rect(draw, [cx + 15, cy + 45, cx + cw - 15, cy + 80], fill=LIGHT_RED, radius=6)
    draw.text((cx + 25, cy + 53), "⚠ CCP-5 X-ray: 이물질 감지 (위험)", fill=RED, font=FONT_SM)
    draw_rounded_rect(draw, [cx + 15, cy + 88, cx + cw - 15, cy + 123], fill=LIGHT_YELLOW, radius=6)
    draw.text((cx + 25, cy + 96), "⚡ CCP-3 냉각온도: 12.5°C (주의)", fill=ORANGE, font=FONT_SM)
    draw_rounded_rect(draw, [cx + 15, cy + 131, cx + cw - 15, cy + 166], fill=LIGHT_GREEN, radius=6)
    draw.text((cx + 25, cy + 139), "✅ CCP-1,2,4,6: 정상 범위", fill=GREEN, font=FONT_SM)
    draw.text((cx + 15, cy + 180), "마지막 분석: 5분 전", fill=TEXT_LIGHT, font=FONT_SM)
    draw_button(draw, cx + cw - 100, cy + 192, "상세보기", BLUE, 80, 24)

    # 카드 2: 체크리스트 이상
    rx = cx + cw + 15
    draw_card(draw, [rx, cy, rx + cw, cy + 220], "체크리스트 누락 감지")
    items = [
        ("냉동점검", "미작성 (예정 14:00 초과)", RED),
        ("포장보관기록", "미작성 (예정 14:00)", ORANGE),
        ("표면오염검사", "미작성 (예정 15:00)", ORANGE),
        ("위생기록", "미작성 (예정 16:00)", YELLOW),
    ]
    iy = cy + 48
    for name, desc, color in items:
        draw.text((rx + 15, iy), name, fill=TEXT_DARK, font=FONT_SM)
        draw.text((rx + 15, iy + 16), desc, fill=color, font=FONT_SM)
        iy += 38

    # 카드 3: AI 추천 시정조치
    rx2 = rx + cw + 15
    draw_card(draw, [rx2, cy, rx2 + cw, cy + 220], "AI 추천 시정조치")
    actions = [
        ("1. CCP-5 라인 즉시 중단", "X-ray 이물질 감지 → 해당 배치 격리", RED),
        ("2. CCP-3 냉각기 점검", "냉각온도 초과 → 설비 확인 필요", YELLOW),
        ("3. 체크리스트 독촉 알림", "담당자에게 미작성 알림 발송", BLUE),
    ]
    ay = cy + 48
    for title, desc, color in actions:
        draw_rounded_rect(draw, [rx2 + 10, ay, rx2 + cw - 10, ay + 48], fill="#F8FAFC", outline=CARD_BORDER, radius=6)
        draw.text((rx2 + 20, ay + 5), title, fill=color, font=FONT_SM)
        draw.text((rx2 + 20, ay + 24), desc, fill=TEXT_GRAY, font=FONT_SM)
        ay += 55

    cy += 240

    # 하단: 알림 이력 테이블
    draw_card(draw, [cx, cy, W - 15, cy + 200], "최근 AI 알림 이력")
    ty = cy + 45
    tw = W - sw - 50
    headers2 = ["시간", "유형", "심각도", "내용", "상태"]
    col_ws2 = [120, 100, 80, tw - 420, 120]
    rows2 = [
        ["04-02 14:32", "CCP 이탈", "위험", "CCP-5 X-ray 이물질 감지", "조치 필요"],
        ["04-02 13:15", "체크리스트", "경고", "냉동점검 미작성 (1시간 초과)", "알림 발송"],
        ["04-02 12:00", "CCP 주의", "주의", "CCP-3 냉각온도 12.5°C (한계 10°C)", "모니터링"],
        ["04-02 09:00", "규칙엔진", "정보", "일일 자동 분석 완료 (22개 규칙)", "완료"],
    ]
    draw_table(draw, cx + 10, ty, headers2, rows2, col_ws2, 28)

    save(img, "09_ai_dashboard")


def create_user_management():
    """10. 사용자 관리 화면"""
    img, draw = new_canvas()
    sw = draw_sidebar(draw, "HACCP", [
        "통합 대시보드", "생산관리", "CCP 관리",
        "HACCP 체크리스트", "검사 관리", "재고 관리",
        "사용자 승인", "테넌트 관리", "시스템 관리",
    ], "사용자 승인")
    ht = draw_header(draw, sw, "사용자 관리")

    cx, cy = sw + 15, ht + 12

    # 상단 통계
    cw = (W - sw - 75) // 4
    draw_stat_card(draw, cx, cy, cw, 55, "전체 사용자", "24명", BLUE, LIGHT_BLUE)
    draw_stat_card(draw, cx + cw + 15, cy, cw, 55, "활성", "20명", GREEN, LIGHT_GREEN)
    draw_stat_card(draw, cx + (cw + 15) * 2, cy, cw, 55, "승인 대기", "3명", YELLOW, LIGHT_YELLOW)
    draw_stat_card(draw, cx + (cw + 15) * 3, cy, cw, 55, "비활성", "1명", RED, LIGHT_RED)

    cy += 72

    # 승인 대기 섹션
    draw_card(draw, [cx, cy, W - 15, cy + 140], "승인 대기 (3건)")
    py = cy + 45
    pending = [
        ("김신규", "newuser@food.co.kr", "식품안전팀", "2026-04-01 14:30"),
        ("박지원", "parkjw@food.co.kr", "생산팀", "2026-04-02 09:15"),
        ("이하늘", "sky@food.co.kr", "품질관리팀", "2026-04-02 10:00"),
    ]
    for name, email, dept, date in pending:
        draw.text((cx + 20, py), f"👤 {name}", fill=TEXT_DARK, font=FONT_MD)
        draw.text((cx + 150, py + 2), email, fill=TEXT_GRAY, font=FONT_SM)
        draw.text((cx + 380, py + 2), dept, fill=TEXT_GRAY, font=FONT_SM)
        draw.text((cx + 520, py + 2), date, fill=TEXT_LIGHT, font=FONT_SM)
        draw_button(draw, W - 210, py - 2, "승인", GREEN, 60, 28)
        draw_button(draw, W - 140, py - 2, "거절", RED, 60, 28)
        py += 32

    cy += 155

    # 사용자 목록 테이블
    draw_card(draw, [cx, cy, W - 15, cy + 300], "사용자 목록")

    # 검색 바
    draw_input(draw, cx + 15, cy + 40, 200, placeholder="이름/이메일 검색...")
    draw_button(draw, cx + 230, cy + 40, "검색", BLUE, 60)

    ty = cy + 80
    tw = W - sw - 50
    headers = ["이름", "이메일", "역할", "부서", "상태", "최근 로그인", "관리"]
    col_ws = [80, 150, 80, 80, 70, 110, tw - 570]
    rows = [
        ["관리자", "admin@food.co.kr", "admin", "경영지원", "활성", "04-02 16:30", "수정"],
        ["김철수", "kim@food.co.kr", "inspector", "식품안전팀", "활성", "04-02 15:20", "수정"],
        ["박영희", "park@food.co.kr", "accountant", "회계팀", "활성", "04-02 14:00", "수정"],
        ["이민수", "lee@food.co.kr", "worker", "생산팀", "활성", "04-02 13:45", "수정"],
        ["최동현", "choi@food.co.kr", "worker", "생산팀", "활성", "04-02 12:30", "수정"],
        ["정수진", "jung@food.co.kr", "monitor", "품질관리", "활성", "04-02 11:00", "수정"],
        ["한소연", "han@food.co.kr", "inspector", "식품안전팀", "비활성", "03-28 09:00", "수정"],
    ]
    draw_table(draw, cx + 10, ty, headers, rows, col_ws, 28)

    save(img, "10_user_management")


if __name__ == "__main__":
    print("🎨 우선순위 보통 - 4개 화면 목업 생성 시작")
    create_purchase_form()
    create_ai_chatbot()
    create_ai_dashboard()
    create_user_management()
    print("✅ 4개 완료!")
