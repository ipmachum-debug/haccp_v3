/**
 * 식품 HACCP — Nonconforming 진입 (industry='food' 고정)
 * 페이지 컴포넌트는 NonconformingPage 가 모든 industry 공통.
 *
 * 기존 routers/haccp/nonconformingProduct (h_nonconforming_products) 와는 별개.
 * Strangler Fig — 점진 이주 (Y-2-1-d/e 에서 deprecated).
 */
import NonconformingPage from "./NonconformingPage";

export default function FoodNonconforming() {
  return <NonconformingPage industry="food" />;
}
