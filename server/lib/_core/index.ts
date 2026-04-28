/**
 * server/lib/_core — 도메인 무관 코어 인프라 (Layer 2 인접)
 *
 * 트랜잭션 컨텍스트 + 향후 도메인 이벤트 / Audit 인프라.
 *
 * 트리거: PR #117 F-2 단일 트랜잭션 엔진 설계
 */

export type {
  TransactionContext,
  TxSourceType,
  PostWithinTransactionParams,
  PostWithinTransactionResult,
} from "./transactionContext";

export { postWithinTransaction } from "./transactionContext";
