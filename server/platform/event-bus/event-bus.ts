/**
 * Event Bus — 발행 / 구독 / 처리
 *
 * 발행: `publishEvent()` — 트랜잭션 내부에서 호출 (outbox INSERT)
 * 구독: `subscribe()` — 앱 부팅 시점에 핸들러 등록
 * 처리: `processPendingEvents()` — 워커가 주기적으로 호출
 *
 * 배경: docs/architecture/03-event-catalog.md
 */

import type { PoolConnection } from "mysql2/promise";
import { getRawConnection } from "../../db/connection";
import type { DomainEvent, DomainEventInput, EventHandler } from "./types";

const handlers = new Map<string, EventHandler[]>();

export function subscribe<TPayload = Record<string, unknown>>(
  eventType: string,
  handler: EventHandler<TPayload>,
): void {
  const list = handlers.get(eventType) ?? [];
  list.push(handler as EventHandler);
  handlers.set(eventType, list);
}

export async function publishEvent(
  input: DomainEventInput,
  conn?: PoolConnection,
): Promise<number> {
  const executor = conn ?? (await getRawConnection());
  const [result] = await executor.execute(
    `INSERT INTO domain_events
       (tenant_id, event_type, aggregate_type, aggregate_id, payload, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.eventType,
      input.aggregateType,
      input.aggregateId,
      JSON.stringify(input.payload),
      input.createdBy ?? null,
    ],
  );
  return (result as { insertId: number }).insertId;
}

const MAX_ATTEMPTS = 5;

export async function processPendingEvents(batchSize = 50): Promise<{
  processed: number;
  failed: number;
}> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT id, tenant_id, event_type, aggregate_type, aggregate_id, payload,
            created_at, created_by, processed_at, processing_attempts, last_error
       FROM domain_events
      WHERE processed_at IS NULL
        AND processing_attempts < ?
      ORDER BY id ASC
      LIMIT ?`,
    [MAX_ATTEMPTS, batchSize],
  );

  const pending = rows as Array<{
    id: number;
    tenant_id: number;
    event_type: string;
    aggregate_type: string;
    aggregate_id: number;
    payload: unknown;
    created_at: Date;
    created_by: number | null;
    processed_at: Date | null;
    processing_attempts: number;
    last_error: string | null;
  }>;

  let processed = 0;
  let failed = 0;

  for (const row of pending) {
    const event: DomainEvent = {
      id: row.id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload:
        typeof row.payload === "string"
          ? JSON.parse(row.payload)
          : (row.payload as Record<string, unknown>),
      createdAt: row.created_at,
      createdBy: row.created_by,
      processedAt: row.processed_at,
      processingAttempts: row.processing_attempts,
      lastError: row.last_error,
    };

    const subscribers = handlers.get(event.eventType) ?? [];

    try {
      for (const handler of subscribers) {
        await handler(event);
      }
      await conn.execute(
        `UPDATE domain_events
            SET processed_at = NOW(),
                processing_attempts = processing_attempts + 1
          WHERE id = ?`,
        [row.id],
      );
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await conn.execute(
        `UPDATE domain_events
            SET processing_attempts = processing_attempts + 1,
                last_error = ?
          WHERE id = ?`,
        [message.slice(0, 2000), row.id],
      );
      failed++;
    }
  }

  return { processed, failed };
}

export function __resetSubscribersForTest(): void {
  handlers.clear();
}
