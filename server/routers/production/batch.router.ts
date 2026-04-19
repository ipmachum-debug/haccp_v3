import { monitorProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or, sql } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";
import { toKSTDate, todayKST, formatLocalDate } from "../../utils/timezone";

import { batchCrudRouter } from "./batch.crud.router";
import { batchLifecycleRouter } from "./batch.lifecycle.router";
import { batchAnalyticsRouter } from "./batch.analytics.router";
import { mergeRouters } from "../../_core/trpc";

/**
 * batch.router.ts - 배치 라우터 (분할된 서브라우터 합성)
 * 기존 1,960줄 → 3개 서브라우터로 분할
 */
export const batchRouter = mergeRouters(
  batchCrudRouter,
  batchLifecycleRouter,
  batchAnalyticsRouter,
);
