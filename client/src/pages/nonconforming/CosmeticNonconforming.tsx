/**
 * 화장품 GMP — Nonconforming 진입 (industry='cosmetic' 고정)
 * 페이지 컴포넌트는 NonconformingPage 가 모든 industry 공통 (cross-cutting).
 */
import NonconformingPage from "./NonconformingPage";

export default function CosmeticNonconforming() {
  return <NonconformingPage industry="cosmetic" />;
}
