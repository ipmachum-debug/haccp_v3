/**
 * HACCP-ONE ↔ GOGOGOPICK 양방향 동기화 라우터
 * 
 * 기능:
 * 1. 슈퍼관리자: 테넌트별 동기화 기능 부여/차단 + 테넌트 매칭 관리
 * 2. 테넌트 관리자: 자기 테넌트 동기화 사용 여부 설정 및 실행
 * 3. 양방향 동기화: 거래처, 제품
 */
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { partners } from "../drizzle/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  testOpscoreConnection,
  getOpsCoreSyncStatus,
  getOpscorePartners,
  getOpscoreProducts,
  getOpscorePool,
} from "./opscore-db";

export const opscoreSyncRouter = router({

  // ============================================================
  // 1. 슈퍼관리자 전용: 테넌트 매칭 및 권한 관리
  // ============================================================

  /**
   * 전체 테넌트 매핑 목록 조회 (슈퍼관리자 전용)
   */
  getAllMappings: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "super_admin") {
      throw new Error("슈퍼관리자만 접근할 수 있습니다.");
    }
    const db = await getDb();
    if (!db) throw new Error("DB not initialized");

    const [mappings] = await db.execute(sql`
      SELECT m.*, t.slug as haccp_slug, t.status as haccp_status
      FROM opscore_tenant_mapping m
      LEFT JOIN tenants t ON t.id = m.haccp_tenant_id
      ORDER BY m.haccp_tenant_id
    `);

    // GOGOGOPICK 테넌트 목록도 가져오기
    let opscoreTenants: any[] = [];
    try {
      const opscoreStatus = await testOpscoreConnection();
      if (opscoreStatus.connected) {
        const opscoreDb = getOpscorePool();
        if (opscoreDb) {
          const [rows] = await opscoreDb.query("SELECT id, name, code, status FROM tenants WHERE deleted_at IS NULL ORDER BY id");
          opscoreTenants = rows as any[];
        }
      }
    } catch (e) {
      console.error("[OPScore Sync] Failed to get opscore tenants:", e);
    }

    return {
      mappings: mappings as any[],
      opscoreTenants,
    };
  }),

  /**
   * 테넌트 매핑 업데이트 (슈퍼관리자 전용)
   * - GOGOGOPICK 테넌트 매칭
   * - 동기화 기능 부여/차단
   * - 동기화 범위 설정
   */
  updateMapping: protectedProcedure
    .input(z.object({
      mappingId: z.number(),
      haccp_tenant_id: z.number().optional(),
      opscore_tenant_id: z.number().nullable(),
      opscore_tenant_name: z.string().nullable(),
      sync_enabled: z.boolean(),
      sync_suppliers: z.boolean().optional(),
      sync_products: z.boolean().optional(),
      sync_materials: z.boolean().optional(),
      sync_orders: z.boolean().optional(),
      sync_inventory: z.boolean().optional(),
      sync_accounting: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin") {
        throw new Error("슈퍼관리자만 접근할 수 있습니다.");
      }
      const db = await getDb();
      if (!db) throw new Error("DB not initialized");

      // UPSERT 로직: mappingId가 0이면 INSERT, 아니면 UPDATE
      if (input.mappingId === 0) {
        // 새 매핑 생성
        if (!input.haccp_tenant_id) {
          throw new Error("haccp_tenant_id가 필요합니다.");
        }
        await db.execute(sql`
          INSERT INTO opscore_tenant_mapping (
            haccp_tenant_id,
            opscore_tenant_id,
            opscore_tenant_name,
            sync_enabled,
            sync_suppliers,
            sync_products,
            sync_materials,
            sync_orders,
            sync_inventory,
            sync_accounting,
            created_at,
            updated_at
          ) VALUES (
            ${input.haccp_tenant_id},
            ${input.opscore_tenant_id},
            ${input.opscore_tenant_name},
            ${input.sync_enabled ? 1 : 0},
            ${input.sync_suppliers !== false ? 1 : 0},
            ${input.sync_products !== false ? 1 : 0},
            ${input.sync_materials ? 1 : 0},
            ${input.sync_orders ? 1 : 0},
            ${input.sync_inventory ? 1 : 0},
            ${input.sync_accounting ? 1 : 0},
            NOW(),
            NOW()
          )
        `);
      } else {
        // 기존 매핑 업데이트
        await db.execute(sql`
          UPDATE opscore_tenant_mapping SET
            opscore_tenant_id = ${input.opscore_tenant_id},
            opscore_tenant_name = ${input.opscore_tenant_name},
            sync_enabled = ${input.sync_enabled ? 1 : 0},
            sync_suppliers = ${input.sync_suppliers !== false ? 1 : 0},
            sync_products = ${input.sync_products !== false ? 1 : 0},
            sync_materials = ${input.sync_materials ? 1 : 0},
            sync_orders = ${input.sync_orders ? 1 : 0},
            sync_inventory = ${input.sync_inventory ? 1 : 0},
            sync_accounting = ${input.sync_accounting ? 1 : 0},
            updated_at = NOW()
          WHERE id = ${input.mappingId}
        `);
      }

      return { success: true };
    }),

  // ============================================================
  // 2. 테넌트 관리자: 자기 테넌트 동기화 설정 및 상태 확인
  // ============================================================

  /**
   * 현재 테넌트의 동기화 설정 조회 (테넌트 관리자)
   */
  getMyMapping: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB not initialized");

    const tenantId = ctx.tenantId;
    if (!tenantId) {
      return { mapping: null, allowed: false };
    }

    const [rows] = await db.execute(sql`
      SELECT * FROM opscore_tenant_mapping WHERE haccp_tenant_id = ${tenantId}
    `);
    const mapping = (rows as any[])[0] || null;

    return {
      mapping,
      allowed: mapping?.sync_enabled === 1,
    };
  }),

  /**
   * 테넌트 관리자가 동기화 사용 여부 토글
   */
  toggleTenantSync: protectedProcedure
    .input(z.object({ active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
        throw new Error("관리자만 설정할 수 있습니다.");
      }
      const db = await getDb();
      if (!db) throw new Error("DB not initialized");

      const tenantId = ctx.tenantId;
      if (!tenantId) throw new Error("테넌트 정보가 없습니다.");

      // 슈퍼관리자가 허용했는지 확인
      const [rows] = await db.execute(sql`
        SELECT sync_enabled FROM opscore_tenant_mapping WHERE haccp_tenant_id = ${tenantId}
      `);
      const mapping = (rows as any[])[0];
      if (!mapping || mapping.sync_enabled !== 1) {
        throw new Error("GOGOGOPICK 연동 서비스가 활성화되지 않았습니다. 고객센터로 문의해주세요. (전화: 032-322-9958 / 이메일: ipmachum@gmail.com)");
      }

      await db.execute(sql`
        UPDATE opscore_tenant_mapping SET
          tenant_sync_active = ${input.active ? 1 : 0},
          updated_at = NOW()
        WHERE haccp_tenant_id = ${tenantId}
      `);

      return { success: true };
    }),

  // ============================================================
  // 3. 연결 상태 및 데이터 현황 조회
  // ============================================================

  /**
   * 연결 상태 및 데이터 현황 조회
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) throw new Error("HACCP-ONE DB not initialized");

      // 테넌트 관리자인 경우 권한 확인
      if (ctx.user.role !== "super_admin" && ctx.tenantId) {
        const [rows] = await db.execute(sql`
          SELECT sync_enabled, tenant_sync_active FROM opscore_tenant_mapping 
          WHERE haccp_tenant_id = ${ctx.tenantId}
        `);
        const mapping = (rows as any[])[0];
        if (!mapping || mapping.sync_enabled !== 1) {
          return {
            opscoreConnected: false,
            allowed: false,
            error: "연동 서비스가 활성화되지 않았습니다.",
          };
        }
      }

      // GOGOGOPICK 측 데이터 현황
      const opscoreStatus = await getOpsCoreSyncStatus();

      // HACCP-ONE 측 데이터 현황
      let haccpSuppliers = 0;
      let haccpProducts = 0;
      let haccpPartners = 0;
      try {
        const [suppRows] = await db.execute(sql`SELECT COUNT(*) as c FROM h_suppliers WHERE is_active = 1 AND tenant_id = ${ctx.tenantId || 0}`);
        const [prodRows] = await db.execute(sql`SELECT COUNT(*) as c FROM h_products_v2 WHERE is_active = 1 AND tenant_id = ${ctx.tenantId || 0}`);
        const partnerList = await db.select().from(partners).where(eq(partners.isActive, 1));
        haccpSuppliers = (suppRows as any)[0]?.c || 0;
        haccpProducts = (prodRows as any)[0]?.c || 0;
        haccpPartners = partnerList.length;
      } catch (e) {
        console.error("[OPScore Sync] Failed to get haccp counts:", e);
      }

      return {
        opscoreConnected: opscoreStatus.connected,
        allowed: true,
        opscorePartners: opscoreStatus.partners,
        opscoreProducts: opscoreStatus.products,
        haccpSuppliers,
        haccpProducts,
        haccpPartners,
        error: opscoreStatus.error || null,
      };
    } catch (err: any) {
      return {
        opscoreConnected: false,
        allowed: false,
        error: err.message,
      };
    }
  }),

  // ============================================================
  // 4. 수동 동기화 실행
  // ============================================================

  /**
   * 수동 동기화 실행
   */
  syncNow: protectedProcedure
    .input(z.object({
      syncType: z.enum(["suppliers", "products", "all"]),
      direction: z.enum(["bidirectional", "toOpscore", "fromOpscore"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not initialized");

      // 권한 확인
      const tenantId = ctx.tenantId;
      if (ctx.user.role !== "super_admin") {
        if (!tenantId) throw new Error("테넌트 정보가 없습니다.");
        const [rows] = await db.execute(sql`
          SELECT * FROM opscore_tenant_mapping 
          WHERE haccp_tenant_id = ${tenantId} AND sync_enabled = 1 AND tenant_sync_active = 1
        `);
        const mapping = (rows as any[])[0];
        if (!mapping) {
          throw new Error("동기화 권한이 없습니다. 관리자에게 문의해주세요.");
        }
        // 동기화 타입별 권한 확인
        if (input.syncType === "suppliers" && !mapping.sync_suppliers) {
          throw new Error("거래처 동기화 권한이 없습니다.");
        }
        if (input.syncType === "products" && !mapping.sync_products) {
          throw new Error("제품 동기화 권한이 없습니다.");
        }
      }

      const direction = input.direction || "bidirectional";
      const results: any[] = [];
      const startedAt = new Date();

      try {
        // 거래처 동기화
        if (input.syncType === "suppliers" || input.syncType === "all") {
          const supplierResult = await syncSuppliers(db, direction, tenantId);
          results.push(...supplierResult);
        }

        // 제품 동기화
        if (input.syncType === "products" || input.syncType === "all") {
          const productResult = await syncProducts(db, direction, tenantId);
          results.push(...productResult);
        }

        // 동기화 로그 기록
        if (tenantId) {
          const [mappingRows] = await db.execute(sql`
            SELECT id FROM opscore_tenant_mapping WHERE haccp_tenant_id = ${tenantId}
          `);
          const mappingId = (mappingRows as any[])[0]?.id;
          if (mappingId) {
            const totalProcessed = results.reduce((sum, r) => sum + r.synced, 0);
            const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
            await db.execute(sql`
              INSERT INTO opscore_sync_logs (mapping_id, haccp_tenant_id, sync_type, sync_direction, status, records_processed, records_success, records_failed, started_at, completed_at)
              VALUES (${mappingId}, ${tenantId}, ${input.syncType}, ${direction === "bidirectional" ? "BIDIRECTIONAL" : direction === "toOpscore" ? "HACCP_TO_OPSCORE" : "OPSCORE_TO_HACCP"}, ${totalErrors > 0 ? "PARTIAL" : "SUCCESS"}, ${totalProcessed + totalErrors}, ${totalProcessed}, ${totalErrors}, ${startedAt}, NOW())
            `);
            await db.execute(sql`
              UPDATE opscore_tenant_mapping SET last_sync_at = NOW(), last_sync_status = ${totalErrors > 0 ? "PARTIAL" : "SUCCESS"}, updated_at = NOW()
              WHERE id = ${mappingId}
            `);
          }
        }

        return { success: true, results };
      } catch (err: any) {
        // 에러 로그 기록
        if (tenantId) {
          const [mappingRows] = await db.execute(sql`
            SELECT id FROM opscore_tenant_mapping WHERE haccp_tenant_id = ${tenantId}
          `);
          const mappingId = (mappingRows as any[])[0]?.id;
          if (mappingId) {
            await db.execute(sql`
              INSERT INTO opscore_sync_logs (mapping_id, haccp_tenant_id, sync_type, sync_direction, status, records_processed, records_success, records_failed, error_message, started_at, completed_at)
              VALUES (${mappingId}, ${tenantId}, ${input.syncType}, 'BIDIRECTIONAL', 'FAILED', 0, 0, 0, ${err.message}, ${startedAt}, NOW())
            `);
            await db.execute(sql`
              UPDATE opscore_tenant_mapping SET last_sync_at = NOW(), last_sync_status = 'FAILED', last_sync_error = ${err.message}, updated_at = NOW()
              WHERE id = ${mappingId}
            `);
          }
        }
        throw err;
      }
    }),

  /**
   * 동기화 로그 조회
   */
  getSyncLogs: protectedProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not initialized");

      const tid = ctx.user.role === "super_admin" ? (input.tenantId || null) : ctx.tenantId;
      
      let logs: any[];
      if (tid) {
        const [rows] = await db.execute(sql`
          SELECT l.*, m.haccp_tenant_name 
          FROM opscore_sync_logs l
          LEFT JOIN opscore_tenant_mapping m ON m.id = l.mapping_id
          WHERE l.haccp_tenant_id = ${tid}
          ORDER BY l.created_at DESC
          LIMIT ${input.limit || 20}
        `);
        logs = rows as any[];
      } else {
        const [rows] = await db.execute(sql`
          SELECT l.*, m.haccp_tenant_name 
          FROM opscore_sync_logs l
          LEFT JOIN opscore_tenant_mapping m ON m.id = l.mapping_id
          ORDER BY l.created_at DESC
          LIMIT ${input.limit || 50}
        `);
        logs = rows as any[];
      }

      return { logs };
    }),
});

// ============================================================
// 동기화 헬퍼 함수
// ============================================================

async function syncSuppliers(db: any, direction: string, tenantId: number | null) {
  const results: any[] = [];

  // ✨ 테넌트 ID 필수 검증
  if (!tenantId) {
    throw new Error('Tenant ID is required for sync operations');
  }

  // GOGOGOPICK → HACCP-ONE
  if (direction === "fromOpscore" || direction === "bidirectional") {
    try {
      const opscorePartners = await getOpscorePartners();
      let synced = 0;
      let errors = 0;
      for (const p of opscorePartners) {
        try {
          if (p.businessNumber) {
            const [existing] = await db.execute(sql`
              SELECT id FROM h_suppliers WHERE business_number = ${p.businessNumber} AND tenant_id = ${tenantId} LIMIT 1
            `);
            if ((existing as any[]).length === 0) {
              await db.execute(sql`
                INSERT INTO h_suppliers (name, business_number, contact_person, phone, email, address, is_active, tenant_id)
                VALUES (${p.name}, ${p.businessNumber}, ${p.contactPerson || null}, ${p.phone || null}, ${p.email || null}, ${p.address || null}, 1, ${tenantId})
              `);
              synced++;
            }
          }
        } catch (e) {
          errors++;
        }
      }
      results.push({ type: "거래처 (PICK→HACCP)", synced, errors, message: `${synced}건 동기화 완료` });
    } catch (e: any) {
      results.push({ type: "거래처 (PICK→HACCP)", synced: 0, errors: 1, message: e.message });
    }
  }

  // HACCP-ONE → GOGOGOPICK
  if (direction === "toOpscore" || direction === "bidirectional") {
    try {
      const { getOpscoreDb } = await import("./opscore-db");
      const opscoreDb = getOpscoreDb();
      if (!opscoreDb) throw new Error("GOGOGOPICK DB 연결 실패");

      const [haccpSuppliers] = await db.execute(sql`SELECT * FROM h_suppliers WHERE is_active = 1 AND tenant_id = ${tenantId || 0}`);
      let synced = 0;
      let errors = 0;
      for (const s of haccpSuppliers as any[]) {
        try {
          if (s.business_number) {
            const [existing] = await opscoreDb.query(
              "SELECT id FROM partners WHERE business_number = ? LIMIT 1",
              [s.business_number]
            );
            if ((existing as any[]).length === 0) {
              await opscoreDb.query(
                "INSERT INTO partners (company_name, business_number, ceo_name, phone, email, address, is_active, tenant_id, partner_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'SUPPLIER', NOW(), NOW())",
                [s.name, s.business_number, s.contact_person || null, s.phone || null, s.email || null, s.address || null]
              );
              synced++;
            }
          }
        } catch (e) {
          errors++;
        }
      }
      results.push({ type: "거래처 (HACCP→PICK)", synced, errors, message: `${synced}건 동기화 완료` });
    } catch (e: any) {
      results.push({ type: "거래처 (HACCP→PICK)", synced: 0, errors: 1, message: e.message });
    }
  }

  return results;
}

async function syncProducts(db: any, direction: string, tenantId: number | null) {
  const results: any[] = [];

  // ✨ 테넌트 ID 필수 검증
  if (!tenantId) {
    throw new Error('Tenant ID is required for sync operations');
  }

  // GOGOGOPICK → HACCP-ONE
  if (direction === "fromOpscore" || direction === "bidirectional") {
    try {
      const opscoreProducts = await getOpscoreProducts();
      let synced = 0;
      let errors = 0;
      for (const p of opscoreProducts) {
        try {
          if (p.sku) {
            const [existing] = await db.execute(sql`
              SELECT id FROM h_products_v2 WHERE product_code = ${p.sku} AND tenant_id = ${tenantId} LIMIT 1
            `);
            if ((existing as any[]).length === 0) {
              await db.execute(sql`
                INSERT INTO h_products_v2 (product_name, product_code, unit, is_active, tenant_id)
                VALUES (${p.name}, ${p.sku}, ${p.unit || 'EA'}, 1, ${tenantId})
              `);
              synced++;
            }
          }
        } catch (e) {
          errors++;
        }
      }
      results.push({ type: "제품 (PICK→HACCP)", synced, errors, message: `${synced}건 동기화 완료` });
    } catch (e: any) {
      results.push({ type: "제품 (PICK→HACCP)", synced: 0, errors: 1, message: e.message });
    }
  }

  // HACCP-ONE → GOGOGOPICK
  if (direction === "toOpscore" || direction === "bidirectional") {
    try {
      const { getOpscoreDb } = await import("./opscore-db");
      const opscoreDb = getOpscoreDb();
      if (!opscoreDb) throw new Error("GOGOGOPICK DB 연결 실패");

      const [haccpProducts] = await db.execute(sql`SELECT * FROM h_products_v2 WHERE is_active = 1 AND tenant_id = ${tenantId || 0}`);
      let synced = 0;
      let errors = 0;
      for (const p of haccpProducts as any[]) {
        try {
          if (p.product_code) {
            const [existing] = await opscoreDb.query(
              "SELECT id FROM products WHERE sku = ? LIMIT 1",
              [p.product_code]
            );
            if ((existing as any[]).length === 0) {
              await opscoreDb.query(
                "INSERT INTO products (name, sku, item_type, tenant_id, status, created_at, updated_at) VALUES (?, ?, ?, 1, 'ACTIVE', NOW(), NOW())",
                [p.product_name, p.product_code, p.unit || 'EA']
              );
              synced++;
            }
          }
        } catch (e) {
          errors++;
        }
      }
      results.push({ type: "제품 (HACCP→PICK)", synced, errors, message: `${synced}건 동기화 완료` });
    } catch (e: any) {
      results.push({ type: "제품 (HACCP→PICK)", synced: 0, errors: 1, message: e.message });
    }
  }

  return results;
}
