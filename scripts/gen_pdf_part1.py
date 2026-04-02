#!/usr/bin/env python3
"""HACCP-ONE 통합 가이드 PDF 생성 스크립트 - Part 1: 클래스 정의"""

import os
import sys

# fpdf2 cryptography workaround
os.environ.setdefault("CRYPTOGRAPHY_OPENSSL_NO_LEGACY", "1")

from fpdf import FPDF, XPos, YPos

FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
OUTPUT_DIR = "/home/user/haccp_v3/docs"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "HACCPONE_통합가이드.pdf")

# Colors
NAVY = (15, 23, 42)
BLUE = (37, 99, 235)
LIGHT_BLUE = (219, 234, 254)
GRAY = (107, 114, 128)
WHITE = (255, 255, 255)
LIGHT_GRAY = (243, 244, 246)
GREEN = (22, 163, 74)
DARK = (30, 41, 59)


class HaccpPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.add_font("CJK", "", FONT_PATH)
        self.add_font("CJK", "B", FONT_PATH)
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        if self.page_no() <= 1:
            return
        self.set_font("CJK", "", 8)
        self.set_text_color(*GRAY)
        self.cell(0, 8, "HACCP-ONE 통합 가이드  |  골든터틀컴퍼니", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*BLUE)
        self.set_line_width(0.5)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(5)

    def footer(self):
        if self.page_no() <= 1:
            return
        self.set_y(-15)
        self.set_font("CJK", "", 8)
        self.set_text_color(*GRAY)
        self.cell(0, 10, f"- {self.page_no()} -", align="C")

    def cover_page(self):
        self.add_page()
        self.ln(40)
        # Title box
        self.set_fill_color(*NAVY)
        self.rect(0, 30, 210, 80, "F")
        self.set_y(45)
        self.set_font("CJK", "B", 28)
        self.set_text_color(*WHITE)
        self.cell(0, 15, "HACCP-ONE", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("CJK", "", 16)
        self.cell(0, 10, "HACCP + ERP + AI 통합 솔루션", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(5)
        self.set_font("CJK", "", 12)
        self.set_text_color(180, 200, 255)
        self.cell(0, 8, "사용자 매뉴얼 & 제품 소개서", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        self.set_y(130)
        self.set_text_color(*DARK)
        self.set_font("CJK", "", 11)
        info_lines = [
            "발행: 골든터틀컴퍼니 (www.goldenturtle.co.kr)",
            "제품: HACCP-ONE SaaS Platform (haccpone.co.kr)",
            "버전: v3.0  |  2026년 4월",
            "문의: support@goldenturtle.co.kr",
        ]
        for line in info_lines:
            self.cell(0, 8, line, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        self.set_y(185)
        self.set_font("CJK", "", 9)
        self.set_text_color(*GRAY)
        self.cell(0, 6, "본 문서는 HACCP-ONE의 기능 안내 및 제품 소개를 위한 통합 가이드입니다.", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.cell(0, 6, "Confidential - For authorized use only", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def section_title(self, num, title):
        self.add_page()
        self.ln(10)
        self.set_fill_color(*BLUE)
        self.rect(10, self.get_y(), 190, 18, "F")
        self.set_font("CJK", "B", 16)
        self.set_text_color(*WHITE)
        self.set_y(self.get_y() + 2)
        self.cell(0, 14, f"  {num}. {title}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(8)
        self.set_text_color(*DARK)

    def sub_title(self, title):
        self.ln(3)
        self.set_font("CJK", "B", 12)
        self.set_text_color(*BLUE)
        self.cell(0, 8, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(*DARK)
        self.ln(2)

    def sub_sub_title(self, title):
        self.ln(2)
        self.set_font("CJK", "B", 10)
        self.set_text_color(*NAVY)
        self.cell(0, 7, "  " + title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(*DARK)
        self.ln(1)

    def body_text(self, text):
        self.set_font("CJK", "", 10)
        self.set_text_color(*DARK)
        self.multi_cell(0, 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)

    def bullet(self, text, indent=12):
        self.set_font("CJK", "", 10)
        self.set_text_color(*DARK)
        self.set_x(10 + indent)
        self.multi_cell(190 - indent, 6, f"* {text}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def numbered_item(self, num, text, indent=12):
        self.set_font("CJK", "", 10)
        self.set_text_color(*DARK)
        self.set_x(10 + indent)
        self.multi_cell(190 - indent, 6, f"{num}. {text}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def info_box(self, title, text):
        self.ln(2)
        y = self.get_y()
        self.set_fill_color(*LIGHT_BLUE)
        self.rect(15, y, 180, 6 + len(text) // 30 * 6 + 12, "F")
        self.set_xy(18, y + 3)
        self.set_font("CJK", "B", 9)
        self.set_text_color(*BLUE)
        self.cell(0, 5, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_x(18)
        self.set_font("CJK", "", 9)
        self.set_text_color(*DARK)
        self.multi_cell(174, 5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(4)

    def simple_table(self, headers, rows, col_widths=None):
        if col_widths is None:
            w = 180 / len(headers)
            col_widths = [w] * len(headers)
        # Header
        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        self.set_font("CJK", "B", 9)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], 8, f" {h}", border=1, fill=True)
        self.ln()
        # Rows
        self.set_text_color(*DARK)
        self.set_font("CJK", "", 9)
        for ri, row in enumerate(rows):
            fill = ri % 2 == 1
            if fill:
                self.set_fill_color(*LIGHT_GRAY)
            for i, cell in enumerate(row):
                self.cell(col_widths[i], 7, f" {cell}", border=1, fill=fill)
            self.ln()
        self.ln(3)


print("Part 1 loaded: HaccpPDF class defined")
