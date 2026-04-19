#!/usr/bin/env python3
"""우선순위 높음 - 6개 화면 목업 생성"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from mockup_utils import *


def create_login_screen():
    """1. 로그인/회원가입 화면"""
    img, draw = new_canvas()

    # 배경 - 좌측 브랜딩, 우측 폼
    draw.rectangle([0, 0, 500, H], fill=NAVY)

    # 좌측 브랜딩
    draw.text((80, 200), "Millio AI", fill="#FFFFFF", font=FONT_TITLE)
    draw.text((80, 250), "HACCP + ERP + AI", fill=SIDEBAR_TEXT, font=FONT_XL)
    draw.text((80, 290), "식품안전 통합 관리 플랫폼", fill=SIDEBAR_TEXT, font=FONT_LG)

    # 특징 아이콘
    features = ["✓ HACCP 체크리스트 자동화", "✓ 실시간 CCP 모니터링", "✓ 통합 재무/회계 관리", "✓ AI 지능형 관제센터"]
    fy = 370
    for f in features:
        draw.text((80, fy), f, fill="#94A3B8", font=FONT_MD)
        fy += 32

    draw.text((80, 530), "www.goldenturtle.co.kr", fill="#64748B", font=FONT_SM)

    # 우측 로그인 폼
    fx = 580
    fy = 150

    # 탭: 로그인 / 회원가입
    draw_rounded_rect(draw, [fx, fy, fx + 250, fy + 38], fill=BLUE, radius=5)
    draw.text((fx + 15, fy + 9), "로그인", fill="#FFFFFF", font=FONT_MD)
    draw_rounded_rect(draw, [fx + 260, fy, fx + 500, fy + 38], fill="#E2E8F0", radius=5)
    draw.text((fx + 275, fy + 9), "회원가입", fill=TEXT_GRAY, font=FONT_MD)

    fy += 70
    draw_input(draw, fx, fy, 500, label="이메일", placeholder="admin@company.co.kr")
    fy += 60
    draw_input(draw, fx, fy, 500, label="비밀번호", placeholder="••••••••")
    fy += 60
    draw.text((fx, fy), "☐ 로그인 상태 유지", fill=TEXT_GRAY, font=FONT_SM)
    draw.text((fx + 350, fy), "비밀번호 찾기", fill=BLUE, font=FONT_SM)

    fy += 45
    draw_rounded_rect(draw, [fx, fy, fx + 500, fy + 44], fill=BLUE, radius=8)
    draw.text((fx + 210, fy + 11), "로그인", fill="#FFFFFF", font=FONT_LG)

    fy += 70
    draw.rectangle([fx, fy, fx + 500, fy + 1], fill=CARD_BORDER)
    fy += 20
    draw.text((fx + 130, fy), "골든터틀컴퍼니 © 2026", fill=TEXT_LIGHT, font=FONT_SM)

    save(img, "01_login")


def create_main_dashboard():
    """2. 메인 대시보드"""
    img, draw = new_canvas()
    sw = draw_sidebar(draw, "WORK", [
        "통합 대시보드", "Today", "AI 어시스턴트", "엑셀 임포트"
    ], "통합 대시보드")
    ht = draw_header(draw, sw, "통합 대시보드")

    cx, cy = sw + 15, ht + 12

    # 상단 통계 카드 4개
    cw = (W - sw - 75) // 4
    draw_stat_card(draw, cx, cy, cw, 70, "이번 달 매출", "₩12,500,000", BLUE, LIGHT_BLUE)
    draw_stat_card(draw, cx + cw + 15, cy, cw, 70, "이번 달 비용", "₩8,200,000", RED, LIGHT_RED)
    draw_stat_card(draw, cx + (cw + 15) * 2, cy, cw, 70, "순이익", "₩4,300,000", GREEN, LIGHT_GREEN)
    draw_stat_card(draw, cx + (cw + 15) * 3, cy, cw, 70, "이익률", "34.4%", PURPLE, "#F3E8FF")

    cy += 90

    # 좌측: 생산 현황 카드
    lw = (W - sw - 45) // 2
    draw_card(draw, [cx, cy, cx + lw, cy + 200], "생산 현황")
    # 미니 파이프라인
    stages = ["계획 3", "준비 2", "생산중 4", "완료 1"]
    colors = ["#93C5FD", "#FDE68A", "#86EFAC", "#C4B5FD"]
    sx = cx + 20
    for i, (s, c) in enumerate(zip(stages, colors)):
        draw_rounded_rect(draw, [sx, cy + 55, sx + 100, cy + 130], fill=c, radius=6)
        draw.text((sx + 10, cy + 65), s.split()[0], fill=TEXT_DARK, font=FONT_SM)
        draw.text((sx + 35, cy + 90), s.split()[1], fill=TEXT_DARK, font=FONT_XL)
        if i < len(stages) - 1:
            draw.text((sx + 105, cy + 82), "→", fill=TEXT_GRAY, font=FONT_LG)
        sx += 115

    # 배치 리스트
    draw.text((cx + 20, cy + 145), "최근 배치: B-2026-0401  정제수 500L  생산중", fill=TEXT_GRAY, font=FONT_SM)
    draw.text((cx + 20, cy + 168), "최근 배치: B-2026-0402  과일주스 1000개  계획", fill=TEXT_GRAY, font=FONT_SM)

    # 우측: 재고 알림 카드
    rx = cx + lw + 15
    draw_card(draw, [rx, cy, rx + lw, cy + 200], "재고 알림")
    alerts = [
        ("⚠️ 설탕 - 안전재고 이하 (현재 15kg / 안전 50kg)", RED),
        ("⚠️ 밀가루 - 소비기한 임박 (D-3)", ORANGE),
        ("✅ 정제수 - 정상 (현재 200L)", GREEN),
        ("⚠️ 포장지 - 안전재고 이하 (현재 100매 / 안전 500매)", RED),
    ]
    ay = cy + 52
    for alert, color in alerts:
        draw.text((rx + 15, ay), alert, fill=color, font=FONT_SM)
        ay += 35

    cy += 215

    # 하단 좌측: 체크리스트 진행률
    draw_card(draw, [cx, cy, cx + lw, cy + 200], "오늘 체크리스트 진행률")
    items = [
        ("개인위생점검", 100, GREEN), ("수질검사", 100, GREEN),
        ("설비세정기록", 60, YELLOW), ("냉동점검", 0, RED),
        ("온습도점검", 0, RED),
    ]
    iy = cy + 50
    for name, pct, color in items:
        draw.text((cx + 20, iy), name, fill=TEXT_DARK, font=FONT_SM)
        # 프로그레스 바
        bar_x = cx + 160
        bar_w = lw - 250
        draw_rounded_rect(draw, [bar_x, iy + 2, bar_x + bar_w, iy + 16], fill="#E2E8F0", radius=4)
        if pct > 0:
            draw_rounded_rect(draw, [bar_x, iy + 2, bar_x + int(bar_w * pct / 100), iy + 16], fill=color, radius=4)
        draw.text((bar_x + bar_w + 10, iy), f"{pct}%", fill=color, font=FONT_SM)
        iy += 32

    # 하단 우측: CCP 요약
    draw_card(draw, [rx, cy, rx + lw, cy + 200], "CCP 모니터링 요약")
    ccps = [
        ("CCP-1 금속검출", "정상", GREEN), ("CCP-2 살균온도", "정상", GREEN),
        ("CCP-3 냉각온도", "주의", YELLOW), ("CCP-4 포장밀봉", "정상", GREEN),
    ]
    cy2 = cy + 52
    for name, status, color in ccps:
        draw.text((rx + 15, cy2), name, fill=TEXT_DARK, font=FONT_SM)
        draw_badge(draw, rx + lw - 120, cy2 - 2, status, color)
        cy2 += 36

    save(img, "02_main_dashboard")


def create_haccp_checklist():
    """3. HACCP 체크리스트 목록"""
    img, draw = new_canvas()
    sw = draw_sidebar(draw, "HACCP", [
        "통합 대시보드", "생산관리", "CCP 관리",
        "HACCP 체크리스트", "검사 관리", "재고 관리",
        "감사관리", "문서 출력"
    ], "HACCP 체크리스트")
    ht = draw_header(draw, sw, "HACCP 체크리스트")

    cx, cy = sw + 15, ht + 12

    # 상단 필터/버튼 바
    draw.text((cx, cy + 5), "2026년 4월 2일 (수)", fill=TEXT_DARK, font=FONT_LG)
    draw_button(draw, W - 180, cy, "◀ 이전", "#64748B", 70)
    draw_button(draw, W - 100, cy, "다음 ▶", "#64748B", 70)

    cy += 45

    # 진행 요약
    draw_stat_card(draw, cx, cy, 150, 55, "전체", "20건", BLUE, LIGHT_BLUE)
    draw_stat_card(draw, cx + 165, cy, 150, 55, "완료", "12건", GREEN, LIGHT_GREEN)
    draw_stat_card(draw, cx + 330, cy, 150, 55, "진행중", "3건", YELLOW, LIGHT_YELLOW)
    draw_stat_card(draw, cx + 495, cy, 150, 55, "미작성", "5건", RED, LIGHT_RED)

    cy += 72

    # 체크리스트 카드 그리드
    checklists = [
        ("개인위생점검", "완료", GREEN, "09:00 작성 | 김철수"),
        ("수질검사", "완료", GREEN, "08:30 작성 | 박영희"),
        ("설비세정기록", "완료", GREEN, "10:00 작성 | 이민수"),
        ("용수사용점검", "완료", GREEN, "09:30 작성 | 김철수"),
        ("이물질기록", "진행중", YELLOW, "3/5 항목 완료"),
        ("냉동점검", "진행중", YELLOW, "2/8 항목 완료"),
        ("온습도점검", "진행중", YELLOW, "1/6 항목 완료"),
        ("포장보관기록", "미작성", RED, "예정: 14:00"),
        ("표면오염검사", "미작성", RED, "예정: 15:00"),
        ("에어컴프레서", "완료", GREEN, "07:00 작성 | 최동현"),
        ("위생기록", "미작성", RED, "예정: 16:00"),
        ("일일폐기물기록", "미작성", RED, "예정: 17:00"),
    ]

    cards_per_row = 4
    cw = (W - sw - 75) // cards_per_row
    ch = 105

    for i, (name, status, color, detail) in enumerate(checklists):
        row = i // cards_per_row
        col = i % cards_per_row
        x = cx + col * (cw + 15)
        y = cy + row * (ch + 12)

        draw_rounded_rect(draw, [x, y, x + cw, y + ch], fill=CARD_BG, outline=CARD_BORDER, radius=8)
        # 좌측 색상 바
        draw.rectangle([x, y + 8, x + 4, y + ch - 8], fill=color)

        draw.text((x + 15, y + 12), name, fill=TEXT_DARK, font=FONT_MD)
        draw_badge(draw, x + 15, y + 40, status, color)
        draw.text((x + 15, y + 72), detail, fill=TEXT_GRAY, font=FONT_SM)

    save(img, "03_haccp_checklist")


def create_ccp_monitoring():
    """4. CCP 모니터링 화면"""
    img, draw = new_canvas()
    sw = draw_sidebar(draw, "HACCP", [
        "통합 대시보드", "생산관리", "CCP 관리",
        "HACCP 체크리스트", "검사 관리", "재고 관리",
    ], "CCP 관리")
    ht = draw_header(draw, sw, "CCP 모니터링")

    cx, cy = sw + 15, ht + 12

    # 상단 요약
    draw_stat_card(draw, cx, cy, 180, 60, "CCP 포인트", "6개", BLUE, LIGHT_BLUE)
    draw_stat_card(draw, cx + 195, cy, 180, 60, "정상", "4개", GREEN, LIGHT_GREEN)
    draw_stat_card(draw, cx + 390, cy, 180, 60, "주의", "1개", YELLOW, LIGHT_YELLOW)
    draw_stat_card(draw, cx + 585, cy, 180, 60, "이탈", "1개", RED, LIGHT_RED)

    cy += 80

    # CCP 카드 (2x3 그리드)
    ccps = [
        ("CCP-1 금속검출기", "정상", GREEN, "감도: Fe 1.5mm", "한계: 2.0mm", "최근: 1.2mm ✓"),
        ("CCP-2 살균온도", "정상", GREEN, "현재: 85.2°C", "한계: 80~90°C", "연속 OK: 48h"),
        ("CCP-3 냉각온도", "주의", YELLOW, "현재: 12.5°C", "한계: ≤10°C", "초과 2.5°C ⚠"),
        ("CCP-4 포장밀봉", "정상", GREEN, "진공도: -0.8bar", "한계: ≤-0.6bar", "최근: OK ✓"),
        ("CCP-5 X-ray검사", "이탈", RED, "이물: 감지됨!", "한계: 미검출", "즉시 조치 필요 🚨"),
        ("CCP-6 pH측정", "정상", GREEN, "현재: 4.2", "한계: 3.5~4.5", "최근: OK ✓"),
    ]

    cw = (W - sw - 60) // 3
    ch = 180

    for i, (name, status, color, val1, val2, val3) in enumerate(ccps):
        row = i // 3
        col = i % 3
        x = cx + col * (cw + 15)
        y = cy + row * (ch + 15)

        # 카드 배경
        border = color if status != "정상" else CARD_BORDER
        draw_rounded_rect(draw, [x, y, x + cw, y + ch], fill=CARD_BG, outline=border, radius=10)

        # 상단 바 (상태 색상)
        draw_rounded_rect(draw, [x, y, x + cw, y + 6], fill=color, radius=0)

        draw.text((x + 15, y + 18), name, fill=TEXT_DARK, font=FONT_MD)
        draw_badge(draw, x + cw - 80, y + 16, status, color)

        # 게이지 바 (시각화)
        gauge_y = y + 55
        draw_rounded_rect(draw, [x + 15, gauge_y, x + cw - 15, gauge_y + 20], fill="#E2E8F0", radius=6)
        pct = 0.6 if status == "정상" else (0.85 if status == "주의" else 0.95)
        gauge_fill = int((cw - 30) * pct)
        draw_rounded_rect(draw, [x + 15, gauge_y, x + 15 + gauge_fill, gauge_y + 20], fill=color, radius=6)

        draw.text((x + 15, y + 90), val1, fill=TEXT_DARK, font=FONT_SM)
        draw.text((x + 15, y + 112), val2, fill=TEXT_GRAY, font=FONT_SM)
        draw.text((x + 15, y + 134), val3, fill=color, font=FONT_SM)

        # 하단 링크
        draw.text((x + 15, y + 158), "상세 이력 보기 →", fill=BLUE, font=FONT_SM)

    save(img, "04_ccp_monitoring")


def create_production_pipeline():
    """5. 생산 파이프라인 (9단계 칸반)"""
    img, draw = new_canvas(1400, 800)
    sw = draw_sidebar(draw, "HACCP", [
        "통합 대시보드", "생산관리", "CCP 관리",
        "HACCP 체크리스트", "검사 관리",
    ], "생산관리")

    # 헤더
    draw.rectangle([sw, 0, 1400, 56], fill=HEADER_BG, outline=CARD_BORDER)
    draw.text((sw + 20, 16), "생산관리", fill=TEXT_DARK, font=FONT_LG)

    # 탭 바
    tabs = ["파이프라인", "배치", "원가분석", "배치비용분석", "원가비교"]
    tx = sw + 15
    ty = 60
    for t in tabs:
        tw = len(t) * 16 + 20
        if t == "파이프라인":
            draw.rectangle([tx, ty, tx + tw, ty + 34], fill=BLUE)
            draw.text((tx + 10, ty + 8), t, fill="#FFFFFF", font=FONT_SM)
        else:
            draw.rectangle([tx, ty, tx + tw, ty + 34], fill="#F1F5F9")
            draw.text((tx + 10, ty + 8), t, fill=TEXT_GRAY, font=FONT_SM)
        tx += tw + 8

    cy = 105

    # 9단계 칸반 컬럼
    stages = [
        ("계획", "#DBEAFE", [("B-0405", "과일주스")]),
        ("원료준비", "#FEF3C7", [("B-0404", "정제수")]),
        ("배합", "#DCFCE7", []),
        ("가공", "#FDE68A", [("B-0403", "떡볶이소스")]),
        ("충전", "#E0E7FF", []),
        ("포장", "#FCE7F3", [("B-0401", "간장소스")]),
        ("검사", "#F3E8FF", [("B-0402", "참기름")]),
        ("출하대기", "#CCFBF1", []),
        ("완료", "#D1FAE5", [("B-0399", "고추장"), ("B-0398", "된장")]),
    ]

    total_w = 1400 - sw - 30
    col_w = total_w // 9
    x = sw + 15

    for stage_name, bg_color, batches in stages:
        # 컬럼 헤더
        draw_rounded_rect(draw, [x, cy, x + col_w - 8, cy + 32], fill=bg_color, radius=6)
        draw.text((x + 8, cy + 7), stage_name, fill=TEXT_DARK, font=FONT_SM)
        count_text = str(len(batches))
        draw_rounded_rect(draw, [x + col_w - 35, cy + 5, x + col_w - 15, cy + 25], fill="#FFFFFF", radius=10)
        draw.text((x + col_w - 30, cy + 7), count_text, fill=TEXT_GRAY, font=FONT_SM)

        # 컬럼 배경
        draw_rounded_rect(draw, [x, cy + 38, x + col_w - 8, H - 20], fill="#F8FAFC", outline=CARD_BORDER, radius=6)

        # 배치 카드
        by = cy + 48
        for code, product in batches:
            draw_rounded_rect(draw, [x + 5, by, x + col_w - 13, by + 70], fill="#FFFFFF", outline=CARD_BORDER, radius=6)
            draw.text((x + 12, by + 8), code, fill=BLUE, font=FONT_SM)
            draw.text((x + 12, by + 28), product, fill=TEXT_DARK, font=FONT_SM)
            draw.text((x + 12, by + 48), "500L", fill=TEXT_GRAY, font=FONT_SM)
            by += 80

        x += col_w

    save(img, "05_production_pipeline")


def create_inventory():
    """6. 재고 현황 화면"""
    img, draw = new_canvas()
    sw = draw_sidebar(draw, "HACCP", [
        "통합 대시보드", "생산관리", "CCP 관리",
        "HACCP 체크리스트", "검사 관리", "재고 관리",
    ], "재고 관리")
    ht = draw_header(draw, sw, "재고 관리")

    cx, cy = sw + 15, ht + 12

    # 탭: 원재료 / 제품
    draw_rounded_rect(draw, [cx, cy, cx + 80, cy + 32], fill=BLUE, radius=5)
    draw.text((cx + 12, cy + 7), "원재료", fill="#FFFFFF", font=FONT_SM)
    draw_rounded_rect(draw, [cx + 88, cy, cx + 160, cy + 32], fill="#F1F5F9", radius=5)
    draw.text((cx + 100, cy + 7), "제품", fill=TEXT_GRAY, font=FONT_SM)

    # 서브탭
    sub_tabs = ["현황", "소모/출고", "입고", "추이", "회전율", "예측", "발주", "조정"]
    stx = cx + 200
    for st in sub_tabs:
        stw = len(st) * 14 + 16
        if st == "현황":
            draw.text((stx, cy + 7), st, fill=BLUE, font=FONT_SM)
            draw.rectangle([stx, cy + 28, stx + stw - 8, cy + 30], fill=BLUE)
        else:
            draw.text((stx, cy + 7), st, fill=TEXT_GRAY, font=FONT_SM)
        stx += stw + 8

    cy += 45

    # 검색 바
    draw_input(draw, cx, cy, 250, placeholder="품목 검색...")
    draw_button(draw, cx + 270, cy, "검색", BLUE, 60)
    draw_button(draw, W - 180, cy, "+ 신규 입고", GREEN, 100)

    cy += 50

    # 통계 카드
    cw = (W - sw - 75) // 4
    draw_stat_card(draw, cx, cy, cw, 55, "전체 품목", "45건", BLUE, LIGHT_BLUE)
    draw_stat_card(draw, cx + cw + 15, cy, cw, 55, "안전재고 이하", "3건", RED, LIGHT_RED)
    draw_stat_card(draw, cx + (cw + 15) * 2, cy, cw, 55, "소비기한 임박", "5건", YELLOW, LIGHT_YELLOW)
    draw_stat_card(draw, cx + (cw + 15) * 3, cy, cw, 55, "총 재고가액", "₩15.2M", GREEN, LIGHT_GREEN)

    cy += 75

    # 테이블
    tw = W - sw - 30
    headers = ["품목코드", "품목명", "분류", "현재재고", "안전재고", "단위", "상태", "최근입고"]
    col_ws = [int(tw * r) for r in [0.1, 0.18, 0.1, 0.1, 0.1, 0.07, 0.1, 0.15]]
    # 나머지 보정
    col_ws[-1] = tw - sum(col_ws[:-1])

    rows = [
        ["RM-001", "설탕 (백설탕)", "원재료", "15 kg", "50 kg", "kg", "⚠ 부족", "2026-03-28"],
        ["RM-002", "밀가루 (중력분)", "원재료", "120 kg", "100 kg", "kg", "✅ 정상", "2026-03-30"],
        ["RM-003", "정제수", "원재료", "200 L", "100 L", "L", "✅ 정상", "2026-04-01"],
        ["RM-004", "소금 (천일염)", "원재료", "80 kg", "50 kg", "kg", "✅ 정상", "2026-03-25"],
        ["RM-005", "포장지 (500ml)", "포장재", "100 매", "500 매", "매", "⚠ 부족", "2026-03-20"],
        ["RM-006", "간장 원액", "원재료", "50 L", "30 L", "L", "✅ 정상", "2026-04-01"],
        ["RM-007", "고춧가루", "원재료", "25 kg", "20 kg", "kg", "⚠ 임박", "2026-03-15"],
        ["RM-008", "참깨", "원재료", "10 kg", "15 kg", "kg", "⚠ 부족", "2026-03-22"],
    ]

    draw_table(draw, cx, cy, headers, rows, col_ws, 28)

    # 페이지네이션
    py = cy + 28 * 9 + 10
    draw.text((cx, py), "1-8 / 45건", fill=TEXT_GRAY, font=FONT_SM)
    draw_button(draw, W - 220, py - 5, "◀", "#64748B", 35, 28)
    draw.text((W - 175, py), "1 / 6", fill=TEXT_DARK, font=FONT_SM)
    draw_button(draw, W - 135, py - 5, "▶", "#64748B", 35, 28)

    save(img, "06_inventory")


if __name__ == "__main__":
    print("🎨 우선순위 높음 - 6개 화면 목업 생성 시작")
    create_login_screen()
    create_main_dashboard()
    create_haccp_checklist()
    create_ccp_monitoring()
    create_production_pipeline()
    create_inventory()
    print("✅ 6개 완료!")
