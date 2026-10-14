/**
 * CCP 관리 > 한계기준 설정 탭 (2026-10-14 정리)
 *
 * 이전: 제품별 한계기준(product_ccp_specs, 운영 데이터 0건) 화면이었지만
 *   - 목록은 서버 칸(온도·시간·압력)을 다른 이름(항목명·법적 기준…)으로 읽어 빈칸으로 보였고
 *   - 저장은 서버에 없는 API(ccpMonitoring.saveProductCcpSpec)를 불러 한 번도 동작하지 않았다.
 * 실제 CCP 한계기준의 정본은 공정 그룹 기준(ccp_process_groups, 운영 5건) — "CCP 한계기준 관리" 화면.
 * 동작하지 않는 입력 폼을 두는 대신 정본 화면으로 안내한다. (데이터·서버 변경 없음)
 */
import { Link } from "wouter";
import { ShieldCheck, ArrowRight } from "lucide-react";

export default function CcpLimitSettings() {
  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4 max-w-2xl">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-5 w-5 text-red-600 dark:text-red-400" />
        </span>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">CCP 한계기준은 공정 그룹 기준으로 관리합니다</h3>
          <p className="text-sm text-muted-foreground">
            가열·냉각·금속검출 등 공정 그룹마다 온도·시간·압력·pH 한계와 모니터링 방법, 개선조치를 정하고 제품을 묶습니다.
            CCP 공식 기록지와 AI 이탈 규칙이 이 기준을 참조합니다.
          </p>
        </div>
      </div>
      <Link href="/quality/ccp-limits"
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
        CCP 한계기준 관리 열기 <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
