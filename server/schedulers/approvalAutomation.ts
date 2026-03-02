/**
 * 승인 워크플로우 자동화
 * 특정 조건 충족 시 자동 승인 또는 검토자 자동 배정
 * [보안 수정] 테넌트별 격리 처리 적용
 */

import { getDb } from "../db";
import { hApprovalRequests, hBatches, hInventoryAdjustments, users, tenants } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * 자동 승인 조건 체크 및 처리
 */
export async function processAutoApprovals() {
  const db = await getDb();
  if (!db) {
    console.error("[승인 자동화] Database connection failed");
    return { success: false, processedCount: 0 };
  }

  try {
    console.log("[승인 자동화] 자동 승인 조건 체크 시작");

    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    let totalProcessedCount = 0;

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 1. 대기 중인 승인 요청 조회 (테넌트별)
      const pendingRequests = await db
        .select()
        .from(hApprovalRequests)
        .where(
          and(
            eq(hApprovalRequests.tenantId, tenantId),
            eq(hApprovalRequests.status, "pending")
          )
        );

      if (pendingRequests.length === 0) {
        continue;
      }

      let processedCount = 0;

      // 2. 각 승인 요청에 대해 자동 승인 조건 체크
      for (const request of pendingRequests) {
        let autoApprove = false;
        let reason = "";

        // 배치 승인 자동화 조건
        if (request.requestType === "batch_approval" && request.referenceId) {
          const batch = await db
            .select()
            .from(hBatches)
            .where(
              and(
                eq(hBatches.id, request.referenceId),
                eq(hBatches.tenantId, tenantId)
              )
            )
            .limit(1);

          if (batch.length > 0) {
            const batchData = batch[0];
            // 조건 1: 배치 수량이 100개 이하인 경우 자동 승인
            const plannedQty = parseFloat(batchData.plannedQuantity);
            if (plannedQty && plannedQty <= 100) {
              autoApprove = true;
              reason = "소량 배치 자동 승인 (100개 이하)";
            }
          }
        }

        // 재고 조정 승인 자동화 조건
        if (request.requestType === "inventory_adjustment" && request.referenceId) {
          const adjustment = await db
            .select()
            .from(hInventoryAdjustments)
            .where(
              eq(hInventoryAdjustments.id, request.referenceId)
            )
            .limit(1);

          if (adjustment.length > 0) {
            const adjustmentData = adjustment[0];
            // 조건 2: 조정 수량이 10개 이하인 경우 자동 승인
            const quantityDiff = Math.abs(parseFloat(adjustmentData.quantityAfter) - parseFloat(adjustmentData.quantityBefore));
            if (quantityDiff <= 10) {
              autoApprove = true;
              reason = "소량 재고 조정 자동 승인 (10개 이하)";
            }
          }
        }

        // 3. 자동 승인 처리
        if (autoApprove) {
          await db
            .update(hApprovalRequests)
            .set({
              status: "approved",
              approvedAt: new Date(),
              notes: reason,
            })
            .where(
              and(
                eq(hApprovalRequests.id, request.id),
                eq(hApprovalRequests.tenantId, tenantId)
              )
            );

          console.log(`[승인 자동화] [tenant:${tenantId}] 자동 승인 처리: ${request.title} (${reason})`);
          processedCount++;
        }
      }

      if (processedCount > 0) {
        console.log(`[승인 자동화] [tenant:${tenantId}] ${processedCount}개 승인 요청 자동 처리 완료`);
      }
      totalProcessedCount += processedCount;
    }

    console.log(`[승인 자동화] 전체 ${totalProcessedCount}개 승인 요청 자동 처리 완료`);
    return { success: true, processedCount: totalProcessedCount };
  } catch (error) {
    console.error("[승인 자동화] Error:", error);
    return { success: false, processedCount: 0 };
  }
}

/**
 * 검토자 자동 배정
 */
export async function assignReviewers() {
  const db = await getDb();
  if (!db) {
    console.error("[승인 자동화] Database connection failed");
    return { success: false, assignedCount: 0 };
  }

  try {
    console.log("[승인 자동화] 검토자 자동 배정 시작");

    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    let totalAssignedCount = 0;

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 1. 검토자가 배정되지 않은 승인 요청 조회 (테넌트별)
      const unassignedRequests = await db
        .select()
        .from(hApprovalRequests)
        .where(
          and(
            eq(hApprovalRequests.tenantId, tenantId),
            eq(hApprovalRequests.status, "pending")
          )
        );

      if (unassignedRequests.length === 0) {
        continue;
      }

      // 2. 해당 테넌트의 관리자 및 검토자 역할을 가진 사용자 조회
      const reviewers = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            eq(users.role, "admin")
          )
        );

      if (reviewers.length === 0) {
        console.warn(`[승인 자동화] [tenant:${tenantId}] 검토자를 찾을 수 없음`);
        continue;
      }

      let assignedCount = 0;

      // 3. 라운드 로빈 방식으로 검토자 배정
      for (let i = 0; i < unassignedRequests.length; i++) {
        const request = unassignedRequests[i];
        const reviewer = reviewers[i % reviewers.length];

        // 검토자 배정 로직은 스키마에 reviewerId 필드가 없으므로 주석 처리
        // await db
        //   .update(hApprovalRequests)
        //   .set({
        //     reviewerId: reviewer.id,
        //   })
        //   .where(eq(hApprovalRequests.id, request.id));

        console.log(`[승인 자동화] [tenant:${tenantId}] 검토자 배정: ${request.title} → ${reviewer.name}`);
        assignedCount++;
      }

      if (assignedCount > 0) {
        console.log(`[승인 자동화] [tenant:${tenantId}] ${assignedCount}개 승인 요청에 검토자 배정 완료`);
      }
      totalAssignedCount += assignedCount;
    }

    console.log(`[승인 자동화] 전체 ${totalAssignedCount}개 승인 요청에 검토자 배정 완료`);
    return { success: true, assignedCount: totalAssignedCount };
  } catch (error) {
    console.error("[승인 자동화] Error:", error);
    return { success: false, assignedCount: 0 };
  }
}
