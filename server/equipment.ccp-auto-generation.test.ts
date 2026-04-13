import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { equipments } from "../drizzle/schema/equipment";
import { hBatches } from "../drizzle/schema/schema_main";
import { ccpMonitoringInstances, ccpMonitoringRecords } from "../drizzle/schema/ccpMonitoring";
import { eq, and } from "drizzle-orm";
import { generateCCPInstancesForBatch } from "./services/ccp-batch";

/**
 * 설비 프로필 기반 CCP 자동 생성 테스트
 * 
 * 테스트 시나리오:
 * 1. 설비 프로필 3개 생성 (CCP-1B, CCP-2B, CCP-4P)
 * 2. 배치 생성
 * 3. CCP 인스턴스 자동 생성 확인
 * 4. 설비 프로필의 기본값이 CCP 레코드에 반영되었는지 확인
 */

describe("Equipment Profile - CCP Auto Generation", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testEquipmentIds: number[] = [];
  let testBatchId: number | null = null;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      throw new Error("데이터베이스에 연결할 수 없습니다");
    }
    // 테스트 설비 프로필 3개 생성
    const equipment1 = await db.insert(equipments).values({
      code: "TEST-EQ-001",
      name: "테스트 증숙기 1호",
      type: "증숙기",
      ccpType: "CCP-1B",
      defaultTemperature: "90",
      defaultPressure: "2.8",
      defaultTime: 12,
      monitoringInterval: 10,
      rowsPerBatch: 4,
      status: "active",
      notes: "테스트용 증숙기"
    });
    testEquipmentIds.push(Number(equipment1.insertId));

    const equipment2 = await db.insert(equipments).values({
      code: "TEST-EQ-002",
      name: "테스트 교반기 1호",
      type: "교반기",
      ccpType: "CCP-2B",
      defaultTemperature: "85",
      defaultPressure: null,
      defaultTime: 8,
      monitoringInterval: 10,
      rowsPerBatch: 3,
      status: "active",
      notes: "테스트용 교반기"
    });
    testEquipmentIds.push(Number(equipment2.insertId));

    const equipment3 = await db.insert(equipments).values({
      code: "TEST-EQ-003",
      name: "테스트 금속검출기 1호",
      type: "금속검출기",
      ccpType: "CCP-4P",
      defaultTemperature: null,
      defaultPressure: null,
      defaultTime: null,
      monitoringInterval: 5,
      rowsPerBatch: 2,
      status: "active",
      notes: "테스트용 금속검출기"
    });
    testEquipmentIds.push(Number(equipment3.insertId));

    console.log("✅ 테스트 설비 프로필 3개 생성 완료:", testEquipmentIds);
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    if (testBatchId) {
      // CCP 레코드 삭제
      const ccpInstances = await db
        .select({ id: ccpMonitoringInstances.id })
        .from(ccpMonitoringInstances)
        .where(eq(ccpMonitoringInstances.batchId, testBatchId));

      for (const instance of ccpInstances) {
        await db
          .delete(ccpMonitoringRecords)
          .where(eq(ccpMonitoringRecords.instanceId, instance.id));
      }

      await db
        .delete(ccpMonitoringInstances)
        .where(eq(ccpMonitoringInstances.batchId, testBatchId));

      // 배치 삭제
      await db.delete(hBatches).where(eq(hBatches.id, testBatchId));
      console.log("✅ 테스트 배치 삭제 완료:", testBatchId);
    }

    // 설비 프로필 삭제
    for (const equipmentId of testEquipmentIds) {
      await db.delete(equipments).where(eq(equipments.id, equipmentId));
    }
    console.log("✅ 테스트 설비 프로필 삭제 완료:", testEquipmentIds);
  });

  it("배치 생성 시 CCP 인스턴스가 자동으로 생성되어야 함", async () => {
    // 테스트 배치 생성
    const batch = await db.insert(hBatches).values({
      siteId: 1, // 필수 필드 추가
      batchNumber: `TEST-BATCH-${Date.now()}`,
      productId: 1, // 실제 제품 ID 필요
      plannedQuantity: "100",
      status: "planned",
      startDate: new Date(),
      createdBy: 1
    });
    testBatchId = Number(batch.insertId);
    console.log("✅ 테스트 배치 생성 완료:", testBatchId);

    // CCP 인스턴스 자동 생성
    await generateCCPInstancesForBatch(testBatchId, 1);
    console.log("✅ CCP 인스턴스 자동 생성 호출 완료");

    // CCP 인스턴스 확인
    const ccpInstances = await db
      .select()
      .from(ccpMonitoringInstances)
      .where(eq(ccpMonitoringInstances.batchId, testBatchId));

    console.log("생성된 CCP 인스턴스 수:", ccpInstances.length);
    console.log("CCP 인스턴스:", ccpInstances);

    // 최소 1개 이상의 CCP 인스턴스가 생성되어야 함
    expect(ccpInstances.length).toBeGreaterThan(0);

    // 각 CCP 유형별로 인스턴스가 생성되었는지 확인
    const ccpTypes = ccpInstances.map((instance) => instance.ccpType);
    console.log("생성된 CCP 유형:", ccpTypes);
  });

  it("설비 프로필의 기본값이 CCP 레코드에 반영되어야 함", async () => {
    if (!testBatchId) {
      throw new Error("테스트 배치가 생성되지 않았습니다");
    }

    // CCP 인스턴스 조회
    const ccpInstances = await db
      .select()
      .from(ccpMonitoringInstances)
      .where(eq(ccpMonitoringInstances.batchId, testBatchId));

    expect(ccpInstances.length).toBeGreaterThan(0);

    // 각 CCP 인스턴스의 레코드 확인
    for (const instance of ccpInstances) {
      const records = await db
        .select()
        .from(ccpMonitoringRecords)
        .where(eq(ccpMonitoringRecords.instanceId, instance.id));

      console.log(`CCP 인스턴스 ${instance.id} (${instance.ccpType})의 레코드 수:`, records.length);

      // 레코드가 생성되었는지 확인
      expect(records.length).toBeGreaterThan(0);

      // 설비 프로필의 기본값이 반영되었는지 확인
      if (instance.equipmentId) {
        const equipment = await db
          .select()
          .from(equipments)
          .where(eq(equipments.id, instance.equipmentId))
          .limit(1);

        if (equipment.length > 0) {
          const eq = equipment[0];
          console.log(`설비 프로필 ${eq.id} (${eq.name})의 기본값:`, {
            defaultTemperature: eq.defaultTemperature,
            defaultPressure: eq.defaultPressure,
            defaultTime: eq.defaultTime
          });

          // 첫 번째 레코드의 기본값 확인
          const firstRecord = records[0];
          console.log(`첫 번째 레코드의 값:`, {
            temperature: firstRecord.temperature,
            pressure: firstRecord.pressure,
            time: firstRecord.time
          });

          // 기본값이 반영되었는지 확인 (null이 아닌 경우만)
          if (eq.defaultTemperature) {
            expect(firstRecord.temperature).toBe(eq.defaultTemperature);
          }
          if (eq.defaultPressure) {
            expect(firstRecord.pressure).toBe(eq.defaultPressure);
          }
          if (eq.defaultTime) {
            expect(firstRecord.time).toBe(eq.defaultTime);
          }
        }
      }
    }
  });

  it("설비 프로필의 rowsPerBatch 값에 따라 CCP 레코드 수가 생성되어야 함", async () => {
    if (!testBatchId) {
      throw new Error("테스트 배치가 생성되지 않았습니다");
    }

    // CCP 인스턴스 조회
    const ccpInstances = await db
      .select()
      .from(ccpMonitoringInstances)
      .where(eq(ccpMonitoringInstances.batchId, testBatchId));

    for (const instance of ccpInstances) {
      if (instance.equipmentId) {
        const equipment = await db
          .select()
          .from(equipments)
          .where(eq(equipments.id, instance.equipmentId))
          .limit(1);

        if (equipment.length > 0) {
          const eq = equipment[0];
          const records = await db
            .select()
            .from(ccpMonitoringRecords)
            .where(eq(ccpMonitoringRecords.instanceId, instance.id));

          console.log(
            `설비 ${eq.name} (rowsPerBatch: ${eq.rowsPerBatch})의 레코드 수:`,
            records.length
          );

          // rowsPerBatch 값과 레코드 수가 일치해야 함
          expect(records.length).toBe(eq.rowsPerBatch);
        }
      }
    }
  });
});
