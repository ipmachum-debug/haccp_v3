/**
 * 개선조치(CAPA) 기록 목록 — 작성 화면이 저장하는 곳(공통 일지 h_generic_checklist_records, formType "capa_record")을 그대로 읽는다.
 * 2026-10-15 (Codex 일지 전수 점검 후속): 이전에는 쓰지 않는 옛 전용 테이블을 읽어, 저장한 기록이 목록에 나오지 않았다.
 * 옛 전용 테이블은 덤프 10/14 기준 0건 — 옮길 기록 없음.
 */
import { Wrench } from "lucide-react";
import ChecklistListPage from "@/components/checklist/ChecklistListPage";

export default function CapaRecordList() {
  return (
    <ChecklistListPage
      config={{
        formType: "capa_record",
        title: "개선조치(CAPA) 기록",
        description: "개선조치(CAPA) 기록을 관리합니다",
        icon: <Wrench className="h-5 w-5 text-orange-600" />,
        basePath: "/capa-record",
        backPath: "/quality/checklists",
      }}
    />
  );
}
