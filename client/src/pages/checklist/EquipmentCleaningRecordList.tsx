/**
 * 설비 세척·소독 기록 목록 — 작성 화면이 저장하는 곳(공통 일지 h_generic_checklist_records, formType "equipment_cleaning_record")을 그대로 읽는다.
 * 2026-10-15 (Codex 일지 전수 점검 후속): 이전에는 쓰지 않는 옛 전용 테이블을 읽어, 저장한 기록이 목록에 나오지 않았다.
 * 옛 전용 테이블은 덤프 10/14 기준 0건 — 옮길 기록 없음.
 */
import { Sparkles } from "lucide-react";
import ChecklistListPage from "@/components/checklist/ChecklistListPage";

export default function EquipmentCleaningRecordList() {
  return (
    <ChecklistListPage
      config={{
        formType: "equipment_cleaning_record",
        title: "설비 세척·소독 기록",
        description: "설비 세척·소독 기록을 관리합니다",
        icon: <Sparkles className="h-5 w-5 text-teal-600" />,
        basePath: "/equipment-cleaning-record",
        backPath: "/quality/checklists",
        dateLabel: "세척일",
      }}
    />
  );
}
