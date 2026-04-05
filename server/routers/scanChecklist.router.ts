/**
 * 스캔 체크리스트 라우터
 * 
 * 워크플로우:
 * 1. upload: 스캔 이미지/PDF 업로드 → 로컬 임시 저장
 * 2. process: OCR + AI 구조화 → JSON 변환
 * 3. confirm: 사용자 확인/수정 후 → 기존 체크리스트 DB에 저장
 * 4. cleanup: 7일 경과 파일 자동 삭제
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../_core/trpc";
import { saveScanFile, deleteScanFile, cleanupExpiredScans, getScanStorageInfo, readScanFile } from "../lib/scanStorage";
import { ocrAndStructure } from "../lib/scanOcr";
import { TRPCError } from "@trpc/server";
import path from "path";
import fs from "fs";

export const scanChecklistRouter = router({
  // ── 1. 스캔 파일 업로드 (Base64) ──
  upload: tenantRequiredProcedure
    .input(z.object({
      fileName: z.string(),
      fileBase64: z.string(), // Base64 인코딩된 파일
      checklistType: z.string().default("general"),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");

      // 파일 크기 제한 (20MB)
      if (buffer.length > 20 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "파일 크기는 20MB 이하만 가능합니다." });
      }

      // 허용 확장자
      const ext = path.extname(input.fileName).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".pdf", ".webp", ".gif"].includes(ext)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "JPG, PNG, PDF, WEBP 파일만 업로드 가능합니다." });
      }

      const result = saveScanFile(ctx.tenantId, input.fileName, buffer);

      return {
        success: true,
        key: result.key,
        fileName: result.fileName,
        fileSizeKB: Math.round(buffer.length / 1024),
        checklistType: input.checklistType,
      };
    }),

  // ── 2. OCR 처리 (업로드된 파일 → JSON 변환) ──
  process: tenantRequiredProcedure
    .input(z.object({
      key: z.string(),
      checklistType: z.string().default("general"),
    }))
    .mutation(async ({ ctx, input }) => {
      const SCAN_DIR = process.env.SCAN_DIR || "/home/root/haccp_v3/uploads/scans";
      const filePath = path.join(SCAN_DIR, input.key);

      if (!fs.existsSync(filePath)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "스캔 파일을 찾을 수 없습니다. 다시 업로드해주세요." });
      }

      const result = await ocrAndStructure(filePath, input.checklistType);

      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "OCR 처리 실패" });
      }

      return {
        success: true,
        key: input.key,
        checklistType: input.checklistType,
        structuredData: result.structuredData,
        confidence: result.confidence,
        rawText: result.rawText,
      };
    }),

  // ── 3. 확인 후 저장 (기존 체크리스트 시스템에 입력) ──
  confirm: tenantRequiredProcedure
    .input(z.object({
      key: z.string(),
      checklistType: z.string(),
      formData: z.any(), // OCR 결과를 사용자가 수정한 최종 데이터
      deleteAfterSave: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();

      // generic_checklist 테이블에 저장
      const data = input.formData;
      const [result] = await conn.execute<any>(
        `INSERT INTO generic_checklists (
          tenant_id, form_type, form_date, title, form_data, 
          status, created_by, created_at, source
        ) VALUES (?, ?, ?, ?, ?, 'completed', ?, NOW(), 'scan_ocr')`,
        [
          ctx.tenantId,
          input.checklistType,
          data.formDate || new Date().toISOString().slice(0, 10),
          data.title || `스캔 입력 - ${input.checklistType}`,
          JSON.stringify(data),
          ctx.user.id,
        ]
      );

      // 저장 후 스캔 파일 삭제
      if (input.deleteAfterSave) {
        deleteScanFile(input.key);
      }

      return {
        success: true,
        checklistId: result.insertId,
        message: "스캔 데이터가 체크리스트로 저장되었습니다.",
      };
    }),

  // ── 테넌트별 스캔 양식 관리 ──
  saveTemplate: tenantRequiredProcedure
    .input(z.object({
      checklistType: z.string(),
      templateName: z.string(),
      fields: z.array(z.object({
        fieldName: z.string(),
        fieldLabel: z.string(),
        type: z.enum(["text", "check", "number", "date", "select"]),
        options: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();
      await conn.execute(
        `INSERT INTO h_scan_templates (tenant_id, checklist_type, template_name, fields, created_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE template_name = VALUES(template_name), fields = VALUES(fields)`,
        [ctx.tenantId, input.checklistType, input.templateName, JSON.stringify(input.fields), ctx.user.id]
      );
      return { success: true };
    }),

  listTemplates: tenantRequiredProcedure.query(async ({ ctx }) => {
    const { getRawConnection } = await import("../db");
    const conn = await getRawConnection();
    const [rows] = await conn.execute<any[]>(
      "SELECT * FROM h_scan_templates WHERE tenant_id = ? ORDER BY checklist_type",
      [ctx.tenantId]
    );
    return rows.map((r: any) => ({ ...r, fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields }));
  }),

  getTemplate: tenantRequiredProcedure
    .input(z.object({ checklistType: z.string() }))
    .query(async ({ ctx, input }) => {
      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();
      const [rows] = await conn.execute<any[]>(
        "SELECT * FROM h_scan_templates WHERE tenant_id = ? AND checklist_type = ?",
        [ctx.tenantId, input.checklistType]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return { ...r, fields: typeof r.fields === "string" ? JSON.parse(r.fields) : r.fields };
    }),

  deleteTemplate: tenantRequiredProcedure
    .input(z.object({ checklistType: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();
      await conn.execute("DELETE FROM h_scan_templates WHERE tenant_id = ? AND checklist_type = ?", [ctx.tenantId, input.checklistType]);
      return { success: true };
    }),

  // ── 저장소 현황 (관리자) ──
  getStorageInfo: tenantRequiredProcedure.query(async () => {
    return getScanStorageInfo();
  }),

  // ── 7일 경과 파일 정리 (관리자/스케줄러) ──
  cleanup: tenantRequiredProcedure.mutation(async () => {
    const result = cleanupExpiredScans();
    return { ...result, message: `${result.deleted}건 삭제, ${result.errors}건 오류` };
  }),
});
