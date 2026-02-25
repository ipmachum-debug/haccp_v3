import { CCP2BForm } from "./CCP2BForm";

// CCP-3B는 CCP-2B와 동일한 양식 사용 (가열 온도 기준만 다름)
export function CCP3BForm() {
  return <CCP2BForm />;
}
