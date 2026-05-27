import { CCP2BForm } from "./CCP2BForm";
import type { CcpFormProps } from "./ccpFormTypes";
import type { Ccp2bFormData } from "./CCP2BForm";

// ★ PR-AN: CCP-3B 는 CCP-2B 와 동일한 양식 사용 (가열 온도 기준만 다름)
//   props 를 통과시켜 OCR 미리채움 / 신뢰도 시각화 / 콜백 모두 동일 지원.
export function CCP3BForm(props: CcpFormProps<Ccp2bFormData> = {}) {
  return (
    <CCP2BForm
      {...props}
      ccpType="CCP-3B"
      title={props.title ?? "CCP-3B: 가열공정 모니터링 기록서"}
    />
  );
}
