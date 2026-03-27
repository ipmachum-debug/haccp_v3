#!/usr/bin/env python3
"""
제품출고 + 매출등록 데이터 재임포트
- 기존 h_product_outbound (tenant_id=2) 전체 삭제 후 재삽입
- 기존 accounting_sales (tenant_id=2, source_type='product_outbound') 전체 삭제 후 재삽입
"""
import json
import sys

# Vendor → Partner mapping
VENDOR_MAP = {
    None:           (49, "B2C전자상거래"),
    "":             (49, "B2C전자상거래"),
    "소이담소":      (5,  "주식회사 골든터틀컴퍼니"),
    "이지다인":      (5,  "주식회사 골든터틀컴퍼니"),
    "미미스(떡마루)": (7,  "주식회사 미미스"),
    "미미스":        (7,  "주식회사 미미스"),
    "사계":          (7,  "주식회사 미미스"),
    "푸드샵":        (7,  "주식회사 미미스"),
}

TENANT_ID = 2
CREATED_BY = 2  # dduckdanji@naver.com user id

with open("scripts/delivery_for_import.json", "r") as f:
    data = json.load(f)

print(f"Total records to import: {len(data)}")

# Generate SQL
lines = []

# 1. Delete existing data
lines.append("-- ========== DELETE EXISTING DATA ==========")
lines.append(f"DELETE FROM accounting_sales WHERE tenant_id = {TENANT_ID} AND source_type = 'product_outbound';")
lines.append(f"DELETE FROM h_product_outbound WHERE tenant_id = {TENANT_ID};")
lines.append(f"ALTER TABLE h_product_outbound AUTO_INCREMENT = 1;")
lines.append("")

# 2. Insert h_product_outbound
lines.append("-- ========== INSERT h_product_outbound ==========")

for i, r in enumerate(data):
    vendor = r.get("vendor")
    partner_id, partner_name = VENDOR_MAP.get(vendor, (49, "B2C전자상거래"))
    
    release_type = "delivery" if r["transactionType"] == "B2B" else "sale"
    product_name = r["product"].replace("'", "\\'")
    release_date = r["date"]  # already YYYY-MM-DD
    
    # packSize = 실제 출고 중량(kg), quantity in JSON is always 1
    pack_size = r.get("packSize", 0) or 0
    pack_unit = r.get("packUnit", "kg")
    quantity = pack_size  # 실제 출고 kg수
    unit = "kg"
    
    # unit_price = supplyAmount / packSize (kg당 가격)
    supply_amount = r.get("supplyAmount", 0) or 0
    unit_price = round(supply_amount / pack_size, 2) if pack_size > 0 else supply_amount
    total_amount = supply_amount  # 공급가 합계
    
    vat = r.get("vat", 0) or 0
    total_incl_vat = r.get("total", 0) or 0
    
    vendor_label = vendor or "B2C"
    notes = f"{r['transactionType']} (공급가:{supply_amount:,.0f}, VAT:{vat:,.0f}, 합계:{total_incl_vat:,.0f})".replace("'", "\\'")
    
    lines.append(
        f"INSERT INTO h_product_outbound "
        f"(tenant_id, product_name, quantity, unit, unit_price, total_amount, "
        f"partner_id, partner_name, release_date, release_type, notes, status, created_by, created_at) "
        f"VALUES ({TENANT_ID}, '{product_name}', {quantity}, '{unit}', {unit_price:.2f}, {total_amount:.2f}, "
        f"{partner_id}, '{partner_name.replace(chr(39), chr(92)+chr(39))}', '{release_date}', '{release_type}', "
        f"'{notes}', 'confirmed', {CREATED_BY}, NOW());"
    )

lines.append("")
lines.append("-- ========== INSERT accounting_sales ==========")

# 3. Insert accounting_sales (linked to outbound via source_id)
# We'll use a variable to track the auto_increment id
lines.append("SET @outbound_start_id = (SELECT MIN(id) FROM h_product_outbound WHERE tenant_id = 2);")
lines.append("")

for i, r in enumerate(data):
    vendor = r.get("vendor")
    partner_id, partner_name = VENDOR_MAP.get(vendor, (49, "B2C전자상거래"))
    
    release_type = "delivery" if r["transactionType"] == "B2B" else "sale"
    # Only sale/delivery get accounting entries (same as original code)
    product_name = r["product"].replace("'", "\\'")
    release_date = r["date"]
    pack_size = r.get("packSize", 0) or 0
    quantity = pack_size  # 실제 출고 kg수
    supply_amount = r.get("supplyAmount", 0) or 0
    unit_price_per_kg = round(supply_amount / pack_size, 2) if pack_size > 0 else supply_amount
    vat = r.get("vat", 0) or 0
    tax_rate = 10.00
    
    notes = f"제품출고 자동생성 ({r['transactionType']}, {pack_size}kg)".replace("'", "\\'")
    
    lines.append(
        f"INSERT INTO accounting_sales "
        f"(tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price, "
        f"total_amount, tax_amount, tax_rate, status, notes, source_type, source_id, created_by, created_at) "
        f"VALUES ({TENANT_ID}, '{release_date}', {partner_id}, '{product_name}', {quantity}, 'kg', "
        f"{unit_price_per_kg:.2f}, {supply_amount:.2f}, {vat:.2f}, {tax_rate:.2f}, "
        f"'pending', '{notes}', 'product_outbound', @outbound_start_id + {i}, {CREATED_BY}, NOW());"
    )

# Write SQL file
sql_path = "scripts/reimport_outbound.sql"
with open(sql_path, "w") as f:
    f.write("\n".join(lines))

print(f"SQL file written: {sql_path}")
print(f"  h_product_outbound INSERTs: {len(data)}")
print(f"  accounting_sales INSERTs: {len(data)}")
print(f"  Total SQL statements: {len([l for l in lines if l.strip() and not l.startswith('--')])}")

# Summary stats
total_supply = sum(r.get("supplyAmount", 0) or 0 for r in data)
total_vat = sum(r.get("vat", 0) or 0 for r in data)
total_total = sum(r.get("total", 0) or 0 for r in data)
print(f"\n  Total supply (세전): ₩{total_supply:,.0f}")
print(f"  Total VAT: ₩{total_vat:,.0f}")
print(f"  Total (세후): ₩{total_total:,.0f}")

