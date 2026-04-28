/**
 * 화장품 GMP — BMR (Batch Manufacturing Record) 라우터
 *
 * ============================================================================
 * Phase 2 (화장품 GMP) 시작점 — 5계층 구조 PoC
 * ============================================================================
 *
 * 위치: server/routers/industry/cosmetic/
 * 의존: core-erp / core-mes / shared-kernel / platform 만 허용 (ADR-002)
 *
 * dependency-cruiser 룰 (.dependency-cruiser.cjs):
 *   - core-cannot-use-industry        — core 가 cosmetic 참조 금지
 *   - industry-cannot-use-other-industry — food / cosmetic 간 cross-ref 금지
 *
 * 본 라우터의 역할 (이번 PR — 빈 PoC):
 *   - 5계층 구조 실증 (server/routers/industry/cosmetic/ 디렉토리 작동)
 *   - architecture-check.yml 의 dependency-cruiser 통과 검증
 *   - Phase 2 (화장품 GMP) 의 향후 BMR 모듈 시작점
 *
 * 향후 확장 (별도 PR 시리즈):
 *   - BMR 생성 / 조회 / 수정 / 승인 워크플로
 *   - 처방서 (Formula) 관리
 *   - 라벨 (Label) 관리
 *   - 전성분 표시 (KFDA 규정)
 *
 * 참조: docs/architecture/00-layers.md (Layer 4 industry — cosmetic)
 *       docs/architecture/industry-coupling-audit-2026-04-28.md (PR #114)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";

export const cosmeticBmrRouter = router({
  /**
   * BMR 목록 조회 (Phase 2 시작점 — placeholder)
   *
   * 향후: h_cosmetic_bmr 테이블 (drizzle/schema/industry/cosmetic/bmr.ts) 조회
   * 현재: 빈 배열 반환 (5계층 구조 작동 확인용)
   */
  list: tenantRequiredProcedure
    .input(
      z
        .object({
          status: z.enum(["draft", "approved", "manufacturing", "completed"]).optional(),
        })
        .optional(),
    )
    .query(async () => {
      // Phase 2 (화장품 GMP) 미구현 — 빈 결과 반환.
      // 향후 구현 시:
      //   1. drizzle/schema/industry/cosmetic/bmr.ts 추가
      //   2. server/db/industry/cosmetic/bmr.ts (CRUD 함수)
      //   3. h_cosmetic_bmr 테이블 추가 (마이그레이션)
      //   4. industryConfig.ts 의 cosmetic 모듈 활성화 시 노출
      return {
        items: [] as Array<{
          id: number;
          bmrCode: string;
          productId: number;
          status: "draft" | "approved" | "manufacturing" | "completed";
          createdAt: Date;
        }>,
        total: 0,
        message: "Phase 2 (화장품 GMP) 미구현 — 향후 별도 PR 시리즈로 추가 예정",
      };
    }),
});
