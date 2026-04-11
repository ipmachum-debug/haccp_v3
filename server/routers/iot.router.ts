/**
 * IoT 센서 연동 라우터
 *
 * 외부 센서/PLC → HTTP API → 배치 상태 자동 전환 + CCP 실측값 기록
 * 모든 엔드포인트에 tenantId 격리 적용
 */

import { tenantRequiredProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  receiveSensorData,
  receiveHeartbeat,
  receiveMetalDetectorSignal,
  autoBatchTransition,
  autoRecordCcpMeasurement,
  checkOfflineDevices,
} from "../services/iotService";
import { getRawConnection } from "../db";
import { TRPCError } from "@trpc/server";

export const iotRouter = router({
  // ── 센서 데이터 수신 ──
  pushData: tenantRequiredProcedure
    .input(z.object({
      deviceCode: z.string().min(1),
      value: z.number(),
      unit: z.string().optional(),
      measuredAt: z.string().optional(),
      batchId: z.number().optional(),
      metadata: z.record(z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await receiveSensorData(ctx.tenantId!, input);
    }),

  // ── 배치 다중 데이터 수신 (벌크) ──
  pushBulkData: tenantRequiredProcedure
    .input(z.object({
      data: z.array(z.object({
        deviceCode: z.string().min(1),
        value: z.number(),
        unit: z.string().optional(),
        measuredAt: z.string().optional(),
        batchId: z.number().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const results = [];
      for (const item of input.data) {
        const result = await receiveSensorData(ctx.tenantId!, item);
        results.push(result);
      }
      return {
        total: results.length,
        success: results.filter(r => r.success).length,
        anomalies: results.filter(r => r.isAnomaly).length,
      };
    }),

  // ── Heartbeat ──
  heartbeat: tenantRequiredProcedure
    .input(z.object({ deviceCode: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return await receiveHeartbeat(ctx.tenantId!, input.deviceCode);
    }),

  // ── 금속검출기 신호 ──
  metalDetectorSignal: tenantRequiredProcedure
    .input(z.object({
      deviceCode: z.string().min(1),
      passed: z.boolean(),
      batchId: z.number().optional(),
      productName: z.string().optional(),
      measuredAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await receiveMetalDetectorSignal(ctx.tenantId!, input.deviceCode, input);
    }),

  // ── 배치 상태 자동 전환 ──
  batchTransition: tenantRequiredProcedure
    .input(z.object({
      batchId: z.number(),
      targetStatus: z.enum(["in_progress", "completed"]),
    }))
    .mutation(async ({ ctx, input }) => {
      return await autoBatchTransition(ctx.tenantId!, input.batchId, input.targetStatus);
    }),

  // ── CCP 실측값 기록 ──
  recordCcpMeasurement: tenantRequiredProcedure
    .input(z.object({
      batchId: z.number(),
      ccpInstanceId: z.number(),
      sortOrder: z.number(),
      tempC: z.number().optional(),
      durationMin: z.number().optional(),
      pressureBar: z.number().optional(),
      result: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await autoRecordCcpMeasurement(ctx.tenantId!, input);
    }),

  // ── 디바이스 관리 ──
  listDevices: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const conn = await getRawConnection();
      const [rows] = await conn.execute<any[]>(
        `SELECT d.*, e.name as equipment_name, pg.name as process_group_name
         FROM iot_devices d
         LEFT JOIN equipments e ON e.id = d.equipment_id
         LEFT JOIN ccp_process_groups pg ON pg.id = d.process_group_id
         WHERE d.tenant_id = ?
         ORDER BY d.status, d.device_type, d.device_code`,
        [ctx.tenantId]
      );
      return rows;
    }),

  createDevice: tenantRequiredProcedure
    .input(z.object({
      deviceCode: z.string().min(1),
      deviceName: z.string().min(1),
      deviceType: z.enum(["temperature", "pressure", "timer", "metal_detector", "weight", "humidity", "ph"]),
      protocol: z.enum(["mqtt", "http", "modbus", "opcua"]).optional(),
      endpoint: z.string().optional(),
      equipmentId: z.number().optional(),
      processGroupId: z.number().optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
      unit: z.string().optional(),
      heartbeatIntervalSec: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getRawConnection();
      // 중복 체크
      const [existing] = await conn.execute<any[]>(
        `SELECT id FROM iot_devices WHERE tenant_id = ? AND device_code = ? LIMIT 1`,
        [ctx.tenantId, input.deviceCode]
      );
      if ((existing as any[]).length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `디바이스 코드 "${input.deviceCode}" 이미 존재` });
      }

      const [result] = await conn.execute<any>(
        `INSERT INTO iot_devices
         (tenant_id, device_code, device_name, device_type, protocol, endpoint,
          equipment_id, process_group_id, min_value, max_value, unit, heartbeat_interval_sec)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ctx.tenantId, input.deviceCode, input.deviceName, input.deviceType,
          input.protocol || "http", input.endpoint || null,
          input.equipmentId || null, input.processGroupId || null,
          input.minValue ?? null, input.maxValue ?? null, input.unit || null,
          input.heartbeatIntervalSec || 60,
        ]
      );
      return { id: result.insertId, deviceCode: input.deviceCode };
    }),

  updateDeviceStatus: tenantRequiredProcedure
    .input(z.object({
      deviceId: z.number(),
      status: z.enum(["active", "inactive", "maintenance"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getRawConnection();
      await conn.execute(
        `UPDATE iot_devices SET status = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
        [input.status, input.deviceId, ctx.tenantId]
      );
      return { success: true };
    }),

  // ── 센서 데이터 조회 (최근) ──
  getRecentData: tenantRequiredProcedure
    .input(z.object({
      deviceId: z.number().optional(),
      batchId: z.number().optional(),
      limit: z.number().default(100),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getRawConnection();
      let where = `WHERE sd.tenant_id = ?`;
      const params: any[] = [ctx.tenantId];
      if (input.deviceId) { where += ` AND sd.device_id = ?`; params.push(input.deviceId); }
      if (input.batchId) { where += ` AND sd.batch_id = ?`; params.push(input.batchId); }
      params.push(input.limit);

      const [rows] = await conn.execute<any[]>(
        `SELECT sd.*, d.device_code, d.device_name, d.device_type
         FROM iot_sensor_data sd
         LEFT JOIN iot_devices d ON d.id = sd.device_id
         ${where}
         ORDER BY sd.measured_at DESC
         LIMIT ?`,
        params
      );
      return rows;
    }),

  // ── 이벤트 조회 ──
  getEvents: tenantRequiredProcedure
    .input(z.object({
      deviceId: z.number().optional(),
      batchId: z.number().optional(),
      eventType: z.string().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getRawConnection();
      let where = `WHERE e.tenant_id = ?`;
      const params: any[] = [ctx.tenantId];
      if (input.deviceId) { where += ` AND e.device_id = ?`; params.push(input.deviceId); }
      if (input.batchId) { where += ` AND e.batch_id = ?`; params.push(input.batchId); }
      if (input.eventType) { where += ` AND e.event_type = ?`; params.push(input.eventType); }
      params.push(input.limit);

      const [rows] = await conn.execute<any[]>(
        `SELECT e.*, d.device_code, d.device_name
         FROM iot_events e
         LEFT JOIN iot_devices d ON d.id = e.device_id
         ${where}
         ORDER BY e.occurred_at DESC
         LIMIT ?`,
        params
      );
      return rows;
    }),

  // ── 룰 관리 ──
  listRules: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const conn = await getRawConnection();
      const [rows] = await conn.execute<any[]>(
        `SELECT * FROM iot_rules WHERE tenant_id = ? ORDER BY priority DESC, id`,
        [ctx.tenantId]
      );
      return rows;
    }),

  // ── 오프라인 디바이스 체크 (스케줄러/관리자) ──
  checkOffline: tenantRequiredProcedure
    .mutation(async ({ ctx }) => {
      return await checkOfflineDevices(ctx.tenantId!);
    }),

  // ── 대시보드 요약 ──
  getDashboard: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const conn = await getRawConnection();

      const [deviceStats] = await conn.execute<any[]>(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
           SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
         FROM iot_devices WHERE tenant_id = ?`,
        [ctx.tenantId]
      );

      const [recentAnomalies] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM iot_sensor_data
         WHERE tenant_id = ? AND is_anomaly = 1 AND measured_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [ctx.tenantId]
      );

      const [recentEvents] = await conn.execute<any[]>(
        `SELECT event_type, COUNT(*) as cnt FROM iot_events
         WHERE tenant_id = ? AND occurred_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         GROUP BY event_type ORDER BY cnt DESC`,
        [ctx.tenantId]
      );

      return {
        devices: (deviceStats as any[])[0] || { total: 0, active: 0, error: 0, inactive: 0 },
        anomalies24h: (recentAnomalies as any[])[0]?.cnt || 0,
        events24h: recentEvents,
      };
    }),
});
