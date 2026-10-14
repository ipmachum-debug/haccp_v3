/**
 * 용수 사용 점검 목록 — 작성 화면이 저장하는 곳(공통 일지 h_generic_checklist_records, formType "water_usage_check")을 그대로 읽는다.
 * 2026-10-15 (Codex 일지 전수 점검): 이전에는 쓰지 않는 옛 전용 테이블을 읽어, 저장한 기록이 목록에 나오지 않았다.
 * 옛 전용 테이블은 덤프 10/14 기준 0건 — 옮길 기록 없음.
 */
import { Droplet } from "lucide-react";
import ChecklistListPage from "@/components/checklist/ChecklistListPage";

export default function WaterUsageCheckList() {
  return (
    <ChecklistListPage
      config={{
        formType: "water_usage_check",
        title: "용수 사용 점검",
        description: "용수 사용 점검 기록을 관리합니다",
        icon: <Droplet className="h-5 w-5 text-cyan-600" />,
        basePath: "/water-usage-check",
        backPath: "/quality/checklists",
      }}
    />
  );
}
