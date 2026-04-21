/**
 * 도메인 이벤트 타입 정의
 * 표준 이벤트 목록: docs/architecture/03-event-catalog.md
 */

export interface DomainEventInput<TPayload = Record<string, unknown>> {
  tenantId: number;
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  payload: TPayload;
  createdBy?: number | null;
}

export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: number;
  tenantId: number;
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  payload: TPayload;
  createdAt: Date;
  createdBy: number | null;
  processedAt: Date | null;
  processingAttempts: number;
  lastError: string | null;
}

export type EventHandler<TPayload = Record<string, unknown>> = (
  event: DomainEvent<TPayload>,
) => Promise<void>;
