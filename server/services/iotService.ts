/**
 * IoT 센서 연동 서비스
 *
 * 센서 데이터 수신 → 이상치 감지 → 이벤트 생성 → 배치 상태 자동 전환
 */

import { getRawConnection } from "../db";
import { todayKST, toKSTTimestamp } from "../utils/timezone";

// ═══════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════

export interface SensorDataInput {
  deviceCode: string;       // 디바이스 고유 코드
  value: number;            // 측정값
  unit?: string;            // 단위
  measuredAt?: string;      // ISO 시각 (없으면 서버 시각)
  batchId?: number;         // 배치 ID (선택)
  metadata?: Record<string, any>; // 추가 데이터
}

export interface SensorDataResult {
  success: boolean;
  sensorDataId: number;
  isAnomaly: boolean;
  anomalyNote?: string;
  eventsTriggered: string[];
}

// ═══════════════════════════════════════
// 센서 데이터 수신 + 처리
// ═══════════════════════════════════════

export async function receiveSensorData(
  tenantId: number,
  input: SensorDataInput
): Promise<SensorDataResult> {
  const conn = await getRawConnection();
  const eventsTriggered: string[] = [];

  // 1. 디바이스 조회
  const [deviceRows] = await conn.execute<any[]>(
    `SELECT id, device_type, equipment_id, process_group_id, min_value, max_value, unit, status
     FROM iot_devices
     WHERE tenant_id = ? AND device_code = ? AND status = 'active'
     LIMIT 1`,
    [tenantId, input.deviceCode]
  );

  if ((deviceRows as any[]).length === 0) {
    return { success: false, sensorDataId: 0, isAnomaly: false, eventsTriggered: [] };
  }

  const device = (deviceRows as any[])[0];

  // 2. 이상치 감지
  let isAnomaly = false;
  let anomalyNote: string | undefined;
  const minVal = device.min_value ? parseFloat(device.min_value) : null;
  const maxVal = device.max_value ? parseFloat(device.max_value) : null;

  if (minVal !== null && input.value < minVal) {
    isAnomaly = true;
    anomalyNote = `최솟값(${minVal}) 미만: ${input.value}`;
  }
  if (maxVal !== null && input.value > maxVal) {
    isAnomaly = true;
    anomalyNote = `최댓값(${maxVal}) 초과: ${input.value}`;
  }

  // 3. 센서 데이터 저장
  const measuredAt = input.measuredAt || toKSTTimestamp(new Date());
  const [insertResult] = await conn.execute<any>(
    `INSERT INTO iot_sensor_data
     (tenant_id, device_id, value, unit, quality, batch_id, process_group_id,
      is_anomaly, anomaly_note, measured_at)
     VALUES (?, ?, ?, ?, 'good', ?, ?, ?, ?, ?)`,
    [
      tenantId, device.id, input.value, input.unit || device.unit,
      input.batchId || null, device.process_group_id,
      isAnomaly ? 1 : 0, anomalyNote || null, measuredAt,
    ]
  );
  const sensorDataId = insertResult.insertId;

  // 4. Heartbeat 업데이트
  await conn.execute(
    `UPDATE iot_devices SET last_heartbeat = NOW() WHERE id = ?`,
    [device.id]
  );

  // 5. 이상치 이벤트 생성
  if (isAnomaly) {
    await createEvent(conn, tenantId, device.id, "anomaly_detected", {
      batchId: input.batchId,
      sensorDataId,
      eventData: { value: input.value, threshold: { min: minVal, max: maxVal } },
      description: anomalyNote,
    });
    eventsTriggered.push("anomaly_detected");
  }

  // 6. 룰 엔진 실행
  const ruleEvents = await evaluateRules(conn, tenantId, device, input.value, input.batchId, sensorDataId);
  eventsTriggered.push(...ruleEvents);

  return { success: true, sensorDataId, isAnomaly, anomalyNote, eventsTriggered };
}

// ═══════════════════════════════════════
// Heartbeat 수신
// ═══════════════════════════════════════

export async function receiveHeartbeat(
  tenantId: number,
  deviceCode: string
): Promise<{ success: boolean; deviceId: number }> {
  const conn = await getRawConnection();

  const [result] = await conn.execute<any>(
    `UPDATE iot_devices SET last_heartbeat = NOW(), status = 'active'
     WHERE tenant_id = ? AND device_code = ?`,
    [tenantId, deviceCode]
  );

  if (result.affectedRows === 0) {
    return { success: false, deviceId: 0 };
  }

  // 디바이스 ID 조회
  const [rows] = await conn.execute<any[]>(
    `SELECT id FROM iot_devices WHERE tenant_id = ? AND device_code = ? LIMIT 1`,
    [tenantId, deviceCode]
  );

  const deviceId = (rows as any[])[0]?.id || 0;

  await createEvent(conn, tenantId, deviceId, "heartbeat", {
    description: "정상 heartbeat",
  });

  return { success: true, deviceId };
}

// ═══════════════════════════════════════
// 금속검출기 통과 신호
// ═══════════════════════════════════════

export async function receiveMetalDetectorSignal(
  tenantId: number,
  deviceCode: string,
  params: { passed: boolean; batchId?: number; productName?: string; measuredAt?: string }
): Promise<{ success: boolean; eventType: string }> {
  const conn = await getRawConnection();

  const [deviceRows] = await conn.execute<any[]>(
    `SELECT id, equipment_id FROM iot_devices
     WHERE tenant_id = ? AND device_code = ? AND device_type = 'metal_detector' AND status = 'active'
     LIMIT 1`,
    [tenantId, deviceCode]
  );

  if ((deviceRows as any[]).length === 0) {
    return { success: false, eventType: "" };
  }

  const device = (deviceRows as any[])[0];
  const eventType = params.passed ? "metal_pass" : "metal_fail";

  await createEvent(conn, tenantId, device.id, eventType, {
    batchId: params.batchId,
    eventData: { passed: params.passed, productName: params.productName },
    description: params.passed
      ? `금속검출 정상 통과: ${params.productName || ""}`
      : `금속검출 이상 감지! ${params.productName || ""}`,
  });

  // FAIL 시 알림 자동 발송
  if (!params.passed) {
    try {
      await conn.execute(
        `INSERT INTO h_notifications
         (tenant_id, user_id, title, message, type, priority, is_read, created_at)
         SELECT tenant_id, id, '금속검출 이상 감지!', ?, 'ccp_alert', 'critical', 0, NOW()
         FROM users WHERE tenant_id = ? AND role IN ('admin', 'super_admin') AND approval_status = 'approved'`,
        [`금속검출기 이상 감지: ${params.productName || ""}. 즉시 확인 필요.`, tenantId]
      );
    } catch { /* 알림 실패 무시 */ }
  }

  return { success: true, eventType };
}

// ═══════════════════════════════════════
// 배치 상태 자동 전환
// ═══════════════════════════════════════

export async function autoBatchTransition(
  tenantId: number,
  batchId: number,
  targetStatus: "in_progress" | "completed"
): Promise<{ success: boolean; message: string }> {
  const conn = await getRawConnection();

  // 현재 상태 확인
  const [batchRows] = await conn.execute<any[]>(
    `SELECT status, planned_quantity FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [batchId, tenantId]
  );

  if ((batchRows as any[]).length === 0) {
    return { success: false, message: "배치를 찾을 수 없습니다." };
  }

  const batch = (batchRows as any[])[0];
  const currentStatus = batch.status;

  // 상태 전환 검증
  const validTransitions: Record<string, string[]> = {
    planned: ["in_progress"],
    in_progress: ["completed"],
  };

  if (!validTransitions[currentStatus]?.includes(targetStatus)) {
    return { success: false, message: `${currentStatus} → ${targetStatus} 전환 불가` };
  }

  // 상태 업데이트
  if (targetStatus === "in_progress") {
    await conn.execute(
      `UPDATE h_batches SET status = 'in_progress', start_time = NOW() WHERE id = ? AND tenant_id = ?`,
      [batchId, tenantId]
    );
  } else if (targetStatus === "completed") {
    await conn.execute(
      `UPDATE h_batches
       SET status = 'completed', actual_quantity = planned_quantity, completed_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [batchId, tenantId]
    );
  }

  return { success: true, message: `배치 #${batchId}: ${currentStatus} → ${targetStatus}` };
}

// ═══════════════════════════════════════
// CCP 실측값 자동 기록
// ═══════════════════════════════════════

export async function autoRecordCcpMeasurement(
  tenantId: number,
  params: {
    batchId: number;
    ccpInstanceId: number;
    sortOrder: number;    // h_ccp_rows.sort_order
    tempC?: number;
    durationMin?: number;
    pressureBar?: number;
    result?: string;
  }
): Promise<{ success: boolean }> {
  const conn = await getRawConnection();
  const now = toKSTTimestamp(new Date());

  await conn.execute(
    `UPDATE h_ccp_rows
     SET temp_c = COALESCE(?, temp_c),
         duration_min = COALESCE(?, duration_min),
         pressure_bar = COALESCE(?, pressure_bar),
         result = COALESCE(?, result),
         measured_at = ?,
         auto_generated = 0
     WHERE instance_id = ? AND sort_order = ? AND tenant_id = ?`,
    [
      params.tempC ?? null, params.durationMin ?? null,
      params.pressureBar ?? null, params.result ?? null,
      now, params.ccpInstanceId, params.sortOrder, tenantId,
    ]
  );

  return { success: true };
}

// ═══════════════════════════════════════
// 오프라인 디바이스 감지 (스케줄러에서 호출)
// ═══════════════════════════════════════

export async function checkOfflineDevices(tenantId: number): Promise<{ offlineCount: number }> {
  const conn = await getRawConnection();

  // heartbeat_interval_sec의 3배 이상 미수신 → offline
  const [result] = await conn.execute<any>(
    `UPDATE iot_devices
     SET status = 'error'
     WHERE tenant_id = ? AND status = 'active'
       AND last_heartbeat IS NOT NULL
       AND TIMESTAMPDIFF(SECOND, last_heartbeat, NOW()) > heartbeat_interval_sec * 3`,
    [tenantId]
  );

  const offlineCount = result.affectedRows || 0;

  if (offlineCount > 0) {
    // 오프라인 디바이스에 대해 이벤트 생성
    const [offlineDevices] = await conn.execute<any[]>(
      `SELECT id, device_code, device_name FROM iot_devices
       WHERE tenant_id = ? AND status = 'error'`,
      [tenantId]
    );

    for (const dev of offlineDevices as any[]) {
      await createEvent(conn, tenantId, dev.id, "device_offline", {
        description: `디바이스 통신 끊김: ${dev.device_name} (${dev.device_code})`,
      });
    }
  }

  return { offlineCount };
}

// ═══════════════════════════════════════
// 내부 헬퍼
// ═══════════════════════════════════════

async function createEvent(
  conn: any,
  tenantId: number,
  deviceId: number,
  eventType: string,
  params: {
    batchId?: number;
    ccpInstanceId?: number;
    sensorDataId?: number;
    eventData?: any;
    description?: string;
  }
): Promise<number> {
  // @ts-expect-error - library type issue
  const [result] = await conn.execute<any>(
    `INSERT INTO iot_events
     (tenant_id, device_id, event_type, batch_id, ccp_instance_id, sensor_data_id,
      event_data, description, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      tenantId, deviceId, eventType,
      params.batchId || null, params.ccpInstanceId || null, params.sensorDataId || null,
      params.eventData ? JSON.stringify(params.eventData) : null,
      params.description || null,
    ]
  );
  return result.insertId;
}

async function evaluateRules(
  conn: any,
  tenantId: number,
  device: any,
  value: number,
  batchId: number | undefined,
  sensorDataId: number
): Promise<string[]> {
  const triggered: string[] = [];

  // @ts-expect-error - library type issue
  const [rules] = await conn.execute<any[]>(
    `SELECT * FROM iot_rules
     WHERE tenant_id = ? AND is_active = 1
       AND (trigger_device_type IS NULL OR trigger_device_type = ?)
     ORDER BY priority DESC`,
    [tenantId, device.device_type]
  );

  for (const rule of rules as any[]) {
    let conditionMet = false;
    const threshold = rule.trigger_threshold ? parseFloat(rule.trigger_threshold) : null;

    switch (rule.trigger_condition) {
      case "value_above":
        conditionMet = threshold !== null && value > threshold;
        break;
      case "value_below":
        conditionMet = threshold !== null && value < threshold;
        break;
      case "value_in_range":
        const config = typeof rule.action_config === "string" ? JSON.parse(rule.action_config) : rule.action_config;
        conditionMet = config?.min !== undefined && config?.max !== undefined
          && value >= config.min && value <= config.max;
        break;
    }

    if (!conditionMet) continue;

    // 액션 실행
    switch (rule.action_type) {
      case "batch_start":
        if (batchId) {
          await autoBatchTransition(tenantId, batchId, "in_progress");
          triggered.push("batch_start");
        }
        break;
      case "batch_complete":
        if (batchId) {
          await autoBatchTransition(tenantId, batchId, "completed");
          triggered.push("batch_complete");
        }
        break;
      case "ccp_record_update":
        // CCP 실측값 자동 기록은 별도 호출
        triggered.push("ccp_record_update");
        break;
      case "send_notification":
        triggered.push("send_notification");
        break;
      case "trigger_alarm":
        triggered.push("trigger_alarm");
        break;
    }

    // 이벤트 기록
    await createEvent(conn, tenantId, device.id, rule.action_type, {
      batchId,
      sensorDataId,
      eventData: { ruleId: rule.id, ruleName: rule.rule_name, value, threshold },
      description: `룰 "${rule.rule_name}" 트리거: ${value} ${rule.trigger_condition} ${threshold}`,
    });
  }

  return triggered;
}
