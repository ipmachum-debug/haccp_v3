/**
 * Millio AI <-> GOGOGOPICK 양방향 동기화 라우터
 * ✅ P0 FIX: tenantId fallback (||0, ||1) 제거, 테넌트 격리 강화
 * 
 * 기능:
 * 1. 슈퍼관리자: 테넌트별 동기화 기능 부여/차단 + 테넌트 매칭 관리
 * 2. 테넌트 관리자: 자기 테넌트 동기화 사용 여부 설정 및 실행
 * 3. 양방향 동기화: 거래처, 제품
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, superAdminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { partners } from "../drizzle/schema/schema_main";
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
   * ✅ P0 FIX: superAdminProcedure로 변경
   */
  getAllMappings: superAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB not initialized");

    const [mappings] = await db.execute(sql`
      SELECT m.*, t.slug as haccp_slug, t.status as haccp_status
      FROM opscore_tenant_mapping m
      LEFT JOIN tenants t ON t.id = m.haccp_tenant_id
      ORDER BY m.haccp_tenant_id
    `);

    let opscoreTenants: any[] = [];
    try {
      const opscoreStatus = await testOpscoreConnection();
      if (opscoreStatus.connected) {
        const opscoreDb = getOpscorePool();
        if (opscoreDb) {
          const [rows] = await opscoreDb.query("SELECT id, name, code, status FROM tenants WHERE deleted_at IS NULL ORDER BY id");
          opscoreTenants = rows as unknown as any[];
        }
      }
    } catch (e) {
      console.error("[OPScore Sync] Failed to get opscore tenants:", e);
    }

    return {
      mappings: mappings as unknown as any[],
      opscoreTenants,
    };
  }),

  /**
   * 테넌트 매핑 업데이트 (슈퍼관리자 전용)
   * ✅ P0 FIX: superAdminProcedure로 변경
   */
  updateMapping: superAdminProcedure
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
      const db = await getDb();
      if (!db) throw new Error("DB not initialized");

      if (input.mappingId === 0) {
        if (!input.haccp_tenant_id) {
          throw new Error("haccp_tenant_id가 필요합니다.");
        }
        await db.execute(sql`
          INSERT INTO opscore_tenant_mapping (
            haccp_tenant_id, opscore_tenant_id, opscore_tenant_name,
            sync_enabled, sync_suppliers, sync_products, sync_materials,
            sync_orders, sync_inventory, sync_accounting, created_at, updated_at
          ) VALUES (
            ${input.haccp_tenant_id}, ${input.opscore_tenant_id}, ${input.opscore_tenant_name},
            ${input.sync_enabled ? 1 : 0}, ${input.sync_suppliers !== false ? 1 : 0},
            ${input.sync_products !== false ? 1 : 0}, ${input.sync_materials ? 1 : 0},
            ${input.sync_orders ? 1 : 0}, ${input.sync_inventory ? 1 : 0},
            ${input.sync_accounting ? 1 : 0}, NOW(), NOW()
          )
        `);
      } else {
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
   * ✅ P0 FIX: tenantRequiredProcedure 사용
   */
  getMyMapping: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB not initialized");

    const tenantId = ctx.tenantId;

    const [rows] = await db.execute(sql`
      SELECT * FROM opscore_tenant_mapping WHERE haccp_tenant_id = ${tenantId}
    `);
    const mapping = (rows as unknown as any[])[0] || null;

    return {
      mapping,
      allowed: mapping?.sync_enabled === 1,
    };
  }),

  /**
   * 테넌트 관리자가 동기화 사용 여부 토글
   * ✅ P0 FIX: tenantRequiredProcedure 사용
   */
  toggleTenantSync: tenantRequiredProcedure
    .input(z.object({ active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
        throw new Error("관리자만 설정할 수 있습니다.");
      }
      const db = await getDb();
      if (!db) throw new Error("DB not initialized");

      const tenantId = ctx.tenantId;

      const [rows] = await db.execute(sql`
        SELECT sync_enabled FROM opscore_tenant_mapping WHERE haccp_tenant_id = ${tenantId}
      `);
      const mapping = (rows as unknown as any[])[0];
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
   * ✅ P0 FIX: tenantRequiredProcedure + tenantId fallback 제거
   */
  getStatus: tenantRequiredProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) throw new Error("Millio AI DB not initialized");

      const tenantId = ctx.tenantId;

      // 테넌트 관리자인 경우 권한 확인
      if (ctx.user.role !== "super_admin") {
        const [rows] = await db.execute(sql`
          SELECT sync_enabled, tenant_sync_active FROM opscore_tenant_mapping 
          WHERE haccp_tenant_id = ${tenantId}
        `);
        const mapping = (rows as unknown as any[])[0];
        if (!mapping || mapping.sync_enabled !== 1) {
          return {
            opscoreConnected: false,
            allowed: false,
            error: "연동 서비스가 활성화되지 않았습니다.",
          };
        }
      }

      const opscoreStatus = await getOpsCoreSyncStatus();

      // ✅ P0 FIX: tenantId || 0 제거 → tenantId 직접 사용
      let haccpSuppliers = 0;
      let haccpProducts = 0;
      let haccpPartners = 0;
      try {
        const [suppRows] = await db.execute(sql`SELECT COUNT(*) as c FROM h_suppliers WHERE is_active = 1 AND tenant_id = ${tenantId}`);
        const [prodRows] = await db.execute(sql`SELECT COUNT(*) as c FROM h_products_v2 WHERE is_active = 1 AND tenant_id = ${tenantId}`);
        // ✅ P0 FIX: partners 테이블도 tenantId 필터 적용
        const [partnerRows] = await db.execute(sql`SELECT COUNT(*) as c FROM partners WHERE is_active = 1 AND tenant_id = ${tenantId}`);
        haccpSuppliers = (suppRows as any)[0]?.c || 0;
        haccpProducts = (prodRows as any)[0]?.c || 0;
        haccpPartners = (partnerRows as any)[0]?.c || 0;
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
   * ✅ P0 FIX: tenantRequiredProcedure 사용, tenantId 필수
   */
  syncNow: tenantRequiredProcedure
    .input(z.object({
      syncType: z.enum(["suppliers", "products", "all"]),
      direction: z.enum(["bidirectional", "toOpscore", "fromOpscore"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not initialized");

      const tenantId = ctx.tenantId;
      
      if (ctx.user.role !== "super_admin") {
        const [rows] = await db.execute(sql`
          SELECT * FROM opscore_tenant_mapping 
          WHERE haccp_tenant_id = ${tenantId} AND sync_enabled = 1 AND tenant_sync_active = 1
        `);
        const mapping = (rows as unknown as any[])[0];
        if (!mapping) {
          throw new Error("동기화 권한이 없습니다. 관리자에게 문의해주세요.");
        }
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

      // ✅ P0 FIX: OPScore 측 매핑된 tenant_id 조회 (하드코딩 1 제거)
      let opscore_tenant_id: number | null = null;
      try {
        const [mappingRows] = await db.execute(sql`
          SELECT opscore_tenant_id FROM opscore_tenant_mapping WHERE haccp_tenant_id = ${tenantId}
        `);
        opscore_tenant_id = (mappingRows as unknown as any[])[0]?.opscore_tenant_id || null;
      } catch (e) {
        console.error("[OPScore Sync] Failed to get opscore tenant mapping:", e);
      }

      try {
        if (input.syncType === "suppliers" || input.syncType === "all") {
          const supplierResult = await syncSuppliers(db, direction, tenantId, opscore_tenant_id);
          results.push(...supplierResult);
        }

        if (input.syncType === "products" || input.syncType === "all") {
          const productResult = await syncProducts(db, direction, tenantId, opscore_tenant_id);
          results.push(...productResult);
        }

        // 동기화 로그 기록
        const [mappingLogRows] = await db.execute(sql`
          SELECT id FROM opscore_tenant_mapping WHERE haccp_tenant_id = ${tenantId}
        `);
        const mappingId = (mappingLogRows as unknown as any[])[0]?.id;
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

        return { success: true, results };
      } catch (err: any) {
        const [mappingErrRows] = await db.execute(sql`
          SELECT id FROM opscore_tenant_mapping WHERE haccp_tenant_id = ${tenantId}
        `);
        const mappingId = (mappingErrRows as unknown as any[])[0]?.id;
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
        throw err;
      }
    }),

  /**
   * 동기화 로그 조회
   * ✅ P0 FIX: 슈퍼관리자는 전체/특정 테넌트, 일반은 자기 테넌트만
   */
  getSyncLogs: tenantRequiredProcedure
    .input(z.object({
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not initialized");

      // ✅ P0 FIX: 일반 사용자는 자기 테넌트만, 슈퍼관리자도 ctx.tenantId 기반
      const tid = ctx.tenantId;
      
      const [rows] = await db.execute(sql`
        SELECT l.*, m.haccp_tenant_name 
        FROM opscore_sync_logs l
        LEFT JOIN opscore_tenant_mapping m ON m.id = l.mapping_id
        WHERE l.haccp_tenant_id = ${tid}
        ORDER BY l.created_at DESC
        LIMIT ${input.limit || 20}
      `);
      
      return { logs: rows as unknown as any[] };
    }),

  /**
   * 슈퍼관리자 전용: 전체 동기화 로그 조회
   */
  getAllSyncLogs: superAdminProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not initialized");

      let logs: any[];
      if (input.tenantId) {
        const [rows] = await db.execute(sql`
          SELECT l.*, m.haccp_tenant_name 
          FROM opscore_sync_logs l
          LEFT JOIN opscore_tenant_mapping m ON m.id = l.mapping_id
          WHERE l.haccp_tenant_id = ${input.tenantId}
          ORDER BY l.created_at DESC
          LIMIT ${input.limit || 20}
        `);
        logs = rows as unknown as any[];
      } else {
        const [rows] = await db.execute(sql`
          SELECT l.*, m.haccp_tenant_name 
          FROM opscore_sync_logs l
          LEFT JOIN opscore_tenant_mapping m ON m.id = l.mapping_id
          ORDER BY l.created_at DESC
          LIMIT ${input.limit || 50}
        `);
        logs = rows as unknown as any[];
      }

      return { logs };
    }),
});

// ============================================================
// 동기화 헬퍼 함수
// ✅ P0 FIX: tenantId 필수, opscore_tenant_id 매핑 기반
// ============================================================

async function syncSuppliers(db: any, direction: string, tenantId: number, opscore_tenant_id: number | null) {
  const results: any[] = [];

  // GOGOGOPICK -> Millio AI
  if (direction === "fromOpscore" || direction === "bidirectional") {
    try {
      const opscorePartners = await getOpscorePartners();
      let synced = 0;
      let errors = 0;
      for (const p of opscorePartners) {
        try {
          if (p.business_number) {
            const [existing] = await db.execute(sql`
              SELECT id FROM h_suppliers WHERE business_number = ${p.business_number} AND tenant_id = ${tenantId} LIMIT 1
            `);
            if ((existing as unknown as any[]).length === 0) {
              await db.execute(sql`
                INSERT INTO h_suppliers (name, business_number, contact_person, phone, email, address, is_active, tenant_id)
                VALUES (${p.company_name}, ${p.business_number}, ${p.ceo_name || null}, ${p.phone || null}, ${p.email || null}, ${p.address || null}, 1, ${tenantId})
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

  // Millio AI -> GOGOGOPICK
  if (direction === "toOpscore" || direction === "bidirectional") {
    try {
      const { getOpscoreDb } = await import("./opscore-db");
      const opscoreDb = getOpscoreDb();
      if (!opscoreDb) throw new Error("GOGOGOPICK DB 연결 실패");

      // ✅ P0 FIX: tenantId 직접 사용 (|| 0 제거)
      const [haccpSuppliers] = await db.execute(sql`SELECT * FROM h_suppliers WHERE is_active = 1 AND tenant_id = ${tenantId}`);
      let synced = 0;
      let errors = 0;
      
      // ✅ P0 FIX: opscore 측 tenant_id에 매핑된 값 사용 (하드코딩 1 제거)
      const targetOpsId = opscore_tenant_id || tenantId; // fallback to haccp tenantId
      
      for (const s of haccpSuppliers as unknown as any[]) {
        try {
          if (s.business_number) {
            const [existing] = await opscoreDb.query(
              "SELECT id FROM partners WHERE business_number = ? LIMIT 1",
              [s.business_number]
            );
            if ((existing as unknown as any[]).length === 0) {
              await opscoreDb.query(
                "INSERT INTO partners (company_name, business_number, ceo_name, phone, email, address, is_active, tenant_id, partner_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'SUPPLIER', NOW(), NOW())",
                [s.name, s.business_number, s.contact_person || null, s.phone || null, s.email || null, s.address || null, targetOpsId]
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

async function syncProducts(db: any, direction: string, tenantId: number, opscore_tenant_id: number | null) {
  const results: any[] = [];

  // GOGOGOPICK -> Millio AI
  if (direction === "fromOpscore" || direction === "bidirectional") {
    try {
      const opscoreProducts = await getOpscoreProducts();
      let synced = 0;
      let errors = 0;
      // ★ 2026-05-08 (PR #268): h_products_v2 INSERT 후 item_master 도 sync — canonical 정책
      const { syncProductToItemMaster } = await import("./db/production/itemMasterSync.js");
      for (const p of opscoreProducts) {
        try {
          if (p.sku) {
            const [existing] = await db.execute(sql`
              SELECT id FROM h_products_v2 WHERE product_code = ${p.sku} AND tenant_id = ${tenantId} LIMIT 1
            `);
            if ((existing as unknown as any[]).length === 0) {
              const [insertResult] = await db.execute(sql`
                INSERT INTO h_products_v2 (product_name, product_code, unit, is_active, tenant_id)
                VALUES (${p.name}, ${p.sku}, ${(p as any).unit || 'EA'}, 1, ${tenantId})
              `);
              const newProductId = (insertResult as any)?.insertId;
              if (newProductId) {
                await syncProductToItemMaster(db as any, {
                  tenantId,
                  productId: newProductId,
                  productCode: p.sku,
                  productName: p.name,
                  unit: (p as any).unit || "EA",
                  isActive: 1,
                });
              }
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

  // Millio AI -> GOGOGOPICK
  if (direction === "toOpscore" || direction === "bidirectional") {
    try {
      const { getOpscoreDb } = await import("./opscore-db");
      const opscoreDb = getOpscoreDb();
      if (!opscoreDb) throw new Error("GOGOGOPICK DB 연결 실패");

      // ✅ P0 FIX: tenantId 직접 사용 (|| 0 제거)
      const [haccpProducts] = await db.execute(sql`SELECT * FROM h_products_v2 WHERE is_active = 1 AND tenant_id = ${tenantId}`);
      let synced = 0;
      let errors = 0;
      
      // ✅ P0 FIX: opscore 측 tenant_id에 매핑된 값 사용 (하드코딩 1 제거)
      const targetOpsId = opscore_tenant_id || tenantId;
      
      for (const p of haccpProducts as unknown as any[]) {
        try {
          if (p.product_code) {
            const [existing] = await opscoreDb.query(
              "SELECT id FROM products WHERE sku = ? LIMIT 1",
              [p.product_code]
            );
            if ((existing as unknown as any[]).length === 0) {
              await opscoreDb.query(
                "INSERT INTO products (name, sku, item_type, tenant_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'ACTIVE', NOW(), NOW())",
                [p.product_name, p.product_code, p.unit || 'EA', targetOpsId]
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
