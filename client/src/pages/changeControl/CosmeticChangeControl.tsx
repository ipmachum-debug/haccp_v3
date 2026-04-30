/**
 * 화장품 GMP — Change Control 진입 (industry='cosmetic' 고정)
 * 페이지 컴포넌트는 ChangeControlPage 가 모든 industry 공통 (cross-cutting).
 */
import ChangeControlPage from "./ChangeControlPage";

export default function CosmeticChangeControl() {
  return <ChangeControlPage industry="cosmetic" />;
}
