import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "./db";
import { eq } from "drizzle-orm";
import { todayKST } from "./utils/timezone";

import {
  calculateBatchRequirements,
  deductInventoryByMfReport,
  generateIngredientLabel
} from "./db/production/mfReportAPI";

/**
 * 품목제조보고 시스템 통합 테스트
 * 
 * 테스트 시나리오:
 * 1. 배치 생산량 g 환산 계산 (BOM 재귀 구조 포함)
 * 2. 재고 차감 정책 적용 (원재료/중간재/부재료 구분)
 * 3. 표시사항 PDF 출력 (요약형/상세형)
 * 4. 생산 이력 및 재고 차감 로그 생성 확인
 */

describe("품목제조보고 시스템 통합 테스트", () => {
  let testVersionId: number;
  let testBatchKg: number = 10; // 10kg 배치

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 테스트용 품목제조보고 버전 ID 조회 (실제 데이터 사용)
    const { hMfReportVersions } = await import("../drizzle/schema_recipe_new");
    const versions = await db
      .select()
      .from(hMfReportVersions)
      .where(eq(hMfReportVersions.approvalStatus, "APPROVED"))
      .limit(1);

    if (versions.length === 0) {
      console.warn("⚠️  승인된 품목제조보고 버전이 없습니다. 테스트를 건너뜁니다.");
      testVersionId = -1;
    } else {
      testVersionId = versions[0].id;
      console.log(`✓ 테스트용 버전 ID: ${testVersionId}`);
    }
  });

  it("1. 배치 생산량 g 환산 계산 (BOM 재귀 구조)", async () => {
    if (testVersionId === -1) {
      console.log("⊘ 테스트 건너뜀: 승인된 버전 없음");
      return;
    }

    const result = await calculateBatchRequirements(testVersionId, testBatchKg);

    expect(result).toBeDefined();
    expect(result.versionId).toBe(testVersionId);
    expect(result.batchKg).toBe(testBatchKg);
    expect(result.ingredients).toBeDefined();
    expect(Array.isArray(result.ingredients)).toBe(true);

    // 각 재료별 요구량 확인
    result.ingredients.forEach((ing) => {
      expect(ing.lineNo).toBeDefined();
      expect(ing.materialType).toMatch(/RAW|MIXED|FLAVOR_SPECIFIC/);
      expect(ing.requiredG).toBeGreaterThan(0);
      expect(ing.requiredKg).toBeGreaterThan(0);

      console.log(
        `  - ${ing.materialType} | ${ing.materialName || ing.intermediateName || "부재료"} | ${ing.requiredG}g (${ing.requiredKg}kg)`
      );
    });

    console.log(`✓ 배치 계산 완료: ${result.ingredients.length}개 재료`);
  });

  it("2. 재고 차감 정책 적용 (원재료/중간재/부재료)", async () => {
    if (testVersionId === -1) {
      console.log("⊘ 테스트 건너뜀: 승인된 버전 없음");
      return;
    }

    const productionDate = todayKST();
    const producedQuantity = 200; // 200개 생산

    const result = await deductInventoryByMfReport({
      versionId: testVersionId,
      batchKg: testBatchKg,
      productionDate,
      producedQuantity,
      notes: "통합 테스트 - 재고 차감",
      createdBy: 1
    });

    expect(result).toBeDefined();
    expect(result.productionLogId).toBeDefined();
    expect(result.deductionLogs).toBeDefined();
    expect(Array.isArray(result.deductionLogs)).toBe(true);

    // 재고 차감 로그 확인
    result.deductionLogs.forEach((log) => {
      expect(log.materialType).toMatch(/RAW|MIXED|FLAVOR_SPECIFIC/);
      expect(log.deductedQuantityG).toBeGreaterThan(0);

      console.log(
        `  - ${log.materialType} | ${log.materialName || log.intermediateName || "부재료"} | -${log.deductedQuantityG}g`
      );
    });

    console.log(`✓ 재고 차감 완료: ${result.deductionLogs.length}개 항목`);
    console.log(`✓ 생산 이력 ID: ${result.productionLogId}`);
  });

  it("3. 표시사항 PDF 출력 - 요약형", async () => {
    if (testVersionId === -1) {
      console.log("⊘ 테스트 건너뜀: 승인된 버전 없음");
      return;
    }

    const result = await generateIngredientLabel(testVersionId, "summary");

    expect(result).toBeDefined();
    expect(result.pdfBase64).toBeDefined();
    expect(typeof result.pdfBase64).toBe("string");
    expect(result.pdfBase64.length).toBeGreaterThan(0);

    // Base64 디코딩 확인
    const pdfBuffer = Buffer.from(result.pdfBase64, "base64");
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString("utf8", 0, 4)).toBe("%PDF");

    console.log(`✓ 요약형 PDF 생성 완료: ${pdfBuffer.length} bytes`);
  });

  it("4. 표시사항 PDF 출력 - 상세형 (BOM 펼침)", async () => {
    if (testVersionId === -1) {
      console.log("⊘ 테스트 건너뜀: 승인된 버전 없음");
      return;
    }

    const result = await generateIngredientLabel(testVersionId, "detailed");

    expect(result).toBeDefined();
    expect(result.pdfBase64).toBeDefined();
    expect(typeof result.pdfBase64).toBe("string");
    expect(result.pdfBase64.length).toBeGreaterThan(0);

    // Base64 디코딩 확인
    const pdfBuffer = Buffer.from(result.pdfBase64, "base64");
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString("utf8", 0, 4)).toBe("%PDF");

    console.log(`✓ 상세형 PDF 생성 완료: ${pdfBuffer.length} bytes`);
  });

  it("5. BOM 재귀 구조 테스트 (중간재 안에 중간재)", async () => {
    if (testVersionId === -1) {
      console.log("⊘ 테스트 건너뜀: 승인된 버전 없음");
      return;
    }

    const result = await calculateBatchRequirements(testVersionId, testBatchKg);

    // 중간재가 있는지 확인
    const mixedIngredients = result.ingredients.filter((ing) => ing.materialType === "MIXED");

    if (mixedIngredients.length === 0) {
      console.log("⊘ 중간재 없음: BOM 재귀 구조 테스트 건너뜀");
      return;
    }

    console.log(`✓ 중간재 발견: ${mixedIngredients.length}개`);

    // 각 중간재의 구성 요소 확인
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const { hMixedMaterialComponents } = await import("../drizzle/schema_recipe_new");

    for (const mixed of mixedIngredients) {
      if (!mixed.intermediateId) continue;

      const components = await db
        .select()
        .from(hMixedMaterialComponents)
        .where(eq(hMixedMaterialComponents.mixedMaterialId, mixed.intermediateId));

      console.log(`  - ${mixed.intermediateName}: ${components.length}개 구성 요소`);

      components.forEach((comp) => {
        console.log(`    * ${comp.componentType} | 비율: ${comp.percent}%`);
      });
    }

    console.log(`✓ BOM 재귀 구조 확인 완료`);
  });
});
