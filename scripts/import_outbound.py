#!/usr/bin/env python3
"""
제품 출고 + 매출 일괄 등록 스크립트
출고0319.pdf에서 추출된 데이터를 h_product_outbound + accounting_sales에 직접 INSERT
"""
import json
import subprocess
import sys
import os

# Configuration
TENANT_ID = 2
CREATED_BY = 4  # admin user id (danjimall@naver.com)
SSH_HOST = "49.50.130.101"
SSH_PORT = "2222"
SSH_PASS = "golden1004!"
MYSQL_USER = "root"
MYSQL_PASS = "G0ld3n!T1004#Sec"
MYSQL_DB = "haccp_tenant_db"

# Partner name -> id mapping
PARTNER_MAP = {
    '주식회사골든터틀컴퍼니': 5,
    '주식회사 골든터틀컴퍼니': 5,
    '주식회사 미미스': 7,
    'B2C(전자상거래)': 49,
}

def escape_sql(s):
    """Escape string for SQL"""
    if s is None:
        return 'NULL'
    return "'" + str(s).replace("\\", "\\\\").replace("'", "\\'") + "'"

def main():
    # Load data
    data_path = "/tmp/outbound_data.json"
    with open(data_path, 'r') as f:
        items = json.load(f)
    
    print(f"Loaded {len(items)} items from {data_path}")
    
    # Generate SQL
    sql_lines = []
    sql_lines.append("SET NAMES utf8mb4;")
    sql_lines.append("START TRANSACTION;")
    
    for i, item in enumerate(items):
        release_date = item['releaseDate']
        partner_name = item['partnerName']
        partner_id = PARTNER_MAP.get(partner_name, 'NULL')
        delivery_type = item['deliveryType']
        product_name = item['productName']
        quantity = item['quantity']
        unit_weight = item.get('unitWeight', 0)
        unit = item.get('unit', 'EA')
        unit_price = item.get('unitPrice', 0)
        total_amount = quantity * unit_price
        release_type = 'sale' if delivery_type == 'B2C' else 'delivery'
        notes = item.get('notes', f'{delivery_type} 납품')
        if unit_weight:
            notes += f' ({unit_weight}g)'
        
        partner_id_sql = str(partner_id) if partner_id != 'NULL' else 'NULL'
        
        # h_product_outbound INSERT
        sql_lines.append(f"""INSERT INTO h_product_outbound (
            tenant_id, batch_id, lot_id, product_name, quantity, unit, unit_price, total_amount,
            partner_id, partner_name, release_date, release_type, lot_number, notes, status, created_by, created_at
        ) VALUES (
            {TENANT_ID}, NULL, NULL, {escape_sql(product_name)}, {quantity},
            {escape_sql(unit)}, {unit_price}, {total_amount},
            {partner_id_sql}, {escape_sql(partner_name)},
            {escape_sql(release_date)}, {escape_sql(release_type)}, NULL,
            {escape_sql(notes)}, 'confirmed', {CREATED_BY}, NOW()
        );""")
        
        # Save the outbound ID and create accounting_sales
        sql_lines.append("SET @outbound_id = LAST_INSERT_ID();")
        
        sql_lines.append(f"""INSERT INTO accounting_sales (
            tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
            total_amount, status, notes, source_type, source_id, created_by, created_at
        ) VALUES (
            {TENANT_ID}, {escape_sql(release_date)},
            {partner_id_sql},
            {escape_sql(product_name)},
            {quantity}, {escape_sql(unit)}, {unit_price},
            {total_amount},
            'pending',
            {escape_sql(f'{delivery_type} 출고 일괄등록 (거래처: {partner_name})')},
            'product_outbound', @outbound_id, {CREATED_BY}, NOW()
        );""")
    
    sql_lines.append("COMMIT;")
    sql_lines.append(f"SELECT 'SUCCESS: Inserted {len(items)} outbound + sales records' AS result;")
    
    # Write SQL file
    sql_path = "/tmp/import_outbound.sql"
    with open(sql_path, 'w') as f:
        f.write('\n'.join(sql_lines))
    
    print(f"Generated SQL file: {sql_path} ({len(sql_lines)} statements)")
    
    # Copy SQL to server and execute
    print("Copying SQL to server...")
    cp_cmd = [
        "sshpass", "-p", SSH_PASS,
        "scp", "-P", SSH_PORT, "-o", "StrictHostKeyChecking=no",
        sql_path, f"root@{SSH_HOST}:/tmp/import_outbound.sql"
    ]
    result = subprocess.run(cp_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"SCP failed: {result.stderr}")
        sys.exit(1)
    
    print("Executing SQL on server...")
    exec_cmd = [
        "sshpass", "-p", SSH_PASS,
        "ssh", "-p", SSH_PORT, "-o", "StrictHostKeyChecking=no",
        f"root@{SSH_HOST}",
        f"mysql -u {MYSQL_USER} -p'{MYSQL_PASS}' {MYSQL_DB} < /tmp/import_outbound.sql"
    ]
    result = subprocess.run(exec_cmd, capture_output=True, text=True, timeout=120)
    print(f"Exit code: {result.returncode}")
    if result.stdout:
        print(f"Output: {result.stdout}")
    if result.stderr:
        # Filter out the password warning
        stderr_lines = [l for l in result.stderr.strip().split('\n') if 'Using a password' not in l]
        if stderr_lines:
            print(f"Errors: {chr(10).join(stderr_lines)}")
    
    if result.returncode == 0:
        print("\n✅ Import completed successfully!")
    else:
        print("\n❌ Import failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
