import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "./db";
import { hBatchCompletionRetries } from "../drizzle/schema/schema_main";
import { eq } from "drizzle-orm";
import {
  getPendingRetryTasks,
  updateRetryTaskStatus,
  incrementRetryCount,
  addRetryTask,
  deleteRetryTask
} from "./db/production/batchCompletionRetries";

describe("배치 완료 재시도 로직 테스트", () => {
  let testBatchId: number;
  let testRetryTaskId: number;

  beforeAll(async () => {
    // 테스트용 배치 ID (실제 배치가 존재한다고 가정)
    testBatchId = 1;
  });

  it("1. 재시도 작업 생성", async () => {
    const result = await addRetryTask({
      batchId: testBatchId,
      taskType: "pdf_generation",
      errorMessage: "테스트 오류"
    });

    expect(result).toBeDefined();

    // 생성된 작업 조회하여 ID 확인
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const [createdTask] = await db
      .select()
      .from(hBatchCompletionRetries)
      .where(eq(hBatchCompletionRetries.batchId, testBatchId))
      .orderBy(hBatchCompletionRetries.createdAt)
      .limit(1);

    expect(createdTask).toBeDefined();
    expect(createdTask.batchId).toBe(testBatchId);
    expect(createdTask.taskType).toBe("pdf_generation");
    expect(createdTask.status).toBe("pending");
    expect(createdTask.retryCount).toBe(0);

    testRetryTaskId = createdTask.id;
  });

  it("2. 대기 중인 재시도 작업 조회", async () => {
    const pendingTasks = await getPendingRetryTasks();

    expect(pendingTasks).toBeDefined();
    expect(Array.isArray(pendingTasks)).toBe(true);
    expect(pendingTasks.length).toBeGreaterThan(0);

    const testTask = pendingTasks.find((task) => task.id === testRetryTaskId);
    expect(testTask).toBeDefined();
    expect(testTask?.status).toBe("pending");
  });

  it("3. 재시도 작업 상태 업데이트 (retrying)", async () => {
    await updateRetryTaskStatus(testRetryTaskId, "retrying");

    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const [updatedTask] = await db
      .select()
      .from(hBatchCompletionRetries)
      .where(eq(hBatchCompletionRetries.id, testRetryTaskId));

    expect(updatedTask).toBeDefined();
    expect(updatedTask.status).toBe("retrying");
  });

  it("4. 재시도 작업 상태 업데이트 (success)", async () => {
    await updateRetryTaskStatus(testRetryTaskId, "success");

    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const [updatedTask] = await db
      .select()
      .from(hBatchCompletionRetries)
      .where(eq(hBatchCompletionRetries.id, testRetryTaskId));

    expect(updatedTask).toBeDefined();
    expect(updatedTask.status).toBe("success");
  });

  it("5. 재시도 횟수 증가 테스트", async () => {
    // 새 재시도 작업 생성
    await addRetryTask({
      batchId: testBatchId,
      taskType: "notification",
      errorMessage: "재시도 횟수 테스트"
    });

    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 생성된 작업 조회
    const [newTask] = await db
      .select()
      .from(hBatchCompletionRetries)
      .where(eq(hBatchCompletionRetries.batchId, testBatchId))
      .orderBy(hBatchCompletionRetries.createdAt)
      .limit(1);

    expect(newTask).toBeDefined();

    // 재시도 횟수 증가 (최대 3회)
    const maxReached1 = await incrementRetryCount(newTask.id);
    expect(maxReached1).toBe(false);

    const maxReached2 = await incrementRetryCount(newTask.id);
    expect(maxReached2).toBe(false);

    const maxReached3 = await incrementRetryCount(newTask.id);
    expect(maxReached3).toBe(true); // 3회 초과 시 true 반환

    // 재시도 횟수 확인
    const [updatedTask] = await db
      .select()
      .from(hBatchCompletionRetries)
      .where(eq(hBatchCompletionRetries.id, newTask.id));

    expect(updatedTask.retryCount).toBe(3);
    expect(updatedTask.status).toBe("failed");
  });

  it("6. 재시도 작업 정리 (테스트 데이터 삭제)", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 테스트용 재시도 작업 삭제
    await db
      .delete(hBatchCompletionRetries)
      .where(eq(hBatchCompletionRetries.batchId, testBatchId));

    const remainingTasks = await db
      .select()
      .from(hBatchCompletionRetries)
      .where(eq(hBatchCompletionRetries.batchId, testBatchId));

    expect(remainingTasks.length).toBe(0);
  });
});
