"""공통 와이어프레임 유틸리티 - 색상, 폰트, 헬퍼 함수"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 800
OUTPUT_DIR = "/home/user/haccp_v3/docs/mockups"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 색상 팔레트
BG = "#F8FAFC"
SIDEBAR_BG = "#0F172A"
SIDEBAR_TEXT = "#94A3B8"
SIDEBAR_ACTIVE = "#3B82F6"
HEADER_BG = "#FFFFFF"
CARD_BG = "#FFFFFF"
CARD_BORDER = "#E2E8F0"
TEXT_DARK = "#1E293B"
TEXT_GRAY = "#64748B"
TEXT_LIGHT = "#94A3B8"
BLUE = "#3B82F6"
GREEN = "#16A34A"
RED = "#DC2626"
YELLOW = "#F59E0B"
ORANGE = "#EA580C"
PURPLE = "#7C3AED"
NAVY = "#0F172A"
LIGHT_BLUE = "#DBEAFE"
LIGHT_GREEN = "#DCFCE7"
LIGHT_RED = "#FEE2E2"
LIGHT_YELLOW = "#FEF9C3"

# 폰트
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
try:
    FONT_SM = ImageFont.truetype(FONT_PATH, 13)
    FONT_MD = ImageFont.truetype(FONT_PATH, 15)
    FONT_LG = ImageFont.truetype(FONT_PATH, 18)
    FONT_XL = ImageFont.truetype(FONT_PATH, 22)
    FONT_XXL = ImageFont.truetype(FONT_PATH, 28)
    FONT_TITLE = ImageFont.truetype(FONT_PATH, 32)
except:
    FONT_SM = FONT_MD = FONT_LG = FONT_XL = FONT_XXL = FONT_TITLE = ImageFont.load_default()


def new_canvas(w=W, h=H):
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    return img, draw


def draw_rounded_rect(draw, xy, fill, outline=None, radius=8):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)


def draw_sidebar(draw, active_tab="HACCP", menu_items=None, active_menu=None):
    """사이드바 그리기"""
    sw = 220
    draw.rectangle([0, 0, sw, H], fill=SIDEBAR_BG)

    # 로고
    draw.text((20, 18), "Millio AI", fill="#FFFFFF", font=FONT_XL)
    draw.text((20, 48), "v3.0", fill=SIDEBAR_TEXT, font=FONT_SM)

    # 탭 버튼
    tabs = ["WORK", "회계", "HACCP"]
    tx = 15
    for t in tabs:
        tw = 60
        if t == active_tab:
            draw_rounded_rect(draw, [tx, 75, tx + tw, 100], fill=BLUE, radius=5)
            draw.text((tx + 8, 79), t, fill="#FFFFFF", font=FONT_SM)
        else:
            draw_rounded_rect(draw, [tx, 75, tx + tw, 100], fill="#1E293B", outline="#334155", radius=5)
            draw.text((tx + 8, 79), t, fill=SIDEBAR_TEXT, font=FONT_SM)
        tx += tw + 5

    # 메뉴 항목
    if menu_items:
        y = 115
        for item in menu_items:
            if item == active_menu:
                draw_rounded_rect(draw, [8, y, sw - 8, y + 32], fill="#1E3A5F", radius=5)
                draw.text((20, y + 7), item, fill="#FFFFFF", font=FONT_MD)
            else:
                draw.text((20, y + 7), item, fill=SIDEBAR_TEXT, font=FONT_MD)
            y += 36

    return sw


def draw_header(draw, sw, title, username="관리자"):
    """상단 헤더 그리기"""
    draw.rectangle([sw, 0, W, 56], fill=HEADER_BG, outline=CARD_BORDER)
    draw.text((sw + 20, 16), title, fill=TEXT_DARK, font=FONT_LG)
    # 우측 사용자 정보
    draw.text((W - 160, 18), f"🔔  👤 {username}", fill=TEXT_GRAY, font=FONT_MD)
    return 56


def draw_card(draw, xy, title=None, content_fn=None):
    """카드 컴포넌트 그리기"""
    x1, y1, x2, y2 = xy
    draw_rounded_rect(draw, xy, fill=CARD_BG, outline=CARD_BORDER, radius=8)
    if title:
        draw.text((x1 + 15, y1 + 12), title, fill=TEXT_DARK, font=FONT_MD)
        draw.line([(x1 + 10, y1 + 38), (x2 - 10, y1 + 38)], fill=CARD_BORDER, width=1)


def draw_stat_card(draw, x, y, w, h, label, value, color=BLUE, bg=LIGHT_BLUE):
    """통계 카드"""
    draw_rounded_rect(draw, [x, y, x + w, y + h], fill=bg, outline=None, radius=8)
    draw.text((x + 15, y + 12), label, fill=TEXT_GRAY, font=FONT_SM)
    draw.text((x + 15, y + 34), str(value), fill=color, font=FONT_XL)


def draw_table(draw, x, y, headers, rows, col_widths, row_height=30):
    """테이블 그리기"""
    # 헤더
    cx = x
    for i, h in enumerate(headers):
        draw.rectangle([cx, y, cx + col_widths[i], y + row_height], fill=NAVY, outline=CARD_BORDER)
        draw.text((cx + 8, y + 7), h, fill="#FFFFFF", font=FONT_SM)
        cx += col_widths[i]

    # 행
    for ri, row in enumerate(rows):
        ry = y + row_height * (ri + 1)
        cx = x
        bg = "#F8FAFC" if ri % 2 == 0 else "#FFFFFF"
        for i, cell in enumerate(row):
            draw.rectangle([cx, ry, cx + col_widths[i], ry + row_height], fill=bg, outline=CARD_BORDER)
            draw.text((cx + 8, ry + 7), str(cell), fill=TEXT_DARK, font=FONT_SM)
            cx += col_widths[i]

    return y + row_height * (len(rows) + 1)


def draw_button(draw, x, y, text, color=BLUE, w=None, h=32):
    """버튼 그리기"""
    if w is None:
        w = len(text) * 16 + 24
    draw_rounded_rect(draw, [x, y, x + w, y + h], fill=color, radius=5)
    draw.text((x + 12, y + 7), text, fill="#FFFFFF", font=FONT_SM)
    return w


def draw_input(draw, x, y, w, h=34, label=None, placeholder=""):
    """입력 필드 그리기"""
    if label:
        draw.text((x, y - 18), label, fill=TEXT_GRAY, font=FONT_SM)
    draw_rounded_rect(draw, [x, y, x + w, y + h], fill="#FFFFFF", outline=CARD_BORDER, radius=5)
    if placeholder:
        draw.text((x + 10, y + 8), placeholder, fill=TEXT_LIGHT, font=FONT_SM)


def draw_badge(draw, x, y, text, color=GREEN):
    """배지/태그"""
    tw = len(text) * 12 + 16
    bg_colors = {GREEN: LIGHT_GREEN, RED: LIGHT_RED, YELLOW: LIGHT_YELLOW, BLUE: LIGHT_BLUE}
    bg = bg_colors.get(color, LIGHT_BLUE)
    draw_rounded_rect(draw, [x, y, x + tw, y + 22], fill=bg, radius=4)
    draw.text((x + 8, y + 3), text, fill=color, font=FONT_SM)
    return tw


def save(img, name):
    path = os.path.join(OUTPUT_DIR, f"{name}.png")
    img.save(path, "PNG")
    print(f"  ✅ {name}.png ({img.width}x{img.height})")
    return path


print("mockup_utils loaded")
