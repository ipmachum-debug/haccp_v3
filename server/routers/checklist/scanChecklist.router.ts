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
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { saveScanFile, deleteScanFile, cleanupExpiredScans, getScanStorageInfo, readScanFile } from "../../lib/scanStorage";
import { ocrAndStructure, enhancedOcrAndStructure } from "../../lib/scanOcr";
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
  // PR-AH-2026-05-27: 상세 로깅 + 에러 핸들링 강화
  process: tenantRequiredProcedure
    .input(z.object({
      key: z.string(),
      checklistType: z.string().default("general"),
    }))
    .mutation(async ({ ctx, input }) => {
      const t0 = Date.now();
      const requestId = `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const SCAN_DIR = process.env.SCAN_DIR || "/home/root/haccp_v3/uploads/scans";
      const filePath = path.join(SCAN_DIR, input.key);

      // ─── 1) 파일 존재 + 크기 확인 ───
      if (!fs.existsSync(filePath)) {
        console.error(`[scanChecklist.process] [${requestId}] 파일 없음: ${filePath}`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `스캔 파일을 찾을 수 없습니다. 다시 업로드해주세요. (key=${input.key})`,
        });
      }

      let fileSizeBytes = 0;
      try {
        fileSizeBytes = fs.statSync(filePath).size;
      } catch {}

      const fileExt = path.extname(filePath).toLowerCase();
      console.log(
        `[scanChecklist.process] [${requestId}] 시작 — tenant=${ctx.tenantId} type=${input.checklistType} ` +
          `file=${input.key} ext=${fileExt} size=${Math.round(fileSizeBytes / 1024)}KB`,
      );

      // ─── 2) OCR 실행 ───
      let result: Awaited<ReturnType<typeof enhancedOcrAndStructure>>;
      try {
        result = await enhancedOcrAndStructure(filePath, input.checklistType, {
          enableTwoPass: true,
          enablePreprocessing: true,
          enableAutoClassify: true, // ★ PR-AT: 양식 자동 분류
        });
      } catch (err: any) {
        // OCR 함수 자체에서 throw된 경우 (보통은 잡지만 안전망)
        const elapsedMs = Date.now() - t0;
        const errMsg = err?.message || String(err);
        console.error(
          `[scanChecklist.process] [${requestId}] OCR 예외 (${elapsedMs}ms): ${errMsg}`,
          err?.stack,
        );

        // OpenAI API 에러 구분
        if (errMsg.includes("OPENAI_API_KEY") || errMsg.includes("API 키")) {
          // PR-AI: 진단 정보를 함께 반환
          try {
            const { findApiKeyWithDiagnostics } = await import("../../_core/env");
            const diag = findApiKeyWithDiagnostics();
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                `[${requestId}] OpenAI/Forge API 키 설정 누락. ` +
                `process.env(OPENAI=${diag.processEnv.OPENAI}, FORGE=${diag.processEnv.FORGE}, ` +
                `BUILT_IN_FORGE=${diag.processEnv.BUILT_IN_FORGE}), source=${diag.source}. ` +
                `서버 .env 파일 또는 PM2 환경에 키를 설정해주세요.`,
            });
          } catch (e: any) {
            if (e instanceof TRPCError) throw e;
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `[${requestId}] OpenAI API 키가 서버에 설정되지 않았습니다. 관리자에게 문의하세요.`,
            });
          }
        }
        if (errMsg.toLowerCase().includes("timeout") || err?.code === "ETIMEDOUT") {
          throw new TRPCError({
            code: "TIMEOUT",
            message: `[${requestId}] OCR 처리 시간 초과 (${Math.round(elapsedMs / 1000)}초). PDF 페이지 수를 줄이거나 더 작은 파일로 시도해주세요.`,
          });
        }
        if (err?.status === 429 || errMsg.includes("rate limit") || errMsg.includes("429")) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `[${requestId}] OpenAI API 호출 한도 초과. 잠시 후 다시 시도해주세요.`,
          });
        }
        if (err?.status === 401 || errMsg.includes("Incorrect API key") || errMsg.toLowerCase().includes("invalid api key")) {
          // PR-AI: 키는 있지만 잘못된 키인 경우 → 진단 정보 포함
          try {
            const { findApiKeyWithDiagnostics } = await import("../../_core/env");
            const diag = findApiKeyWithDiagnostics();
            const keyPreview = diag.key ? `${diag.key.slice(0, 7)}***(len=${diag.key.length})` : "(empty)";
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                `[${requestId}] OpenAI/Forge API 키 인증 실패. ` +
                `사용된 키: ${keyPreview}, source=${diag.source}, ` +
                `proxy=${!!(process.env.BUILT_IN_FORGE_API_URL || "").trim()}. ` +
                `키가 만료/취소되었거나, 운영 환경에서 BUILT_IN_FORGE_API_URL과 매칭되지 않는 키일 수 있습니다.`,
            });
          } catch (e: any) {
            if (e instanceof TRPCError) throw e;
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `[${requestId}] OpenAI API 키 인증 실패. 키가 만료되었거나 잘못된 키입니다.`,
            });
          }
        }
        if (err?.status === 400 && errMsg.toLowerCase().includes("image")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `[${requestId}] OpenAI가 이미지를 인식할 수 없습니다. PDF가 손상되었거나 변환 실패일 수 있습니다. (${errMsg.slice(0, 200)})`,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `[${requestId}] OCR 처리 중 예기치 못한 오류: ${errMsg.slice(0, 300)}`,
        });
      }

      const elapsedMs = Date.now() - t0;

      // ─── 3) OCR 결과 검증 ───
      if (!result.success) {
        console.error(
          `[scanChecklist.process] [${requestId}] OCR 실패 (${elapsedMs}ms): ${result.error}`,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `[${requestId}] ${result.error || "OCR 처리 실패"}`,
        });
      }

      console.log(
        `[scanChecklist.process] [${requestId}] 성공 (${elapsedMs}ms) — ` +
          `pages=${result.pages} confidence=${result.overallConfidence.toFixed(2)} ` +
          `lowConf=${result.lowConfidenceFields.length}`,
      );

      // ★ PR-AT: 자동 분류로 타입이 교체되면 effectiveChecklistType 을 감지값으로.
      //   클라이언트는 effectiveChecklistType 으로 양식지 레지스트리를 조회.
      const effectiveChecklistType =
        result.classification?.overridden && result.classification.detectedType
          ? result.classification.detectedType
          : input.checklistType;

      return {
        success: true,
        key: input.key,
        checklistType: input.checklistType,
        effectiveChecklistType,
        classification: result.classification,
        structuredData: result.structuredData,
        confidence: result.overallConfidence,
        rawText: result.rawText,
        // 강화 필드 (v2)
        pages: result.pages,
        fields: result.fields,
        lowConfidenceFields: result.lowConfidenceFields,
        // PR-AH: 진단 정보
        _diagnostic: {
          requestId,
          elapsedMs,
          fileSizeBytes,
          fileExt,
        },
      };
    }),

  // ── 2.5 과거 데이터 기반 검증 (저장 전 호출) ──
  validate: tenantRequiredProcedure
    .input(z.object({
      checklistType: z.string(),
      formData: z.any(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { validateCcpData } = await import("../../lib/scanDocMapper");

      if (["ccp_record", "ccp_1b", "ccp_2b", "ccp_4p"].includes(input.checklistType)) {
        return await validateCcpData(ctx.tenantId, input.checklistType, input.formData);
      }

      // 매입전표 검증
      if (input.checklistType === "purchase_invoice") {
        const { getRawConnection } = await import("../../db");
        const conn = await getRawConnection();
        // validatePurchaseData는 scanDocMapper 내부 함수이므로 mapAndSave에서 처리됨
        // 여기서는 기본 형식 검증만 수행
        const items = input.formData?.items || [];
        const warnings: { field: string; message: string; severity: string }[] = [];
        for (const item of items) {
          if (!item.itemName && !item.name) warnings.push({ field: "품목명", message: "품목명이 비어있습니다", severity: "high" });
          if ((Number(item.quantity) || 0) <= 0) warnings.push({ field: `${item.itemName || "품목"} 수량`, message: "수량이 0 이하입니다", severity: "high" });
        }
        return { isValid: warnings.filter((w: any) => w.severity === "high").length === 0, warnings };
      }

      return { isValid: true, warnings: [] };
    }),

  // ── 3. 확인 후 저장 (문서 타입별 자동 매핑) ──
  // 교육훈련일지 → h_training_logs
  // CCP 기록지 → h_ccp_form_records
  // 검사기록 → h_inspections
  // 매입전표 → accounting_purchases
  // 범용 체크리스트 → h_generic_checklist_records
  confirm: tenantRequiredProcedure
    .input(z.object({
      key: z.string(),
      checklistType: z.string(),
      formData: z.any(),
      deleteAfterSave: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const { mapAndSave } = await import("../../lib/scanDocMapper");

      const result = await mapAndSave(
        ctx.tenantId,
        ctx.user.id,
        (ctx.user.siteId || ctx.tenantId) as number,
        input.checklistType,
        input.formData
      );

      // 저장 후 스캔 파일 삭제
      if (input.deleteAfterSave) {
        deleteScanFile(input.key);
      }

      return {
        success: result.success,
        checklistId: result.insertedId,
        targetTable: result.targetTable,
        mappedFields: result.mappedFields,
        unmappedFields: result.unmappedFields,
        warnings: result.warnings || [],
        message: result.message,
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
      const { getRawConnection } = await import("../../db");
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
    const { getRawConnection } = await import("../../db");
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
      const { getRawConnection } = await import("../../db");
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
      const { getRawConnection } = await import("../../db");
      const conn = await getRawConnection();
      await conn.execute("DELETE FROM h_scan_templates WHERE tenant_id = ? AND checklist_type = ?", [ctx.tenantId, input.checklistType]);
      return { success: true };
    }),

  // ── 빈 양식지 PDF 다운로드 (PR-AS-blank, 2026-05-28) ──
  // 사용자가 시스템에서 빈 CCP 양식지를 다운받아 인쇄 → 현장 수기 기입 →
  // 스캔 업로드 시 OCR 가 양식 레이아웃 인지하여 정확히 추출.
  downloadBlankForm: tenantRequiredProcedure
    .input(z.object({
      ccpType: z.enum(["ccp_1b", "ccp_2b", "ccp_3b", "ccp_4p"]),
    }))
    .mutation(async ({ input }) => {
      const { generateBlankFormPdf } = await import("../../lib/blankFormPdf");
      try {
        const buf = await generateBlankFormPdf(input.ccpType);
        return {
          success: true,
          fileName: `${input.ccpType.toUpperCase()}_빈양식지.pdf`,
          mimeType: "application/pdf",
          base64: buf.toString("base64"),
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `빈 양식지 PDF 생성 실패: ${err?.message || String(err)}`,
        });
      }
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
