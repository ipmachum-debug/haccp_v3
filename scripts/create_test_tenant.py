#!/usr/bin/env python3
"""
식품(전체 기능) 테스트 테넌트 + 관리자 계정 생성 스크립트
========================================================

[목적]
- 식품(C10) 산업, Enterprise 플랜(모든 기능 ON), 1년 사용 가능한
  깨끗한 테스트 테넌트와 관리자 계정을 생성한다.
- 기존 운영 데이터에는 절대 영향을 주지 않는다 (별개 tenant_id).

[생성되는 것]
1. tenants 신규 row
   - industry_code='C10', industry_category='food'
   - subscription_package='enterprise', status='active'
   - 1년 사용 (오늘 ~ 1년 후)
2. users 신규 row (관리자 1명)
   - role='admin', user_type='client_admin'
   - approval_status='approved', is_active=1
   - password_hash = bcrypt(SALT_ROUNDS=10) — 운영 onboarding 로직과 동일
3. package_features 신규 rows
   - Enterprise 플랜의 모든 features를 enabled로 등록

[안전장치]
- DRY-RUN 기본, --commit 시 적용
- 이메일/slug 중복 사전 검증 (있으면 자동으로 -2,-3 접미사 추가)
- 단일 트랜잭션 + 사후 검증
- 어떤 운영 테이블에도 UPDATE/DELETE 없음 (INSERT only)

[기본값 (필요 시 CLI로 override)]
- 회사명: "테스트 식품(주)"
- 이메일: testfood@haccp.test
- 비밀번호: TestFood2026!@#
- 사용자명: 테스트 관리자
"""
import pymysql
from urllib.parse import urlparse
from datetime import datetime, timedelta, date
import os
import sys
import argparse
import bcrypt


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql://root:G0ld3n%21T1004%23Sec@127.0.0.1:3306/haccp_tenant_db",
)

# 기본값
DEFAULT_COMPANY = "테스트 식품(주)"
DEFAULT_EMAIL = "testfood@haccp.test"
DEFAULT_PASSWORD = "TestFood2026!@#"
DEFAULT_NAME = "테스트 관리자"
DEFAULT_BIZ_NUMBER = "000-00-00000"
DEFAULT_PHONE = ""
PLAN = "enterprise"
INDUSTRY_CODE = "C10"
SUBSCRIPTION_DAYS = 365

# 운영 onboarding 로직과 동일 (server/_core/jwtAuth.ts SALT_ROUNDS=10)
SALT_ROUNDS = 10

# Enterprise 플랜의 features (server/utils/planConfig.ts와 동기화)
ENTERPRISE_FEATURES = {
    "accounting": True,
    "aiAssistant": True,
    "documentPdf": True,
    "customPdf": True,
    "apiIntegration": True,
    "excelExport": True,
    "financialReports": True,
    "autoBackup": True,
}


def connect_db():
    u = urlparse(DATABASE_URL)
    password = (u.password or "").replace("%21", "!").replace("%23", "#")
    return pymysql.connect(
        host=u.hostname, port=u.port or 3306,
        user=u.username, password=password,
        database=u.path.lstrip("/"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def slugify(company_name: str) -> str:
    """운영 onboarding.router.ts 의 slug 생성 로직과 동일하게 영문/숫자/한글만 허용."""
    import re
    slug = company_name.lower()
    slug = re.sub(r"[^a-z0-9가-힣]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    slug = slug[:50]
    return slug or f"tenant-{int(datetime.now().timestamp())}"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--commit", action="store_true",
                    help="실제 적용. 미지정 시 DRY-RUN.")
    ap.add_argument("--company", default=DEFAULT_COMPANY, help=f"회사명 (기본: {DEFAULT_COMPANY})")
    ap.add_argument("--email", default=DEFAULT_EMAIL, help=f"관리자 이메일 (기본: {DEFAULT_EMAIL})")
    ap.add_argument("--password", default=DEFAULT_PASSWORD, help="관리자 비밀번호 (기본: 위 docstring 참조)")
    ap.add_argument("--name", default=DEFAULT_NAME, help=f"관리자 이름 (기본: {DEFAULT_NAME})")
    ap.add_argument("--biz", default=DEFAULT_BIZ_NUMBER, help="사업자번호")
    args = ap.parse_args()

    print("=" * 72)
    print(f"테스트 테넌트(식품/Enterprise) 생성 "
          f"({'COMMIT' if args.commit else 'DRY-RUN'})")
    print("=" * 72)

    # 입력 표시
    print("\n[입력]")
    print(f"  company  : {args.company}")
    print(f"  email    : {args.email}")
    print(f"  password : {args.password}")
    print(f"  name     : {args.name}")
    print(f"  biz_no   : {args.biz}")
    print(f"  plan     : {PLAN} (전체 기능 ON)")
    print(f"  industry : {INDUSTRY_CODE} (식품)")

    conn = connect_db()
    try:
        with conn.cursor() as cur:
            # ────────────────────────────────────────────
            # 1) 이메일 중복 사전 검증
            # ────────────────────────────────────────────
            cur.execute("SELECT id, tenant_id, name FROM users WHERE email=%s", (args.email,))
            dup = cur.fetchone()
            if dup:
                raise RuntimeError(
                    f"이메일 중복: id={dup['id']} tenant_id={dup['tenant_id']} "
                    f"name={dup['name']}. --email 옵션으로 다른 이메일 지정."
                )
            print(f"\n[OK] 이메일 사용 가능: {args.email}")

            # ────────────────────────────────────────────
            # 2) slug 충돌 회피
            # ────────────────────────────────────────────
            base_slug = slugify(args.company)
            final_slug = base_slug
            n = 1
            while True:
                cur.execute("SELECT id FROM tenants WHERE slug=%s", (final_slug,))
                if not cur.fetchone():
                    break
                n += 1
                final_slug = f"{base_slug}-{n}"
                if n > 100:
                    raise RuntimeError("slug 후보 초과")
            print(f"[OK] slug: {final_slug}")

            # ────────────────────────────────────────────
            # 3) 구독 기간
            # ────────────────────────────────────────────
            today = date.today()
            end = today + timedelta(days=SUBSCRIPTION_DAYS)
            print(f"[OK] 구독 기간: {today} ~ {end} ({SUBSCRIPTION_DAYS}일)")

            # ────────────────────────────────────────────
            # 4) 비밀번호 해시 (bcrypt, SALT_ROUNDS=10) — 운영 동일
            # ────────────────────────────────────────────
            pwd_hash = bcrypt.hashpw(args.password.encode("utf-8"),
                                     bcrypt.gensalt(SALT_ROUNDS)).decode("utf-8")
            print(f"[OK] 비밀번호 bcrypt 해시 생성 (길이 {len(pwd_hash)})")

            # ────────────────────────────────────────────
            # 5) 사전 검증 마무리 — MAX(id) 노출
            # ────────────────────────────────────────────
            cur.execute("SELECT COALESCE(MAX(id),0) mx FROM tenants")
            next_t = cur.fetchone()["mx"] + 1
            cur.execute("SELECT COALESCE(MAX(id),0) mx FROM users")
            next_u = cur.fetchone()["mx"] + 1
            print(f"[참고] 예상 tenant_id={next_t}, 예상 user_id={next_u}")

            print("\n" + "─" * 72)
            print("[생성될 데이터 요약]")
            print(f"  tenants : id={next_t}, name='{args.company}', slug='{final_slug}'")
            print(f"            status=active, plan={PLAN}, industry=food/C10")
            print(f"            기간 {today}~{end}")
            print(f"  users   : id={next_u}, email='{args.email}'")
            print(f"            role=admin, user_type=client_admin")
            print(f"            is_active=1, approval_status=approved")
            print(f"  package_features : Enterprise 8개 feature 모두 enabled")
            print("─" * 72)

            if not args.commit:
                print("\n[DRY-RUN] 변경 없음. --commit 으로 적용.")
                return

            # ────────────────────────────────────────────
            # 6) INSERT — 단일 트랜잭션
            # ────────────────────────────────────────────
            cur.execute("""
                INSERT INTO tenants
                  (name, slug, status,
                   subscription_package, subscription_start_date, subscription_end_date,
                   subscription_days, is_read_only,
                   industry_code, industry_category)
                VALUES (%s, %s, 'active',
                        %s, %s, %s,
                        %s, 0,
                        %s, 'food')
            """, (args.company, final_slug,
                  PLAN, today, end,
                  SUBSCRIPTION_DAYS,
                  INDUSTRY_CODE))
            tenant_id = cur.lastrowid
            print(f"\n[INSERT] tenants id={tenant_id}")

            cur.execute("""
                INSERT INTO users
                  (tenant_id, email, password_hash, name,
                   role, user_type, is_active, approval_status,
                   company_name, business_number)
                VALUES (%s, %s, %s, %s,
                        'admin', 'client_admin', 1, 'approved',
                        %s, %s)
            """, (tenant_id, args.email, pwd_hash, args.name,
                  args.company, args.biz))
            user_id = cur.lastrowid
            print(f"[INSERT] users id={user_id}")

            # package_features
            for fname, fenabled in ENTERPRISE_FEATURES.items():
                cur.execute("""
                    INSERT IGNORE INTO package_features
                      (package_name, feature_name, is_enabled, tenant_id, description)
                    VALUES (%s, %s, %s, %s, %s)
                """, (PLAN, fname, 1 if fenabled else 0, tenant_id, fname))
            print(f"[INSERT] package_features × {len(ENTERPRISE_FEATURES)} (모두 enabled)")

            # ────────────────────────────────────────────
            # 7) 사후 검증
            # ────────────────────────────────────────────
            cur.execute("""SELECT id, name, slug, status, industry_code, industry_category,
                                  subscription_package, subscription_start_date,
                                  subscription_end_date, subscription_days
                           FROM tenants WHERE id=%s""", (tenant_id,))
            print(f"\n[사후/tenants] {dict(cur.fetchone())}")

            cur.execute("""SELECT id, tenant_id, email, name, role, user_type,
                                  is_active, approval_status, company_name
                           FROM users WHERE id=%s""", (user_id,))
            print(f"[사후/users] {dict(cur.fetchone())}")

            cur.execute("""SELECT feature_name, is_enabled
                           FROM package_features WHERE tenant_id=%s
                           ORDER BY feature_name""", (tenant_id,))
            print(f"[사후/features]")
            for r in cur.fetchall():
                print(f"  - {r['feature_name']}: {'ON' if r['is_enabled'] else 'OFF'}")

            # 비밀번호 매칭 검증 (해시→비교)
            ok = bcrypt.checkpw(args.password.encode("utf-8"), pwd_hash.encode("utf-8"))
            print(f"\n[비밀번호 검증] bcrypt.checkpw → {ok}")
            if not ok:
                raise RuntimeError("비밀번호 해시 검증 실패")

            conn.commit()
            print("\n" + "=" * 72)
            print("[OK] 커밋 완료. 로그인 정보:")
            print("=" * 72)
            print(f"  회사명     : {args.company}")
            print(f"  이메일     : {args.email}")
            print(f"  비밀번호   : {args.password}")
            print(f"  tenant_id  : {tenant_id}")
            print(f"  user_id    : {user_id}")
            print(f"  사용기간   : {today} ~ {end}")
            print(f"  플랜       : {PLAN} (모든 기능 ON)")
            print(f"  industry   : 식품 (C10/food)")
            print("=" * 72)

    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] 롤백: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
