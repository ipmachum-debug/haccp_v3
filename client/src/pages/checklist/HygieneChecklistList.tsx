/**
 * 일반위생관리 체크리스트 목록 — 작성 화면이 저장하는 곳(공통 일지 h_generic_checklist_records, formType "hygiene_checklist")을 그대로 읽는다.
 * 2026-10-15 (Codex 일지 전수 점검 후속): 이전에는 쓰지 않는 옛 전용 테이블을 읽어, 저장한 기록이 목록에 나오지 않았다.
 * 옛 전용 테이블은 덤프 10/14 기준 0건 — 옮길 기록 없음.
 */
import { ClipboardCheck } from "lucide-react";
import ChecklistListPage from "@/components/checklist/ChecklistListPage";

export default function HygieneChecklistList() {
  return (
    <ChecklistListPage
      config={{
        formType: "hygiene_checklist",
        title: "일반위생관리 체크리스트",
        description: "일반위생관리 체크리스트를 관리합니다",
        icon: <ClipboardCheck className="h-5 w-5 text-green-600" />,
        basePath: "/hygiene/checklists",
        backPath: "/quality/checklists",
        dateLabel: "점검 일자",
      }}
    />
  );
}
