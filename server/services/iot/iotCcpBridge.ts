/**
 * IoT → CCP 브리지 — F-3 IoT 폐쇄 루프 마무리 (CP-3-h)
 *
 * ============================================================================
 * 흐름:
 *   외부 IoT 센서 → /trpc/iot.pushData → receiveSensorData() →
 *     iot_sensor_data INSERT (기존)
 *     ↓
 *     [device.ccp_type set + ENABLE_CCP_IOT_BRIDGE]
 *     ↓
 *   bridgeSensorDataToCcp() →
 *     ccp_monitoring_records INSERT (deviceType → 필드 매핑)
 *     ↓
 *   triggerCcpEvaluator() → F-3 4단계 자동 실행
 *     (이탈 알림 → LOT HOLD → 손실분개 → CAR — PR #132~#138 + #139)
 *
 * 이 파일이 폐쇄 루프 자동화의 마지막 조각:
 *   외부 신호만으로 인적 개입 없이 deviation 감지 + 회계/재고/품질 자동 반영.
 *
 * 환경변수 (운영 .env):
 *   ENABLE_CCP_IOT_BRIDGE=false (기본)         — 브리지 비활성
 *   ENABLE_CCP_IOT_BRIDGE_TENANTS="2,5,7"      — 명시 tenant 만
 *
 * 안전:
 *   - device.ccp_type NULL 이면 호출되지 않음 (운영자가 명시적으로 SET 해야 동작)
 *   - 자체 try/catch — 브리지 실패가 IoT 메인 흐름을 깨뜨리지 않음
 *   - operatorId=0 ("system") 사용 — 인적 작업자 없음 표시
 *
 * 트리거: PR #138 CP-3-f / #139 CP-3-g / 특허 [0016] F-3 IoT 폐쇄 루프
 * ============================================================================
 */

import { getRawConnection } from "../../db";

export interface IotCcpBridgeResult {
  /** 브리지 실행 여부 (env / device.ccp_type 미설정 시 false) */
  bridged: boolean;
  /** 생성된 ccp_monitoring_records.id */
  ccpRecordId?: number;
  /** triggerCcpEvaluator 호출 결과 요약 (deviation 발생 시) */
  evaluatorSummary?: {
    deviationCount: number;
    lotsHeld: number;
    lossJournalEntryId?: number;
    correctiveActionRequestId?: number;
  };
  reason?: string;
}

/**
 * tenant 가 IoT → CCP 브리지 활성화 대상인지.
 *
 * 우선순위:
 *   1. ENABLE_CCP_IOT_BRIDGE_TENANTS — 명시 tenant 목록
 *   2. ENABLE_CCP_IOT_BRIDGE — 전체 활성
 */
export function isIotCcpBridgeEnabled(tenantId: number): boolean {
  const tenantsRaw = process.env.ENABLE_CCP_IOT_BRIDGE_TENANTS?.trim();
  if (tenantsRaw) {
    const enabled = tenantsRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (enabled.length > 0) {
      return enabled.includes(Number(tenantId));
    }
  }

  const flag = process.env.ENABLE_CCP_IOT_BRIDGE?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

/**
 * deviceType → ccp_monitoring_records 컬럼 매핑.
 * 매핑되지 않은 deviceType 은 generic SET (productName 만 + value 는 metadata 로 보존).
 */
function mapDeviceTypeToColumn(deviceType: string): { column: string; isDecimal: boolean } | null {
  switch (deviceType) {
    case "temperature":
      return { column: "temperature_c", isDecimal: true };
    case "pressure":
      return { column: "pressure_mpa", isDecimal: true };
    case "timer":
      return { column: "heating_time_min", isDecimal: false };
    case "weight":
      return { column: "input_amount_kg", isDecimal: true };
    // metal_detector 는 receiveMetalDetectorSignal() 별도 처리 — 여기 안 옴
    // humidity / ph 는 ccp_monitoring_records 에 직접 컬럼 없음 — 매핑 스킵
    default:
      return null;
  }
}

/**
 * IoT 센서 데이터 → ccp_monitoring_records INSERT + 평가기 트리거.
 *
 * 호출자 (iotService.receiveSensorData) 가 device 정보를 이미 갖고 있어
 * 중복 조회 회피 위해 device row 그대로 받음.
 *
 * 조건 (caller 가 보장):
 *   - device.ccp_type IS NOT NULL
 *   - sensor data INSERT 성공 (이미 commit 됨)
 *
 * 안전:
 *   - 트랜잭션 X (sensor data 는 이미 commit, evaluator 는 자체 트랜잭션)
 *   - 모든 throw 를 catch — IoT 메인 흐름 보호
 */
export async function bridgeSensorDataToCcp(params: {
  tenantId: number;
  device: {
    id: number;
    deviceCode: string;
    deviceType: string;
    ccpType: string;
    unit?: string | null;
  };
  value: number;
  batchId?: number;
  measuredAt: Date | string;
}): Promise<IotCcpBridgeResult> {
  const { tenantId, device, value, batchId, measuredAt } = params;

  // 1. env 체크
  if (!isIotCcpBridgeEnabled(tenantId)) {
    return {
      bridged: false,
      reason: "ENABLE_CCP_IOT_BRIDGE 미활성 (env)",
    };
  }

  // 2. ccpType 검증
  if (!device.ccpType || device.ccpType.trim() === "") {
    return {
      bridged: false,
      reason: "device.ccp_type 미설정",
    };
  }

  // 3. deviceType → 컬럼 매핑
  const mapping = mapDeviceTypeToColumn(device.deviceType);
  if (!mapping) {
    return {
      bridged: false,
      reason: `deviceType '${device.deviceType}' 는 ccp_monitoring_records 직접 매핑 미지원`,
    };
  }

  // 4. productName resolve — batchId 가 있으면 h_batches → products 조회, 없으면 placeholder
  let productName = `IoT 자동 측정 (${device.deviceCode})`;
  if (batchId) {
    try {
      const conn = await getRawConnection();
      const [rows]: any = await conn.execute(
        `SELECT p.product_name AS product_name
         FROM h_batches b
         LEFT JOIN h_products p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
         WHERE b.id = ? AND b.tenant_id = ?
         LIMIT 1`,
        [batchId, tenantId],
      );
      const resolved = (rows as any[])[0]?.product_name;
      if (resolved) productName = String(resolved);
    } catch (e) {
      // 폴백: placeholder 유지
    }
  }

  // 5. ccp_monitoring_records INSERT — 동적 컬럼 set
  let ccpRecordId: number;
  try {
    const conn = await getRawConnection();
    const recordDate = typeof measuredAt === "string" ? measuredAt : measuredAt.toISOString().slice(0, 19).replace("T", " ");

    // 공통 + 동적 컬럼
    const sql =
      `INSERT INTO ccp_monitoring_records ` +
      `(tenant_id, record_date, ccp_type, batch_id, product_name, ${mapping.column}, pass_fail, operator_id) ` +
      `VALUES (?, ?, ?, ?, ?, ?, '적합', 0)`;
    const valueArg = mapping.isDecimal ? Number(value).toFixed(2) : Math.round(Number(value));

    const [result]: any = await conn.execute(sql, [
      tenantId,
      recordDate,
      device.ccpType,
      batchId ? String(batchId) : null, // ccp_monitoring_records.batch_id is varchar
      productName,
      valueArg,
    ]);
    ccpRecordId = Number((result as any).insertId);

    if (!ccpRecordId || ccpRecordId <= 0) {
      return {
        bridged: false,
        reason: "ccp_monitoring_records INSERT insertId 비정상",
      };
    }
  } catch (insertErr: any) {
    return {
      bridged: false,
      reason: `ccp_monitoring_records INSERT 실패: ${insertErr?.message ?? insertErr}`,
    };
  }

  // 6. triggerCcpEvaluator 호출 — F-3 4단계 자동 발화
  try {
    const { triggerCcpEvaluator } = await import(
      "../../routers/industry/food/ccp.evaluatorTrigger"
    );
    const evalResult = await triggerCcpEvaluator({
      recordId: ccpRecordId,
      tenantId,
      operatorId: 0, // system — 인적 작업자 없음
    });

    return {
      bridged: true,
      ccpRecordId,
      evaluatorSummary: {
        deviationCount: evalResult.deviationCount,
        lotsHeld: evalResult.lotsHeld,
        lossJournalEntryId: evalResult.lossJournalEntryId,
        correctiveActionRequestId: evalResult.correctiveActionRequestId,
      },
    };
  } catch (evalErr: any) {
    // record 는 INSERT 됐지만 evaluator 실패 — record 는 살려두고 reason 만 보고
    console.warn(
      `[iotCcpBridge] triggerCcpEvaluator 실패 (record 살림) — recordId=${ccpRecordId}: ${evalErr?.message ?? evalErr}`,
    );
    return {
      bridged: true,
      ccpRecordId,
      reason: `evaluator 실패: ${evalErr?.message ?? evalErr}`,
    };
  }
}
