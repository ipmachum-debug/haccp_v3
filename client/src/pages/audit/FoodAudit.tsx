/**
 * 식품 HACCP — Audit 진입 (industry='food' 고정)
 *
 * 기존 routers/haccp/internalAudit + supplierAudit 와는 별개.
 * Strangler Fig — 점진 이주.
 */
import AuditPage from "./AuditPage";

export default function FoodAudit() {
  return <AuditPage industry="food" />;
}
