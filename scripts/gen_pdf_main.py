#!/usr/bin/env python3
"""HACCP-ONE 통합 가이드 PDF 생성 - 메인 실행 스크립트"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from gen_pdf_part1 import HaccpPDF, OUTPUT_DIR, OUTPUT_FILE
from gen_pdf_part2 import write_sales_sections
from gen_pdf_part3 import write_manual_sections


def write_toc(pdf):
    """목차 페이지"""
    pdf.add_page()
    pdf.ln(5)
    pdf.set_font("CJK", "B", 18)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 12, "목차 (Table of Contents)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    pdf.set_draw_color(37, 99, 235)
    pdf.set_line_width(0.8)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(8)

    sections = [
        ("PART A. 제품 소개 및 영업 문서", True),
        ("1. 제품 개요", False),
        ("2. 경쟁 우위", False),
        ("3. 주요 모듈 소개", False),
        ("4. 도입 기대 효과", False),
        ("5. 서비스 요금 안내", False),
        ("", False),
        ("PART B. 사용자 매뉴얼", True),
        ("6. 시작하기 (Getting Started)", False),
        ("7. HACCP 관리 사용법", False),
        ("8. 생산관리 사용법", False),
        ("9. 재고관리 사용법", False),
        ("10. 회계 관리 사용법", False),
        ("11. AI 기능 사용법", False),
        ("12. 시스템 관리", False),
        ("13. 자주 묻는 질문 (FAQ)", False),
    ]

    for title, is_part in sections:
        if not title:
            pdf.ln(3)
            continue
        if is_part:
            pdf.ln(2)
            pdf.set_font("CJK", "B", 12)
            pdf.set_text_color(37, 99, 235)
        else:
            pdf.set_font("CJK", "", 11)
            pdf.set_text_color(30, 41, 59)
        indent = 10 if is_part else 20
        pdf.set_x(indent)
        pdf.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")


def write_closing(pdf):
    """마지막 페이지 - 연락처"""
    pdf.add_page()
    pdf.ln(30)

    pdf.set_fill_color(15, 23, 42)
    pdf.rect(0, 60, 210, 100, "F")

    pdf.set_y(70)
    pdf.set_font("CJK", "B", 20)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 12, "HACCP-ONE", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("CJK", "", 12)
    pdf.set_text_color(180, 200, 255)
    pdf.cell(0, 8, "식품안전의 미래, HACCP-ONE과 함께하세요", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)

    pdf.set_font("CJK", "", 11)
    pdf.set_text_color(255, 255, 255)
    contact = [
        "골든터틀컴퍼니",
        "웹사이트: www.goldenturtle.co.kr",
        "서비스: haccpone.co.kr",
        "이메일: support@goldenturtle.co.kr",
    ]
    for line in contact:
        pdf.cell(0, 8, line, align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_y(180)
    pdf.set_font("CJK", "", 9)
    pdf.set_text_color(107, 114, 128)
    pdf.cell(0, 6, "Copyright 2026 Golden Turtle Company. All rights reserved.", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, "본 문서의 무단 복제 및 배포를 금합니다.", align="C", new_x="LMARGIN", new_y="NEXT")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("HACCP-ONE 통합 가이드 PDF 생성 시작...")

    pdf = HaccpPDF()

    # 1. 표지
    print("  [1/6] 표지 생성...")
    pdf.cover_page()

    # 2. 목차
    print("  [2/6] 목차 생성...")
    write_toc(pdf)

    # 3. 파트 A: 영업/제안 문서
    print("  [3/6] 파트 A: 제품 소개 및 영업 문서...")
    pdf = write_sales_sections(pdf)

    # 4. 파트 B: 사용자 매뉴얼
    print("  [4/6] 파트 B: 사용자 매뉴얼...")
    pdf = write_manual_sections(pdf)

    # 5. 마무리 페이지
    print("  [5/6] 마무리 페이지...")
    write_closing(pdf)

    # 6. 출력
    print("  [6/6] PDF 저장...")
    pdf.output(OUTPUT_FILE)

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    print(f"\n  PDF 생성 완료!")
    print(f"  파일: {OUTPUT_FILE}")
    print(f"  크기: {size_kb:.1f} KB")
    print(f"  페이지: {pdf.page_no()} 페이지")


if __name__ == "__main__":
    main()
