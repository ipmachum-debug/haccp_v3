/**
 * 식품 HACCP — CAPA 진입 (industry='food' 고정)
 *
 * 기존 routers/haccp/correctiveAction (h_corrective_action_requests) 와는 별개.
 * Strangler Fig — 점진 이주.
 */
import CorrectiveActionPage from "./CorrectiveActionPage";

export default function FoodCorrectiveAction() {
  return <CorrectiveActionPage industry="food" />;
}
