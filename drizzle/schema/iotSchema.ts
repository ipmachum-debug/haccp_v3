/**
 * IoT 센서 연동 스키마
 *
 * 디바이스 등록 → 센서 데이터 수신 → 배치 이벤트 자동 트리거
 */
import { mysqlTable, bigint, varchar, int, decimal, mysqlEnum, text, timestamp, json } from "drizzle-orm/mysql-core";

// ═══════════════════════════════════════
// 1. IoT 디바이스 등록
// ═══════════════════════════════════════

export const iotDevices = mysqlTable("iot_devices", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  siteId: int("site_id").notNull().default(1),

  // 디바이스 식별
  deviceCode: varchar("device_code", { length: 50 }).notNull(),    // 고유 코드 (예: TEMP-001)
  deviceName: varchar("device_name", { length: 100 }).notNull(),   // 표시명 (예: 교반기1호기 온도센서)
  deviceType: mysqlEnum("device_type", [
    "temperature",    // 온도 센서
    "pressure",       // 압력 센서
    "timer",          // 타이머/시간 센서
    "metal_detector", // 금속검출기
    "weight",         // 중량 센서
    "humidity",       // 습도 센서
    "ph",             // pH 센서
  ]).notNull(),

  // 연결 설정
  protocol: mysqlEnum("protocol", ["mqtt", "http", "modbus", "opcua"]).notNull().default("http"),
  endpoint: varchar("endpoint", { length: 255 }),  // MQTT topic 또는 HTTP webhook URL
  apiKey: varchar("api_key", { length: 100 }),      // 인증 키

  // 설비 매핑
  equipmentId: bigint("equipment_id", { mode: "number" }),     // equipments 테이블 FK
  processGroupId: bigint("process_group_id", { mode: "number" }), // ccp_process_groups FK

  // 데이터 범위 설정 (이상치 감지용)
  minValue: decimal("min_value", { precision: 10, scale: 2 }),
  maxValue: decimal("max_value", { precision: 10, scale: 2 }),
  unit: varchar("unit", { length: 20 }),  // °C, MPa, kg, mm 등

  // 상태
  status: mysqlEnum("status", ["active", "inactive", "error", "maintenance"]).notNull().default("active"),
  lastHeartbeat: timestamp("last_heartbeat"),
  heartbeatIntervalSec: int("heartbeat_interval_sec").default(60), // 정상 heartbeat 간격

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ═══════════════════════════════════════
// 2. 센서 데이터 (시계열)
// ═══════════════════════════════════════

export const iotSensorData = mysqlTable("iot_sensor_data", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  deviceId: bigint("device_id", { mode: "number" }).notNull(), // iot_devices FK

  // 측정값
  value: decimal("value", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 20 }),
  quality: mysqlEnum("quality", ["good", "uncertain", "bad"]).notNull().default("good"),

  // 컨텍스트 (어떤 배치의 어떤 공정에서 측정됐는지)
  batchId: bigint("batch_id", { mode: "number" }),
  ccpInstanceId: bigint("ccp_instance_id", { mode: "number" }),
  processGroupId: bigint("process_group_id", { mode: "number" }),

  // 이상치 감지
  isAnomaly: int("is_anomaly").default(0), // 1=범위 초과
  anomalyNote: varchar("anomaly_note", { length: 200 }),

  measuredAt: timestamp("measured_at").notNull(), // 센서 측정 시각
  receivedAt: timestamp("received_at").defaultNow(), // 서버 수신 시각
});

// ═══════════════════════════════════════
// 3. IoT 이벤트 (배치 상태 전환 트리거)
// ═══════════════════════════════════════

export const iotEvents = mysqlTable("iot_events", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  deviceId: bigint("device_id", { mode: "number" }).notNull(),

  // 이벤트 타입
  eventType: mysqlEnum("event_type", [
    "batch_start",        // 배치 시작 감지 (센서 가동 시작)
    "batch_complete",     // 배치 완료 감지 (온도 도달 + 시간 경과)
    "temperature_reached",// 목표 온도 도달
    "pressure_reached",   // 목표 압력 도달
    "time_elapsed",       // 설정 시간 경과
    "metal_pass",         // 금속검출기 통과 (정상)
    "metal_fail",         // 금속검출기 검출 (이상)
    "weight_measured",    // 중량 측정 완료
    "anomaly_detected",   // 이상치 감지
    "device_offline",     // 디바이스 통신 끊김
    "heartbeat",          // 정상 heartbeat
  ]).notNull(),

  // 연관 데이터
  batchId: bigint("batch_id", { mode: "number" }),
  ccpInstanceId: bigint("ccp_instance_id", { mode: "number" }),
  sensorDataId: bigint("sensor_data_id", { mode: "number" }), // 트리거한 센서 데이터

  // 이벤트 상세
  eventData: json("event_data"), // { temperature: 97.5, duration: 30, ... }
  description: varchar("description", { length: 500 }),

  // 처리 상태
  processed: int("processed").default(0), // 0=미처리, 1=처리완료
  processedAt: timestamp("processed_at"),
  actionTaken: varchar("action_taken", { length: 200 }), // "배치 #477 status → in_progress"

  occurredAt: timestamp("occurred_at").notNull(), // 이벤트 발생 시각
  createdAt: timestamp("created_at").defaultNow(),
});

// ═══════════════════════════════════════
// 4. IoT 룰 엔진 (이벤트 → 액션 매핑)
// ═══════════════════════════════════════

export const iotRules = mysqlTable("iot_rules", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),

  ruleName: varchar("rule_name", { length: 100 }).notNull(),
  description: text("description"),

  // 트리거 조건
  triggerDeviceType: varchar("trigger_device_type", { length: 50 }), // temperature, pressure 등
  triggerCondition: mysqlEnum("trigger_condition", [
    "value_above",     // 값이 threshold 초과
    "value_below",     // 값이 threshold 미만
    "value_in_range",  // 값이 범위 내 (min~max)
    "duration_reached",// 지속 시간 도달
    "event_received",  // 특정 이벤트 수신
  ]).notNull(),
  triggerThreshold: decimal("trigger_threshold", { precision: 10, scale: 2 }),
  triggerDurationSec: int("trigger_duration_sec"), // 조건 지속 시간

  // 실행 액션
  actionType: mysqlEnum("action_type", [
    "batch_start",           // 배치 시작 (planned → in_progress)
    "batch_complete",        // 배치 완료 (in_progress → completed)
    "ccp_record_update",     // CCP 실측값 기록
    "send_notification",     // 알림 발송
    "trigger_alarm",         // 경보 발생
  ]).notNull(),
  actionConfig: json("action_config"), // 액션 상세 설정

  isActive: int("is_active").default(1),
  priority: int("priority").default(0),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
